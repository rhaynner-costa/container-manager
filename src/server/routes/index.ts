import { Router } from 'express'
import { randomUUID } from 'crypto'
import { listContainers, containerAction, followContainerLogs, getStats, openTerminal, getContainerVolumes, deleteContainer, listVolumes, deleteVolume } from '../docker'
import { listDistros, startDistro, terminateDistro, shutdownWsl, exportDistro, importDistro, unregisterDistro } from '../wsl'
import { openFilePicker, openFolderPicker } from '../dialog'
import { startNetskopeCert, getScriptJob, netskopeCertSaved, listRmanCopies, startRmanBackup, startRmanRestore, startQaEnv } from '../scripts'
import { loadConfig, saveEnvironment, deleteEnvironment, deleteEnvironmentsByDistro, setSnapshotsDir, listSnapshots } from '../config'
import type { Environment, ActionResult } from '../../shared/types'

export const apiRouter = Router()

// null = em andamento, ActionResult = concluído, number = timestamp de conclusão (ms)
const jobs = new Map<string, ActionResult | null>()
const jobsCompletedAt = new Map<string, number>()

// Remove jobs concluídos há mais de 5 minutos para evitar leak
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000
  for (const [id, ts] of jobsCompletedAt) {
    if (ts < cutoff) { jobs.delete(id); jobsCompletedAt.delete(id) }
  }
}, 60_000)

// ── Docker ──────────────────────────────────────────────────────────────────

apiRouter.get('/docker/containers', async (req, res) => {
  const distro = req.query.distro as string | undefined
  const containers = await listContainers(distro)
  res.json(containers)
})

apiRouter.get('/docker/stats', async (req, res) => {
  const distro = req.query.distro as string | undefined
  res.json(await getStats(distro))
})

// Logs ao vivo (docker logs -f): a resposta fica aberta enviando o texto conforme chega,
// até o client fechar a conexão — aí o processo é encerrado.
apiRouter.get('/docker/logs', (req, res) => {
  const { name, distro, tail } = req.query as { name?: string; distro?: string; tail?: string }
  if (!name) return res.status(400).json({ error: 'name obrigatório' })
  const child = followContainerLogs(name, distro, Math.min(Math.max(parseInt(tail ?? '', 10) || 200, 1), 5000))
  if (!child) return res.status(400).json({ error: `Nome de container inválido: "${name}"` })

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' })
  child.stdout?.on('data', (chunk) => res.write(chunk))
  child.stderr?.on('data', (chunk) => res.write(chunk))
  child.on('close', () => res.end())
  res.on('close', () => child.kill())
})

apiRouter.post('/docker/terminal', (req, res) => {
  const { name, distro } = req.body as { name: string; distro?: string }
  if (!name) return res.status(400).json({ success: false, error: 'name obrigatório' })
  res.json(openTerminal(name, distro))
})

apiRouter.post('/docker/:action(start|stop|restart)', async (req, res) => {
  const action = req.params.action as 'start' | 'stop' | 'restart'
  const { name, distro } = req.body as { name: string; distro?: string }
  if (!name) return res.status(400).json({ success: false, error: 'name obrigatório' })
  const result = await containerAction(action, name, distro)
  res.json(result)
})

apiRouter.get('/docker/containers/:name/volumes', async (req, res) => {
  const distro = req.query.distro as string | undefined
  res.json(await getContainerVolumes(req.params.name, distro))
})

apiRouter.delete('/docker/containers/:name', async (req, res) => {
  const distro = req.query.distro as string | undefined
  const removeVolumes = req.query.volumes === '1'
  res.json(await deleteContainer(req.params.name, distro, removeVolumes))
})

apiRouter.get('/docker/volumes', async (req, res) => {
  const distro = req.query.distro as string | undefined
  res.json(await listVolumes(distro))
})

apiRouter.delete('/docker/volumes/:name', async (req, res) => {
  const distro = req.query.distro as string | undefined
  res.json(await deleteVolume(req.params.name, distro))
})

// ── Tools (scripts) ─────────────────────────────────────────────────────────

apiRouter.get('/tools/netskope-cert/status', (_req, res) => {
  res.json({ certSaved: netskopeCertSaved() })
})

apiRouter.post('/tools/netskope-cert', (req, res) => {
  const { container, distro } = req.body as { container?: string; distro?: string }
  if (!container || !distro) return res.status(400).json({ error: 'container e distro obrigatórios' })
  const result = startNetskopeCert(container, distro)
  if (!result.jobId) return res.status(400).json({ error: result.error })
  res.json({ jobId: result.jobId })
})

apiRouter.get('/tools/rman/copies', (_req, res) => {
  res.json(listRmanCopies())
})

apiRouter.post('/tools/rman/backup', (req, res) => {
  const { container, distro } = req.body as { container?: string; distro?: string }
  if (!container || !distro) return res.status(400).json({ error: 'container e distro obrigatórios' })
  const result = startRmanBackup(container, distro)
  if (!result.jobId) return res.status(400).json({ error: result.error })
  res.json({ jobId: result.jobId })
})

