import { spawn, execFile, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type { ScriptJobStatus, RmanCopy, ServiceStatus } from '../shared/types'
import { SAFE_NAME_RE, invalidateContainers } from './docker'

// Pasta scripts/ na raiz do projeto — mesmo nível relativo em dev (src/server) e build (dist/server)
const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts')
const NETSKOPE_SCRIPT = 'fix-netskope-cert-docker.sh'
// O script salva o certificado em ./certs relativo ao diretório de execução (scripts/)
const NETSKOPE_CERT_FILE = path.join(SCRIPTS_DIR, 'certs', 'netskope-totvs-root.crt')

const RMAN_BACKUP_SCRIPT = 'bkp_rman.sh'
const RMAN_RESTORE_SCRIPT = 'restore_rman.sh'
// Onde os scripts RMAN leem/gravam os backups dentro da distro
const DISTRO_RMAN_DIR = '/opt/dumps/bkp_rman'
// Cópias no Windows, fora da distro: C:\WSL\rman\<container>_<AAAA-MM-DD_HHhMM>
const RMAN_COPIES_DIR = 'C:\\WSL\\rman'
const RMAN_COPY_RE = /^(.+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})h(\d{2})$/
// Usuário/senha vão direto num ALTER USER do restore_rman.sh — só identificadores simples
const ORACLE_IDENT_RE = /^[A-Za-z][A-Za-z0-9_]*$/
// sqlplus -S dos scripts não aborta em erro: um job "ok" com isso no log recebe warning
const ORACLE_ERROR_RE = /\b(ORA|RMAN|SP2)-\d{4,5}\b/

interface ScriptJob {
  done: boolean
  success?: boolean
  warning?: boolean
  error?: string
  lines: string[]
  finishedAt?: number
}

interface Step {
  /** Linha escrita no log antes da etapa (etapas que não são scripts não imprimem nada sozinhas) */
  label?: string
  /** Argumentos depois de `wsl -d <distro> [--cd scripts] --` */
  args: string[]
  /** Executa a partir da pasta scripts/ (necessário para rodar ./script.sh) */
  inScriptsDir?: boolean
  /** Roda mesmo se uma etapa anterior falhou (ex: limpeza) e não altera o resultado do job */
  always?: boolean
}

const jobs = new Map<string, ScriptJob>()

// Remove jobs concluídos há mais de 5 minutos para evitar leak
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(id)
  }
}, 60_000)

// Bytes 0x80–0xFF da página de código OEM CP850 — é nela que net.exe/cmd escrevem, mesmo com chcp 65001
const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ '

function decodeCp850(buf: Buffer): string {
  let s = ''
  for (const b of buf) s += b < 0x80 ? String.fromCharCode(b) : CP850_HIGH[b - 0x80]
  return s
}

/** Joga a saída (stdout + stderr) do processo no log do job, linha a linha; resolve com o exit code. */
function captureOutput(child: ChildProcess, job: ScriptJob, decode: (b: Buffer) => string = (b) => b.toString('utf8')): Promise<number> {
  return new Promise((resolve) => {
    let pending = ''
    const push = (chunk: Buffer) => {
      pending += decode(chunk)
      const parts = pending.split(/\r?\n/)
      pending = parts.pop() ?? ''
      job.lines.push(...parts)
    }
    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    child.on('error', (e) => { job.lines.push(`[ERRO] ${e.message}`); resolve(-1) })
    child.on('close', (code) => {
      if (pending) job.lines.push(pending)
      resolve(code ?? -1)
    })
  })
}

/** Executa uma etapa na distro guardando a saída no log do job; resolve com o exit code. */
function runStep(distro: string, step: Step, job: ScriptJob): Promise<number> {
  if (step.label) job.lines.push(step.label)
  const wslArgs = ['-d', distro, ...(step.inScriptsDir ? ['--cd', SCRIPTS_DIR] : []), '--', ...step.args]
  // spawn sem shell: os argumentos vão direto pro wsl.exe, sem interpretação de cmd.exe
  return captureOutput(spawn('wsl', wslArgs, { windowsHide: true }), job)
}

