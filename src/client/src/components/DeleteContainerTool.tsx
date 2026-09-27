import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2, Loader, RefreshCw, HardDrive } from 'lucide-react'
import type { Container } from '../../../shared/types'
import { api } from '../api'
import StatusBadge from './StatusBadge'
import ConfirmModal from './ConfirmModal'
import ToolCard from './ToolCard'

interface Props {
  distro: string
  notify: (msg: string, type?: 'ok' | 'err') => void
  onOperationChange: (label: string | null) => void
  /** Outra ferramenta da aba está rodando */
  locked?: boolean
  onContainersChanged: () => void
}

const ACTIVE_STATES = ['running', 'paused', 'restarting']

// Tool: apaga um container. Sem a flag de volume faz stop limpo (até 60s) e mantém o
// volume; com a flag força a remoção e apaga os volumes nomeados junto.
export default function DeleteContainerTool({ distro, notify, onOperationChange, onContainersChanged, locked }: Props) {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState('')
  const [volumes, setVolumes] = useState<string[]>([])
  const [loadingVolumes, setLoadingVolumes] = useState(false)
  const [removeVolumes, setRemoveVolumes] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [operation, setOperation] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selected = containers.find((c) => c.name === target) ?? null
  const isActive = !!selected && ACTIVE_STATES.includes(selected.state)

  const fetchContainers = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.docker.listContainers(distro)
      setContainers(list)
      // Se o container selecionado sumiu (ex: removido por fora), limpa a seleção
      setTarget((t) => (list.some((c) => c.name === t) ? t : ''))
    } catch {
      setContainers([])
    } finally {
      setLoading(false)
    }
  }, [distro])

  // Recarrega e limpa a seleção ao trocar de distro — evita apagar um container
  // de uma distro usando o nome selecionado em outra.
  useEffect(() => {
    setTarget('')
    fetchContainers()
  }, [fetchContainers])

  // Botão de refresh: recarrega a lista e os volumes, e desmarca a flag de volume
  const refresh = () => {
    setRefreshKey((k) => k + 1)
    fetchContainers()
  }

  // Volumes nomeados do container selecionado, pra mostrar o que será afetado
  useEffect(() => {
    setRemoveVolumes(false)
    if (!target) { setVolumes([]); return }
    let cancelled = false
    setLoadingVolumes(true)
    api.docker.volumes(target, distro)
      .then((v) => { if (!cancelled) setVolumes(v) })
      .catch(() => { if (!cancelled) setVolumes([]) })
      .finally(() => { if (!cancelled) setLoadingVolumes(false) })
    return () => { cancelled = true }
  }, [target, distro, refreshKey])

  useEffect(() => {
    onOperationChange(operation)
    if (operation) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation])

  const runDelete = async () => {
    if (!target) return
    setConfirmOpen(false)
    const name = target
    const withVolumes = removeVolumes && volumes.length > 0
    setOperation(!withVolumes && isActive ? `Parando e removendo ${name}…` : `Removendo ${name}…`)
    try {
      const res = await api.docker.deleteContainer(name, distro, withVolumes)
      if (res.success) {
        notify(withVolumes ? `Container "${name}" e volume(s) removidos.` : `Container "${name}" removido.`)
        setTarget('')
      } else {
        notify(`Erro: ${res.error ?? 'falha ao remover.'}`, 'err')
      }
    } catch (e) {
      notify(`Erro: ${(e as Error).message}`, 'err')
    } finally {
      setOperation(null)
      await fetchContainers()
      onContainersChanged()
    }
  }

  const busy = !!operation

  return (
    <ToolCard
      icon={Trash2}
      title="Apagar container"
      description="Remove um container e, opcionalmente, seus volumes"
      tone="danger"
      busy={busy}
      locked={locked}
    >

      {operation && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm font-medium">
          <Loader size={15} className="animate-spin shrink-0" />
          <span className="flex-1">{operation}</span>
          <span className="text-xs font-mono tabular-nums">{elapsed}s</span>
        </div>
      )}

      <div className="flex flex-col gap-3 max-w-lg">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Container</label>
          <div className="flex items-center gap-3">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy || loading}
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg bg-canvas border border-border text-fg focus:outline-none focus:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="">{loading ? 'Carregando…' : containers.length === 0 ? 'Nenhum container encontrado' : 'Selecione um container…'}</option>
              {containers.map((c) => (
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
            {selected && <StatusBadge state={selected.state} size="sm" />}
          </div>
        </div>

        {target && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-fg-subtle flex items-center gap-1.5"><HardDrive size={11} />Volumes nomeados</label>
              {loadingVolumes ? (
                <p className="text-xs text-fg-muted">Verificando…</p>
              ) : volumes.length === 0 ? (
                <p className="text-xs text-fg-muted">Nenhum volume nomeado anexado a este container.</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {volumes.map((v) => (
                    <li key={v} className="text-xs font-mono text-fg-muted truncate">{v}</li>
                  ))}
                </ul>
              )}
            </div>

            <label className={`flex items-center gap-2 text-xs ${volumes.length === 0 ? 'text-fg-subtle opacity-50 cursor-not-allowed' : 'text-fg cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={removeVolumes}
                onChange={(e) => setRemoveVolumes(e.target.checked)}
                disabled={busy || loadingVolumes || volumes.length === 0}
              />
              Apagar também os volumes
            </label>
          </>
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!target || busy || loadingVolumes}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={12} />Apagar
        </button>
      </div>

      {confirmOpen && (
        <ConfirmModal
          title={`Apagar ${target}?`}
          confirmLabel="Apagar"
          danger
          onConfirm={runDelete}
          onCancel={() => setConfirmOpen(false)}
        >
          <div className="flex flex-col gap-2 text-xs text-fg-muted">
            {removeVolumes ? (
              <>
                <p>O container será removido.</p>
                <p className="text-danger">
                  Volume(s) apagado(s) junto: <strong className="font-mono">{volumes.join(', ')}</strong>. Ação irreversível.
                </p>
              </>
            ) : (
              <>
                {isActive
                  ? <p>O container está em execução: será parado (<code className="font-mono">docker stop</code>, aguardando até 60s) e depois removido.</p>
                  : <p>O container será removido.</p>}
                <p>{volumes.length > 0 ? 'Os volumes serão mantidos intactos.' : 'Nenhum volume nomeado será afetado.'}</p>
              </>
            )}
          </div>
        </ConfirmModal>
      )}
    </ToolCard>
  )
}
