import { exec } from 'child_process'
import * as fs from 'fs'
import type { WslDistro, ActionResult } from '../shared/types'
import { makeCache, makeInFlightGuard } from './cache'

const distroCache = makeCache<WslDistro[]>(4000)
const WSL_STATES = new Set(['Running', 'Stopped', 'Installing', 'Converting', 'Uninstalling'])
const dedupeDistros = makeInFlightGuard()

function runBuffer(cmd: string): Promise<Buffer> {
  return new Promise((resolve) => {
    exec(cmd, { encoding: 'buffer', timeout: 10000 }, (_err, stdout) => {
      resolve(stdout ?? Buffer.alloc(0))
    })
  })
}

function run(cmd: string, timeoutMs = 15000): Promise<ActionResult> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs }, (err) => {
      if (err) resolve({ success: false, error: err.message })
      else resolve({ success: true })
    })
  })
}

export async function listDistros(): Promise<WslDistro[]> {
  const cached = distroCache.get('distros')
  if (cached) return cached

  return dedupeDistros('distros', async () => {
    // wsl --list --verbose emite UTF-16 LE no Windows
    const buf = await runBuffer('wsl --list --verbose')
    const text = buf.toString('utf16le')
    const distros: WslDistro[] = []

    const lines = text.replace(/\r/g, '').split('\n')
    for (const line of lines.slice(1)) {
      const trimmed = line.replace(/\0/g, '').trim()
      if (!trimmed) continue

      const isDefault = trimmed.startsWith('*')
      const parts = trimmed.replace(/^\*\s*/, '').split(/\s+/)
      // Só aceita linhas no formato da tabela "[*] NOME ESTADO VERSÃO". Sem distros
      // instaladas o WSL imprime uma mensagem de texto no lugar da tabela, e cada
      // frase dela virava uma distro fantasma ("Você", "Use"…).
      if (parts.length !== 3 || !WSL_STATES.has(parts[1]) || !/^[12]$/.test(parts[2])) continue

      const name = parts[0]
      // Installing/Converting/Uninstalling contam como paradas para a UI
      const state = parts[1] === 'Running' ? 'Running' : 'Stopped'
      const version = parseInt(parts[2], 10)

      // distros internas do Docker Desktop — ignorar
      if (name === 'docker-desktop' || name === 'docker-desktop-data') continue

      distros.push({ name, state, version: isNaN(version) ? 2 : version, isDefault })
    }
    distroCache.set('distros', distros)
    return distros
  })
}

export async function startDistro(name: string): Promise<ActionResult> {
  distroCache.invalidate()
  return run(`wsl -d ${name} -- echo ready`)
}

export async function terminateDistro(name: string): Promise<ActionResult> {
  distroCache.invalidate()
  return run(`wsl --terminate ${name}`, 30000)
}

export function shutdownWsl(): Promise<ActionResult> {
  return run('wsl --shutdown', 30000)
}

export async function exportDistro(name: string, filePath: string): Promise<ActionResult> {
  const shutdown = await shutdownWsl()
  if (!shutdown.success) return shutdown
  // timeout 0 = sem limite (export pode demorar muitos minutos)
  return run(`wsl --export "${name}" "${filePath}"`, 0)
}

export async function importDistro(name: string, installDir: string, tarPath: string): Promise<ActionResult> {
  try {
    fs.mkdirSync(installDir, { recursive: true })
  } catch (e) {
    return { success: false, error: `Não foi possível criar o diretório "${installDir}": ${(e as Error).message}` }
  }
  const shutdown = await shutdownWsl()
  if (!shutdown.success) return shutdown
  return run(`wsl --import "${name}" "${installDir}" "${tarPath}"`, 0)
}

export function unregisterDistro(name: string): Promise<ActionResult> {
  return run(`wsl --unregister ${name}`, 30000)
}
