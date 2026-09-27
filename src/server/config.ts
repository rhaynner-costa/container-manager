import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'
import type { AppConfig, Environment, SnapshotFile } from '../shared/types'

function getConfigDir(): string {
  const dir = path.join(os.homedir(), '.container-manager')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'environments.json')
}

export function loadConfig(): AppConfig {
  const filePath = getConfigPath()
  if (!fs.existsSync(filePath)) return { environments: [] }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as any
    // Migrate old format: containers: string[], delays: Record<string,number> → ContainerSlot[]
    if (raw.environments) {
      let dirty = false
      raw.environments = raw.environments.map((env: any) => {
        if (Array.isArray(env.containers) && typeof env.containers[0] === 'string') {
          const delays: Record<string, number> = env.delays ?? {}
          env.containers = (env.containers as string[]).map((name: string) => ({
            id: randomUUID(),
            name,
            ...(delays[name] > 0 ? { delay: delays[name] } : {})
          }))
          delete env.delays
          dirty = true
        }
        return env
      })
      // Persiste migração imediatamente para não repetir a cada boot
      if (dirty) fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf-8')
    }
    return raw as AppConfig
  } catch {
    return { environments: [] }
  }
}

export function saveEnvironment(env: Environment): AppConfig {
  const cfg = loadConfig()
  const idx = cfg.environments.findIndex((e) => e.id === env.id)
  if (idx >= 0) cfg.environments[idx] = env
  else cfg.environments.push(env)
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
  return cfg
}

export function deleteEnvironment(id: string): AppConfig {
  const cfg = loadConfig()
  cfg.environments = cfg.environments.filter((e) => e.id !== id)
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
  return cfg
}

export function deleteEnvironmentsByDistro(distroName: string): AppConfig {
  const cfg = loadConfig()
  cfg.environments = cfg.environments.filter((e) => e.wslDistro !== distroName)
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
  return cfg
}

export function setSnapshotsDir(dir: string): AppConfig {
  const cfg = loadConfig()
  cfg.snapshotsDir = dir
  fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
  return cfg
}

export function listSnapshots(dir: string): SnapshotFile[] {
  if (!fs.existsSync(dir)) return []
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.tar'))
      .map((f) => {
        const full = path.join(dir, f)
        const stat = fs.statSync(full)
        return {
          name: f,
          path: full,
          sizeBytes: stat.size,
          createdAt: stat.birthtime.toISOString()
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}
