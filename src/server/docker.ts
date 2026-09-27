import { exec, spawn, type ChildProcess } from 'child_process'
import type { Container, ActionResult, ContainerStats, VolumeInfo } from '../shared/types'
import { makeCache, makeInFlightGuard } from './cache'

const CACHE_TTL = 4000
const containerCache = makeCache<Container[]>(CACHE_TTL)
const statsCache = makeCache<ContainerStats[]>(CACHE_TTL)
const dedupeContainers = makeInFlightGuard()
const dedupeStats = makeInFlightGuard()

function runCmd(cmd: string, timeoutMs = 15000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    exec(cmd, { encoding: 'utf8', timeout: timeoutMs }, (err, stdout, stderr) => {
      let errOutput = stderr ?? ''
      // err.code vem null quando o processo é morto por timeout/sinal (não é um exit code
      // de verdade) — sem essa checagem, um comando abortado por timeout era reportado como sucesso.
      const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0
      if (err && !errOutput.trim() && err.killed) {
        errOutput = `comando não respondeu em ${timeoutMs / 1000}s (timeout)`
      }
      resolve({ stdout: stdout ?? '', stderr: errOutput, exitCode })
    })
  })
}

function buildCmd(command: string, distro?: string): string {
  return distro ? `wsl -d ${distro} -- ${command}` : command
}

/** Força o próximo listContainers a ir ao Docker (ex: após um script reiniciar containers). */
export function invalidateContainers(distro?: string): void {
  containerCache.invalidate(distro ?? '__default__')
}

export async function listContainers(distro?: string): Promise<Container[]> {
  const key = distro ?? '__default__'
  const cached = containerCache.get(key)
  if (cached) return cached

  return dedupeContainers(key, async () => {
    const cmd = buildCmd('docker ps -a --no-trunc --format "{{json .}}"', distro)
    const { stdout } = await runCmd(cmd)
    const containers: Container[] = []

    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const raw = JSON.parse(trimmed) as Record<string, string>
        containers.push({
          id: raw.ID ?? '',
          name: raw.Names?.replace(/^\//, '') ?? raw.ID,
          image: raw.Image ?? '',
          status: raw.Status ?? '',
          state: (raw.State?.toLowerCase() ?? 'dead') as Container['state'],
          ports: raw.Ports ?? ''
        })
      } catch {
        // linha malformada — ignorar
      }
    }
    containerCache.set(key, containers)
    return containers
  })
}

/**
 * `docker logs -f` do container — o chamador lê stdout/stderr enquanto quiser e mata o
 * processo ao terminar. null se o nome for inválido.
 */
export function followContainerLogs(name: string, distro: string | undefined, tail: number): ChildProcess | null {
  if (!SAFE_NAME_RE.test(name)) return null
  const args = ['logs', '-f', '--tail', String(tail), '--timestamps', name]
  // spawn sem shell: argumentos vão direto pro executável
  return distro
    ? spawn('wsl', ['-d', distro, '--', 'docker', ...args], { windowsHide: true })
    : spawn('docker', args, { windowsHide: true })
}

export async function getStats(distro?: string): Promise<ContainerStats[]> {
  const key = distro ?? '__default__'
  const cached = statsCache.get(key)
  if (cached) return cached

  return dedupeStats(key, async () => {
    const cmd = buildCmd('docker stats --no-stream --no-trunc --format "{{json .}}"', distro)
    const { stdout } = await runCmd(cmd)
    const stats: ContainerStats[] = []

    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const raw = JSON.parse(trimmed) as Record<string, string>
        stats.push({
          name: raw.Name ?? raw.Container ?? '',
          cpuPerc: raw.CPUPerc ?? '0.00%',
          memUsage: raw.MemUsage ?? '0B / 0B',
          memPerc: raw.MemPerc ?? '0.00%',
          netIO: raw.NetIO ?? '0B / 0B',
          blockIO: raw.BlockIO ?? '0B / 0B',
          pids: raw.PIDs ?? '0'
        })
      } catch {
        // linha malformada — ignorar
      }
    }
    statsCache.set(key, stats)
    return stats
  })
}

export function openTerminal(name: string, distro?: string): ActionResult {
  const args: string[] = ['--']
  if (distro) args.push('wsl', '-d', distro, '--')
  args.push('docker', 'exec', '-it', name, 'bash')

  const child = spawn('wt', args, { detached: true, stdio: 'ignore', shell: true })
  child.unref()
  return { success: true }
}

export async function containerAction(
  action: 'start' | 'stop' | 'restart',
  name: string,
  distro?: string
): Promise<ActionResult> {
  const cmd = buildCmd(`docker ${action} ${name}`, distro)
  // stop/restart podem demorar bem mais que 15s em containers com shutdown pesado
  // (ex: wta-develop) — timeout maior que o padrão de listagem para dar tempo real
  // ao docker fazer o graceful stop antes de desistir.
  const { stderr, exitCode } = await runCmd(cmd, 60000)
  if (exitCode !== 0) {
    return { success: false, error: stderr.trim() || `exit code ${exitCode}` }
  }
  // Invalida cache da distro afetada para o próximo poll refletir o novo estado
  containerCache.invalidate(distro ?? '__default__')
  return { success: true }
}

// Nomes de container/volume Docker só aceitam esses caracteres — validar antes de
// interpolar no comando evita injeção de shell numa operação sem volta (delete).
export const SAFE_NAME_RE = /^[A-Za-z0-9_.-]+$/

