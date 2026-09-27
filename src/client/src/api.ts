import type { Container, WslDistro, Environment, AppConfig, ActionResult, ContainerStats, SnapshotFile, VolumeInfo, ScriptJobStatus, RmanCopy } from '../../shared/types'

const BASE = '/api'

async function pollJob(jobId: string): Promise<ActionResult> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await get<{ done: boolean; success?: boolean; error?: string }>(`/wsl/job/${jobId}`)
    if (res.done) return { success: res.success ?? false, error: res.error }
  }
}

// Acompanha um job de script: repassa as linhas novas de saída a cada consulta
export type ScriptResult = ActionResult & { warning?: boolean }

async function pollScriptJob(jobId: string, onLines: (lines: string[]) => void): Promise<ScriptResult> {
  let since = 0
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000))
    const res = await get<ScriptJobStatus>(`/tools/job/${jobId}?since=${since}`)
    if (res.lines.length > 0) {
      since += res.lines.length
      onLines(res.lines)
    }
    if (res.done) return { success: res.success ?? false, warning: res.warning, error: res.error }
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    // Usa a mensagem { error } da rota quando houver, em vez do status genérico
    const body = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `POST ${path} → ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  docker: {
    listContainers: (distro?: string) =>
      get<Container[]>(`/docker/containers${distro ? `?distro=${encodeURIComponent(distro)}` : ''}`),
    start: (name: string, distro?: string) =>
      post<ActionResult>('/docker/start', { name, distro }),
    stop: (name: string, distro?: string) =>
      post<ActionResult>('/docker/stop', { name, distro }),
    restart: (name: string, distro?: string) =>
      post<ActionResult>('/docker/restart', { name, distro }),
    terminal: (name: string, distro?: string) =>
      post<ActionResult>('/docker/terminal', { name, distro }),
    /** docker logs -f: chama onText a cada pedaço de log até o signal abortar (ou o container parar) */
    followLogs: async (name: string, distro: string | undefined, tail: number, onText: (text: string) => void, signal: AbortSignal) => {
      const params = new URLSearchParams({ name, tail: String(tail) })
      if (distro) params.set('distro', distro)
      const res = await fetch(`${BASE}/docker/logs?${params}`, { signal })
      if (!res.ok || !res.body) throw new Error(`GET /docker/logs → ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        onText(decoder.decode(value, { stream: true }))
      }
    },
    stats: (distro?: string) =>
      get<ContainerStats[]>(`/docker/stats${distro ? `?distro=${encodeURIComponent(distro)}` : ''}`),
    volumes: (name: string, distro?: string) =>
      get<string[]>(`/docker/containers/${encodeURIComponent(name)}/volumes${distro ? `?distro=${encodeURIComponent(distro)}` : ''}`),
    listVolumes: (distro?: string) =>
      get<VolumeInfo[]>(`/docker/volumes${distro ? `?distro=${encodeURIComponent(distro)}` : ''}`),
    deleteVolume: (name: string, distro?: string) =>
      del<ActionResult>(`/docker/volumes/${encodeURIComponent(name)}${distro ? `?distro=${encodeURIComponent(distro)}` : ''}`),
    deleteContainer: (name: string, distro: string | undefined, removeVolumes: boolean) => {
      const params = new URLSearchParams({ volumes: removeVolumes ? '1' : '0' })
      if (distro) params.set('distro', distro)
      return del<ActionResult>(`/docker/containers/${encodeURIComponent(name)}?${params}`)
    }
  },
  wsl: {
    listDistros: () => get<WslDistro[]>('/wsl/distros'),
    start: (name: string) => post<ActionResult>('/wsl/start', { name }),
    terminate: (name: string) => post<ActionResult>('/wsl/terminate', { name }),
    shutdown: () => post<ActionResult>('/wsl/shutdown', {}),
    export: async (name: string, filePath: string) => {
      const { jobId } = await post<{ jobId: string }>('/wsl/export', { name, filePath })
      return pollJob(jobId)
    },
    import: async (name: string, installDir: string, tarPath: string) => {
      const { jobId } = await post<{ jobId: string }>('/wsl/import', { name, installDir, tarPath })
      return pollJob(jobId)
    },
    snapshots: (dir: string) => get<SnapshotFile[]>(`/wsl/snapshots?dir=${encodeURIComponent(dir)}`),
    unregister: (name: string) => del<ActionResult>(`/wsl/distros/${encodeURIComponent(name)}`)
  },
  config: {
    getAll: () => get<AppConfig>('/config'),
    saveEnvironment: (env: Environment) => put<AppConfig>('/config/environments', env),
    deleteEnvironment: (id: string) => del<AppConfig>(`/config/environments/${id}`),
    setSnapshotsDir: (dir: string) => put<AppConfig>('/config/snapshots-dir', { dir })
  },
  tools: {
    netskopeStatus: () => get<{ certSaved: boolean }>('/tools/netskope-cert/status'),
    netskopeCert: async (container: string, distro: string, onLines: (lines: string[]) => void) => {
      const { jobId } = await post<{ jobId: string }>('/tools/netskope-cert', { container, distro })
      return pollScriptJob(jobId, onLines)
    },
    qaRun: async (action: 'start' | 'stop', opts: { wta: boolean; wsh: boolean }, onLines: (lines: string[]) => void) => {
      const { jobId } = await post<{ jobId: string }>(`/tools/qa/${action}`, opts)
      return pollScriptJob(jobId, onLines)
    },
    rmanCopies: () => get<RmanCopy[]>('/tools/rman/copies'),
    rmanBackup: async (container: string, distro: string, onLines: (lines: string[]) => void) => {
      const { jobId } = await post<{ jobId: string }>('/tools/rman/backup', { container, distro })
      return pollScriptJob(jobId, onLines)
    },
    rmanRestore: async (
      copy: string, destino: string, usuario: string, senha: string, distro: string, onLines: (lines: string[]) => void
    ) => {
      const { jobId } = await post<{ jobId: string }>('/tools/rman/restore', { copy, destino, usuario, senha, distro })
      return pollScriptJob(jobId, onLines)
    }
  },
  dialog: {
    file: (title?: string, filter?: string) =>
      post<{ path: string | null }>('/dialog/file', { title, filter }),
    folder: (title?: string) =>
      post<{ path: string | null }>('/dialog/folder', { title })
  }
}