/**
 * Roda as etapas em sequência, em background, parando na primeira falha (exceto as
 * marcadas como `always`). O client acompanha pelo log via getScriptJob.
 */
function startJob(distro: string, steps: Step[], onFinish?: () => void): string {
  const id = randomUUID()
  const job: ScriptJob = { done: false, lines: [] }
  jobs.set(id, job)

  ;(async () => {
    let error: string | undefined
    for (const step of steps) {
      if (error && !step.always) continue
      const code = await runStep(distro, step, job)
      if (code !== 0 && !error && !step.always) error = `Etapa terminou com código ${code} — veja o log.`
    }
    job.done = true
    job.success = !error
    job.error = error
    job.warning = !error && job.lines.some((l) => ORACLE_ERROR_RE.test(l))
    job.finishedAt = Date.now()
    onFinish?.()
  })()

  return id
}

export function getScriptJob(id: string, since = 0): ScriptJobStatus | null {
  const job = jobs.get(id)
  if (!job) return null
  const status: ScriptJobStatus = {
    done: job.done, success: job.success, warning: job.warning, error: job.error, lines: job.lines.slice(since)
  }
  if (job.done) jobs.delete(id)
  return status
}

/** C:\Docker\rman → /mnt/c/Docker/rman (só caminhos com letra de unidade) */
function toWslPath(winPath: string): string | null {
  const m = /^([A-Za-z]):[\\/]*(.*)$/.exec(winPath.trim())
  if (!m) return null
  const rest = m[2].replace(/\\/g, '/').replace(/\/+$/, '')
  return `/mnt/${m[1].toLowerCase()}${rest ? `/${rest}` : ''}`
}

function scriptExists(script: string): boolean {
  return fs.existsSync(path.join(SCRIPTS_DIR, script))
}

// ── Netskope ────────────────────────────────────────────────────────────────

export function netskopeCertSaved(): boolean {
  return fs.existsSync(NETSKOPE_CERT_FILE)
}

export function startNetskopeCert(container: string, distro: string): { jobId?: string; error?: string } {
  if (!SAFE_NAME_RE.test(container)) return { error: `Nome de container inválido: "${container}"` }
  if (!scriptExists(NETSKOPE_SCRIPT)) return { error: `Script não encontrado: scripts/${NETSKOPE_SCRIPT}` }
  // O script reinicia o container no final
  const jobId = startJob(
    distro,
    [{ args: ['bash', `./${NETSKOPE_SCRIPT}`, '--container', container], inScriptsDir: true }],
    () => invalidateContainers(distro)
  )
  return { jobId }
}

// ── RMAN ────────────────────────────────────────────────────────────────────

function isCompleteBackup(dir: string): boolean {
  let files: string[]
  try {
    files = fs.readdirSync(dir)
  } catch {
    return false
  }
  return files.includes('init_clone.ora')
    && files.some((f) => f.startsWith('controlfile_') && f.endsWith('.bkp'))
    && files.some((f) => f.startsWith('db_') && f.endsWith('.bkp'))
}

