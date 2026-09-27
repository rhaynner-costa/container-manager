import { useCallback, useEffect, useRef, useState } from 'react'
import { HardDrive, Loader, RefreshCw, Trash2 } from 'lucide-react'
import type { VolumeInfo } from '../../../shared/types'
import { api } from '../api'
import ConfirmModal from './ConfirmModal'
import ToolCard from './ToolCard'

interface Props {
  distro: string
  notify: (msg: string, type?: 'ok' | 'err') => void
  onOperationChange: (label: string | null) => void
  /** Outra ferramenta da aba está rodando */
  locked?: boolean
  /** Muda quando outra ferramenta altera os containers — força recarregar a lista */
  reloadKey?: number
}

// Tool: apaga um volume Docker. O Docker recusa remover volume montado por qualquer
// container (mesmo parado), então a ferramenta mostra quem usa e só libera volumes livres.
export default function DeleteVolumeTool({ distro, notify, onOperationChange, reloadKey, locked }: Props) {
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [operation, setOperation] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selected = volumes.find((v) => v.name === target) ?? null
  const inUse = !!selected && selected.containers.length > 0

  const fetchVolumes = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.docker.listVolumes(distro)
      setVolumes(list)
      setTarget((t) => (list.some((v) => v.name === t) ? t : ''))
    } catch {
      setVolumes([])
    } finally {
      setLoading(false)
    }
  }, [distro])

  useEffect(() => {
    setTarget('')
    fetchVolumes()
  }, [fetchVolumes])

  useEffect(() => {
    if (reloadKey) fetchVolumes()
  }, [reloadKey, fetchVolumes])

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
    setOperation(`Removendo volume ${name}…`)
    try {
      const res = await api.docker.deleteVolume(name, distro)
      if (res.success) {
        notify(`Volume "${name}" removido.`)
        setTarget('')
      } else {
        notify(`Erro: ${res.error ?? 'falha ao remover.'}`, 'err')
      }
    } catch (e) {
      notify(`Erro: ${(e as Error).message}`, 'err')
    } finally {
      setOperation(null)
      await fetchVolumes()
    }
  }

  const busy = !!operation

  return (
    <ToolCard
      icon={HardDrive}
      title="Apagar volume"
      description="Remove um volume Docker que não esteja em uso por nenhum container"
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
          <label className="text-xs text-fg-subtle">Volume</label>
          <div className="flex items-center gap-3">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy || loading}
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg bg-canvas border border-border text-fg focus:outline-none focus:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="">{loading ? 'Carregando…' : volumes.length === 0 ? 'Nenhum volume encontrado' : 'Selecione um volume…'}</option>
              {volumes.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}{v.containers.length > 0 ? ` (em uso: ${v.containers.join(', ')})` : ' (sem uso)'}
                </option>
              ))}
            </select>
            <button
              onClick={fetchVolumes}
              disabled={loading || busy}
              title="Recarregar lista"
              className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {selected && (
          inUse ? (
            <p className="text-xs text-attention">
              Em uso por <strong className="font-mono">{selected.containers.join(', ')}</strong>. O Docker só permite
              apagar o volume depois que esse(s) container(s) forem removidos (mesmo parados).
            </p>
          ) : (
            <p className="text-xs text-fg-muted">Nenhum container usa este volume.</p>
          )
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!target || inUse || busy}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={12} />Apagar
        </button>
      </div>

      {confirmOpen && (
        <ConfirmModal
          title={`Apagar volume ${target}?`}
          confirmLabel="Apagar"
          danger
          onConfirm={runDelete}
          onCancel={() => setConfirmOpen(false)}
        >
          <p className="text-xs text-danger">Todos os dados do volume serão apagados. Ação irreversível.</p>
        </ConfirmModal>
      )}
    </ToolCard>
  )
}