apiRouter.post('/tools/rman/restore', (req, res) => {
  const { copy, destino, usuario, senha, distro } = req.body as {
    copy?: string; destino?: string; usuario?: string; senha?: string; distro?: string
  }
  if (!copy || !destino || !usuario || !senha || !distro) {
    return res.status(400).json({ error: 'copy, destino, usuario, senha e distro obrigatórios' })
  }
  const result = startRmanRestore(copy, destino, usuario, senha, distro)
  if (!result.jobId) return res.status(400).json({ error: result.error })
  res.json({ jobId: result.jobId })
})

apiRouter.post('/tools/qa/:action(start|stop)', (req, res) => {
  const { wta, wsh } = req.body as { wta?: boolean; wsh?: boolean }
  const result = startQaEnv(req.params.action as 'start' | 'stop', { wta: !!wta, wsh: !!wsh })
  if (!result.jobId) return res.status(400).json({ error: result.error })
  res.json({ jobId: result.jobId })
})

apiRouter.get('/tools/job/:id', (req, res) => {
  const since = parseInt(req.query.since as string, 10) || 0
  const job = getScriptJob(req.params.id, since)
  if (!job) return res.status(404).json({ error: 'job não encontrado' })
  res.json(job)
})

// ── WSL ─────────────────────────────────────────────────────────────────────

apiRouter.get('/wsl/distros', async (_req, res) => {
  const distros = await listDistros()
  res.json(distros)
})

apiRouter.post('/wsl/start', async (req, res) => {
  const { name } = req.body as { name: string }
  if (!name) return res.status(400).json({ success: false, error: 'name obrigatório' })
  res.json(await startDistro(name))
})

apiRouter.post('/wsl/terminate', async (req, res) => {
  const { name } = req.body as { name: string }
  if (!name) return res.status(400).json({ success: false, error: 'name obrigatório' })
  res.json(await terminateDistro(name))
})

apiRouter.post('/wsl/shutdown', async (_req, res) => {
  res.json(await shutdownWsl())
})

apiRouter.post('/wsl/export', (req, res) => {
  const { name, filePath } = req.body as { name: string; filePath: string }
  if (!name || !filePath) return res.status(400).json({ success: false, error: 'name e filePath obrigatórios' })
  const jobId = randomUUID()
  jobs.set(jobId, null)
  exportDistro(name, filePath)
    .then((result) => { jobs.set(jobId, result); jobsCompletedAt.set(jobId, Date.now()) })
    .catch((e: Error) => { jobs.set(jobId, { success: false, error: e.message }); jobsCompletedAt.set(jobId, Date.now()) })
  res.json({ jobId })
})

apiRouter.post('/wsl/import', (req, res) => {
  const { name, installDir, tarPath } = req.body as { name: string; installDir: string; tarPath: string }
  if (!name || !installDir || !tarPath) return res.status(400).json({ success: false, error: 'name, installDir e tarPath obrigatórios' })
  const jobId = randomUUID()
  jobs.set(jobId, null)
  importDistro(name, installDir, tarPath)
    .then((result) => { jobs.set(jobId, result); jobsCompletedAt.set(jobId, Date.now()) })
    .catch((e: Error) => { jobs.set(jobId, { success: false, error: e.message }); jobsCompletedAt.set(jobId, Date.now()) })
  res.json({ jobId })
})

apiRouter.get('/wsl/job/:id', (req, res) => {
  const job = jobs.get(req.params.id)
  if (job === undefined) return res.status(404).json({ error: 'job não encontrado' })
  if (job === null) return res.json({ done: false })
  res.json({ done: true, ...job })
  jobs.delete(req.params.id)
  jobsCompletedAt.delete(req.params.id)
})

apiRouter.get('/wsl/snapshots', (req, res) => {
  const dir = req.query.dir as string
  if (!dir) return res.status(400).json({ error: 'dir obrigatório' })
  res.json(listSnapshots(dir))
})

apiRouter.delete('/wsl/distros/:name', async (req, res) => {
  const { name } = req.params
  if (!name) return res.status(400).json({ success: false, error: 'name obrigatório' })
  const result = await unregisterDistro(name)
  if (result.success) deleteEnvironmentsByDistro(name)
  res.json(result)
})

// ── Config ──────────────────────────────────────────────────────────────────

apiRouter.get('/config', (_req, res) => {
  res.json(loadConfig())
})

apiRouter.put('/config/environments', (req, res) => {
  const env = req.body as Environment
  if (!env?.id || !env?.name) return res.status(400).json({ error: 'env inválido' })
  res.json(saveEnvironment(env))
})

apiRouter.delete('/config/environments/:id', (req, res) => {
  res.json(deleteEnvironment(req.params.id))
})

// ── Dialog ───────────────────────────────────────────────────────────────────

apiRouter.post('/dialog/file', async (req, res) => {
  const { title, filter } = req.body as { title?: string; filter?: string }
  const path = await openFilePicker(title, filter)
  res.json({ path })
})

apiRouter.post('/dialog/folder', async (req, res) => {
  const { title } = req.body as { title?: string }
  const path = await openFolderPicker(title)
  res.json({ path })
})

apiRouter.put('/config/snapshots-dir', (req, res) => {
  const { dir } = req.body as { dir: string }
  if (!dir) return res.status(400).json({ error: 'dir obrigatório' })
  res.json(setSnapshotsDir(dir))
})