/** Cópias completas de backup RMAN guardadas no Windows, das mais novas para as mais antigas. */
export function listRmanCopies(): RmanCopy[] {
  const base = RMAN_COPIES_DIR
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(base, { withFileTypes: true })
  } catch {
    return []
  }

  const copies: RmanCopy[] = []
  for (const entry of entries) {
    const m = RMAN_COPY_RE.exec(entry.name)
    if (!entry.isDirectory() || !m || !SAFE_NAME_RE.test(entry.name)) continue
    const dir = path.join(base, entry.name)
    if (!isCompleteBackup(dir)) continue // incompleta (ex: cópia interrompida)

    let sizeBytes = 0
    for (const f of fs.readdirSync(dir)) {
      try { sizeBytes += fs.statSync(path.join(dir, f)).size } catch { /* removido no meio */ }
    }
    const [, container, y, mo, d, h, mi] = m
    copies.push({
      name: entry.name,
      container,
      createdAt: new Date(+y, +mo - 1, +d, +h, +mi).toISOString(),
      sizeBytes
    })
  }
  return copies.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}`
}

/** Backup RMAN na distro e, se der certo, cópia para C:\WSL\rman\<container>_<data>. */
export function startRmanBackup(container: string, distro: string): { jobId?: string; error?: string } {
  if (!SAFE_NAME_RE.test(container)) return { error: `Nome de container inválido: "${container}"` }
  if (!scriptExists(RMAN_BACKUP_SCRIPT)) return { error: `Script não encontrado: scripts/${RMAN_BACKUP_SCRIPT}` }
  const wslCopies = toWslPath(RMAN_COPIES_DIR) as string

  const copyName = `${container}_${nowStamp()}`
  if (fs.existsSync(path.join(RMAN_COPIES_DIR, copyName))) {
    return { error: `Já existe uma cópia "${copyName}". Aguarde um minuto e tente novamente.` }
  }
  try {
    fs.mkdirSync(RMAN_COPIES_DIR, { recursive: true })
  } catch (e) {
    return { error: `Não foi possível criar "${RMAN_COPIES_DIR}": ${(e as Error).message}` }
  }

  const jobId = startJob(
    distro,
    [
      { args: ['bash', `./${RMAN_BACKUP_SCRIPT}`, '--container', container], inScriptsDir: true },
      {
        label: `>>> Copiando backup para o Windows: ${path.join(RMAN_COPIES_DIR, copyName)}...`,
        args: ['cp', '-r', `${DISTRO_RMAN_DIR}/${container}`, `${wslCopies}/${copyName}`]
      },
      { label: '>>> Cópia concluída.', args: ['du', '-sh', `${wslCopies}/${copyName}`] }
    ],
    () => invalidateContainers(distro)
  )
  return { jobId }
}

/**
 * Restore a partir de uma cópia do Windows: devolve a cópia para /opt/dumps/bkp_rman/<cópia>
 * na distro, roda o restore_rman.sh com --origem <cópia> e remove a cópia temporária.
 */
export function startRmanRestore(
  copy: string, destino: string, usuario: string, senha: string, distro: string
): { jobId?: string; error?: string } {
  if (!scriptExists(RMAN_RESTORE_SCRIPT)) return { error: `Script não encontrado: scripts/${RMAN_RESTORE_SCRIPT}` }
  const m = RMAN_COPY_RE.exec(copy)
  if (!m || !SAFE_NAME_RE.test(copy)) return { error: `Cópia inválida: "${copy}"` }
  if (!SAFE_NAME_RE.test(destino)) return { error: `Nome de container inválido: "${destino}"` }
  if (!ORACLE_IDENT_RE.test(usuario)) return { error: 'Usuário inválido: use só letras, números e _ (começando por letra).' }
  if (!ORACLE_IDENT_RE.test(senha)) return { error: 'Senha inválida: use só letras, números e _ (começando por letra).' }

  const winCopy = path.join(RMAN_COPIES_DIR, copy)
  if (!isCompleteBackup(winCopy)) return { error: `Cópia incompleta ou inexistente: ${winCopy}` }
  const wslCopy = toWslPath(winCopy) as string

  const distroCopy = `${DISTRO_RMAN_DIR}/${copy}`
  const jobId = startJob(
    distro,
    [
      { label: `>>> Trazendo a cópia ${copy} do Windows para a distro...`, args: ['rm', '-rf', distroCopy] },
      { args: ['cp', '-r', wslCopy, distroCopy] },
      {
        args: ['bash', `./${RMAN_RESTORE_SCRIPT}`, '--origem', copy, '--destino', destino, '--usuario', usuario, '--senha', senha],
        inScriptsDir: true
      },
      { label: '>>> Removendo a cópia temporária da distro...', args: ['rm', '-rf', distroCopy], always: true }
    ],
    () => invalidateContainers(distro)
  )
  return { jobId }
}

// ── Ambiente QA Mississauga (serviços Windows) ──────────────────────────────

const QA_START_BAT = 'oracle_start.bat'
const QA_STOP_BAT = 'oracle_stop.bat'
const SERVICE_NAME_RE = /^[A-Za-z0-9_.-]+$/

/** Serviços citados nas linhas `net start/stop "<serviço>"` dos .bat, na ordem do start. */
function qaServices(): string[] {
  const names: string[] = []
  for (const bat of [QA_START_BAT, QA_STOP_BAT]) {
    let text = ''
    try { text = fs.readFileSync(path.join(SCRIPTS_DIR, bat), 'utf8') } catch { continue }
    for (const m of text.matchAll(/net\s+(?:start|stop)\s+"([^"]+)"/gi)) {
      if (SERVICE_NAME_RE.test(m[1]) && !names.includes(m[1])) names.push(m[1])
    }
  }
  return names
}

/** Estado atual de cada serviço do ambiente QA (Running, Stopped, … ou NotFound). */
function qaServicesStatus(): Promise<ServiceStatus[]> {
  const names = qaServices()
  if (names.length === 0) return Promise.resolve([])
  const script = `foreach ($n in @(${names.map((n) => `'${n}'`).join(',')})) { ` +
    `$s = Get-Service -Name $n -ErrorAction SilentlyContinue; ` +
    `if ($s) { "$n=$($s.Status)" } else { "$n=NotFound" } }`
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20000 }, (_err, stdout) => {
      const status = new Map<string, string>()
      for (const line of (stdout ?? '').split(/\r?\n/)) {
        const i = line.indexOf('=')
        if (i > 0) status.set(line.slice(0, i).trim(), line.slice(i + 1).trim())
      }
      resolve(names.map((name) => ({ name, status: status.get(name) ?? 'Unknown' })))
    })
  })
}

/**
 * Roda oracle_start.bat / oracle_stop.bat. Os .bat perguntam (choice) se sobem WTA e WSH —
 * as respostas vão pelo stdin. O exit code deles não serve (terminam num `timeout` que falha
 * sem console), então o log termina com o estado dos serviços para o usuário conferir.
 */
export function startQaEnv(action: 'start' | 'stop', opts: { wta: boolean; wsh: boolean }): { jobId?: string; error?: string } {
  const bat = action === 'start' ? QA_START_BAT : QA_STOP_BAT
  if (!scriptExists(bat)) return { error: `Script não encontrado: scripts/${bat}` }

  const id = randomUUID()
  const job: ScriptJob = { done: false, lines: [] }
  jobs.set(id, job)

  ;(async () => {
    const child = spawn('cmd.exe', ['/d', '/c', path.join(SCRIPTS_DIR, bat)], { cwd: SCRIPTS_DIR, windowsHide: true })
    if (action === 'start') child.stdin?.write(`${opts.wta ? 'S' : 'N'}\r\n${opts.wsh ? 'S' : 'N'}\r\n`)
    child.stdin?.end()
    await captureOutput(child, job, decodeCp850)

    job.lines.push('', '==> Estado dos serviços:')
    for (const s of await qaServicesStatus()) job.lines.push(`    ${s.name}: ${s.status}`)

    const notAdmin = job.lines.some((l) => l.includes('Execute como Administrador'))
    job.done = true
    job.success = !notAdmin
    job.error = notAdmin ? 'O .bat exige Administrador: inicie o Container Manager com "Executar como administrador".' : undefined
    job.finishedAt = Date.now()
  })()

  return { jobId: id }
}