/** Volumes NOMEADOS anexados ao container (ignora bind mounts e volumes anônimos). */
export async function getContainerVolumes(name: string, distro?: string): Promise<string[]> {
  if (!SAFE_NAME_RE.test(name)) return []
  const cmd = buildCmd(`docker inspect ${name} --format "{{json .Mounts}}"`, distro)
  const { stdout, exitCode } = await runCmd(cmd)
  if (exitCode !== 0) return []
  try {
    const mounts = JSON.parse(stdout.trim()) as Array<{ Type: string; Name?: string }>
    return mounts.filter((m) => m.Type === 'volume' && m.Name).map((m) => m.Name as string)
  } catch {
    return []
  }
}

/**
 * Remove um container.
 * - removeVolumes = true: `rm -f -v` direto (os dados vão embora junto, então não importa
 *   um encerramento forçado) e depois `volume rm` dos volumes nomeados — `rm -v` sozinho
 *   só apaga volumes anônimos.
 * - removeVolumes = false: se estiver rodando, `stop -t 60` (SIGTERM, espera até 60s antes
 *   do Docker matar) para o volume mantido ficar consistente, e então `rm` sem `-v`.
 */
export async function deleteContainer(name: string, distro?: string, removeVolumes = false): Promise<ActionResult> {
  if (!SAFE_NAME_RE.test(name)) {
    return { success: false, error: `Nome de container inválido: "${name}"` }
  }
  const cacheKey = distro ?? '__default__'

  if (removeVolumes) {
    const volumes = await getContainerVolumes(name, distro)
    const rm = await runCmd(buildCmd(`docker rm -f -v ${name}`, distro), 60000)
    if (rm.exitCode !== 0) {
      return { success: false, error: rm.stderr.trim() || `Não foi possível remover o container "${name}".` }
    }
    containerCache.invalidate(cacheKey)

    const failed: string[] = []
    for (const vol of volumes) {
      if (!SAFE_NAME_RE.test(vol)) { failed.push(vol); continue }
      const { exitCode } = await runCmd(buildCmd(`docker volume rm ${vol}`, distro), 30000)
      if (exitCode !== 0) failed.push(vol)
    }
    if (failed.length > 0) {
      return {
        success: false,
        error: `Container "${name}" removido, mas falhou ao remover o(s) volume(s): ${failed.join(', ')} (pode estar em uso por outro container).`
      }
    }
    return { success: true }
  }

  const inspect = await runCmd(buildCmd(`docker inspect -f "{{.State.Status}}" ${name}`, distro))
  if (inspect.exitCode !== 0) {
    return { success: false, error: inspect.stderr.trim() || `Container "${name}" não encontrado.` }
  }
  const state = inspect.stdout.trim()
  if (state === 'running' || state === 'paused' || state === 'restarting') {
    // timeout do exec acima dos 60s do docker stop para não abortar antes do próprio Docker
    const stop = await runCmd(buildCmd(`docker stop -t 60 ${name}`, distro), 90000)
    if (stop.exitCode !== 0) {
      containerCache.invalidate(cacheKey)
      return { success: false, error: stop.stderr.trim() || `Não foi possível parar o container "${name}".` }
    }
  }

  const rm = await runCmd(buildCmd(`docker rm ${name}`, distro), 30000)
  containerCache.invalidate(cacheKey)
  if (rm.exitCode !== 0) {
    return { success: false, error: rm.stderr.trim() || `Não foi possível remover o container "${name}".` }
  }
  return { success: true }
}

/** Todos os volumes da distro, com os containers (rodando ou parados) que montam cada um. */
export async function listVolumes(distro?: string): Promise<VolumeInfo[]> {
  const [vols, ps] = await Promise.all([
    runCmd(buildCmd('docker volume ls --format "{{json .}}"', distro)),
    runCmd(buildCmd('docker ps -a --no-trunc --format "{{json .}}"', distro))
  ])

  // .Mounts do docker ps vem como "vol1,/caminho/bind,vol2" — nomes de volume e caminhos de bind
  const usage = new Map<string, string[]>()
  for (const line of ps.stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const raw = JSON.parse(line) as Record<string, string>
      for (const m of (raw.Mounts ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
        usage.set(m, [...(usage.get(m) ?? []), raw.Names])
      }
    } catch {
      // linha malformada — ignorar
    }
  }

  const volumes: VolumeInfo[] = []
  for (const line of vols.stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const raw = JSON.parse(line) as Record<string, string>
      if (raw.Name) volumes.push({ name: raw.Name, containers: usage.get(raw.Name) ?? [] })
    } catch {
      // linha malformada — ignorar
    }
  }
  return volumes.sort((a, b) => a.name.localeCompare(b.name))
}

/** Remove um volume. O Docker recusa se algum container (mesmo parado) ainda o usar. */
export async function deleteVolume(name: string, distro?: string): Promise<ActionResult> {
  if (!SAFE_NAME_RE.test(name)) {
    return { success: false, error: `Nome de volume inválido: "${name}"` }
  }
  const { stderr, exitCode } = await runCmd(buildCmd(`docker volume rm ${name}`, distro), 30000)
  if (exitCode !== 0) {
    return { success: false, error: stderr.trim() || `Não foi possível remover o volume "${name}".` }
  }
  return { success: true }
}
