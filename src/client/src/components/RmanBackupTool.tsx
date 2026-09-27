import { useCallback, useEffect, useState } from 'react'
import { DatabaseBackup, RefreshCw, FolderOpen } from 'lucide-react'
import type { Container } from '../../../shared/types'
import { api } from '../api'
import ConfirmModal from './ConfirmModal'
import ToolCard from './ToolCard'
import { useOperation, ProgressBar, LogPanel } from './ScriptRun'

interface Props {
  distro: string
  notify: (msg: string, type?: 'ok' | 'err') => void
  onOperationChange: (label: string | null) => void
  /** Outra ferramenta da aba está rodando */
  locked?: boolean
  onContainersChanged: () => void
  onBackupDone: () => void
}

// Mesmo caminho de RMAN_COPIES_DIR em src/server/scripts.ts
const COPIES_DIR = 'C:\\WSL\\rman'

// Tool: roda scripts/bkp_rman.sh no container Oracle escolhido e copia o backup para
// C:\WSL\rman\<container>_<data> — fora da distro, sobrevive à perda dela.
export default function RmanBackupTool({ distro, notify, onOperationChange, onContainersChanged, onBackupDone, locked }: Props) {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { operation, setOperation, elapsed } = useOperation(onOperationChange)
  const [log, setLog] = useState<string[]>([])

  const oracle = containers.filter((c) => c.image.toLowerCase().includes('oracle'))

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.docker.listContainers(distro)
      setContainers(list)
      setTarget((t) => (list.some((c) => c.name === t) ? t : ''))
    } catch {
      setContainers([])
    } finally {
      setLoading(false)
    }
  }, [distro])

  useEffect(() => {
    setTarget('')
    refresh()
  }, [refresh])

  const run = async () => {
    if (!target) return
    setConfirmOpen(false)
    const name = target
    setLog([])
    setOperation(`Backup RMAN de ${name}…`)
    try {
      const res = await api.tools.rmanBackup(name, distro, (lines) => setLog((prev) => [...prev, ...lines]))
      if (res.success && res.warning) notify(`Backup de "${name}" concluído, mas com erros no log — confira.`, 'err')
      else if (res.success) notify(`Backup de "${name}" concluído e copiado para ${COPIES_DIR}.`)
      else notify(`Erro: ${res.error ?? 'falha no backup.'}`, 'err')
      if (res.success) onBackupDone()
    } catch (e) {
      notify(`Erro: ${(e as Error).message}`, 'err')
    } finally {
      setOperation(null)
      await refresh()
      onContainersChanged()
    }
  }

  const busy = !!operation

  return (
    <ToolCard
      icon={DatabaseBackup}
      title="Backup RMAN"
      description="Backup full do Oracle via RMAN, com cópia guardada no Windows"
      busy={busy}
      locked={locked}
    >
      {operation && <ProgressBar label={operation} elapsed={elapsed} />}

      <div className="flex flex-col gap-3 max-w-lg">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Container Oracle</label>
          <div className="flex items-center gap-3">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy || loading}
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg bg-canvas border border-border text-fg focus:outline-none focus:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="">{loading ? 'Carregando…' : oracle.length === 0 ? 'Nenhum container Oracle encontrado' : 'Selecione um container…'}</option>
              {oracle.map((c) => (
                <option key={c.id} value={c.name}>{c.name} — {c.image} ({c.state})</option>
              ))}
            </select>
            <button
              onClick={refresh}
              disabled={loading || busy}
              title="Recarregar lista"
              className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <p className="text-xs text-fg-muted flex items-center gap-1.5">
          <FolderOpen size={12} className="shrink-0" />Cópia salva em <code className="font-mono">{COPIES_DIR}</code>
        </p>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!target || busy}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <DatabaseBackup size={12} />Fazer backup
        </button>
      </div>

      <LogPanel lines={log} />

      {confirmOpen && (
        <ConfirmModal
          title={`Backup RMAN de ${target}?`}
          confirmLabel="Fazer backup"
          onConfirm={run}
          onCancel={() => setConfirmOpen(false)}
        >
          <div className="flex flex-col gap-2 text-xs text-fg-muted">
            <p>O banco será <strong className="text-fg">reiniciado</strong> durante o backup (shutdown → mount → backup → open).</p>
            <p>O backup anterior deste container <strong className="text-fg">na distro</strong> será substituído. As cópias já guardadas no Windows são mantidas.</p>
          </div>
        </ConfirmModal>
      )}
    </ToolCard>
  )
}
