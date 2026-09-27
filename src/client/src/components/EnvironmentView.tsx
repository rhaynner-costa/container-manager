import { Play, Square, RotateCcw, Pencil, AlertTriangle, Timer } from 'lucide-react'
import type { Container, Environment } from '../../../shared/types'
import ContainerCard from './ContainerCard'

interface Props {
  environment: Environment
  allContainers: Container[]
  loading: boolean
  operationPending: boolean
  sequenceStatus: string | null
  onAction: (action: 'start' | 'stop' | 'restart', name: string) => Promise<void>
  onBulkAction: (action: 'start' | 'stop' | 'restart') => void
  onLogs: (name: string) => void
  onTerminal: (name: string) => void
  onEdit: () => void
}

export default function EnvironmentView({ environment, allContainers, loading, operationPending, sequenceStatus, onAction, onBulkAction, onLogs, onTerminal, onEdit }: Props) {
  const paired = environment.containers.map((slot) => ({
    slot,
    container: allContainers.find((c) => c.name === slot.name) ?? null
  }))

  const runningCount = paired.filter(({ container }) => container?.state === 'running').length
  const foundCount = paired.filter(({ container }) => container !== null).length
  const missingSlots = paired.filter(({ container }) => container === null)
  const hasDelays = environment.containers.some((s) => (s.delay ?? 0) > 0)

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0"
            style={{ backgroundColor: environment.color }}
          />
          <div>
            <h1 className="text-lg font-bold text-fg">{environment.name}</h1>
            <p className="text-xs text-fg-subtle">
              {runningCount}/{environment.containers.length} running
              {environment.wslDistro && ` · WSL: ${environment.wslDistro}`}
              {loading && ' · atualizando…'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg hover:bg-border/40 border border-border transition-colors"
          >
            <Pencil size={12} />Editar
          </button>
          <div className="w-px h-4 bg-border" />
          <BulkBtn icon={<Play size={12} />} label="Start todos" onClick={() => onBulkAction('start')} color="success" disabled={operationPending || foundCount === 0 || runningCount === foundCount} />
          <BulkBtn icon={<Square size={12} />} label="Stop todos" onClick={() => onBulkAction('stop')} color="danger" disabled={operationPending || runningCount === 0} />
          <BulkBtn icon={<RotateCcw size={12} />} label="Restart todos" onClick={() => onBulkAction('restart')} color="attention" disabled={operationPending || runningCount === 0} />
        </div>
      </div>

      {sequenceStatus && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-xs font-medium">
          <Timer size={13} className="shrink-0 animate-pulse" />
          {sequenceStatus}
        </div>
      )}

      {paired.filter(({ container }) => container !== null).length > 0 ? (
        hasDelays ? (
          <div className="flex flex-col gap-1.5">
            {paired.map(({ slot, container }, i) => {
              if (!container) return null
              const isLast = i === paired.length - 1
              return (
                <div key={slot.id} className="flex flex-col gap-1">
                  <ContainerCard container={container} onAction={onAction} onLogs={onLogs} onTerminal={onTerminal} disabled={operationPending} />
                  {!isLast && (slot.delay ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5 pl-3 text-xs text-fg-subtle">
                      <Timer size={11} />
                      <span>{slot.delay}s antes do próximo</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paired.map(({ slot, container }) =>
              container ? (
                <ContainerCard key={slot.id} container={container} onAction={onAction} onLogs={onLogs} onTerminal={onTerminal} disabled={operationPending} />
              ) : null
            )}
          </div>
        )
      ) : (
        <div className="border border-dashed border-border rounded-xl p-8 text-center">
          <p className="text-fg-muted text-sm">
            {environment.containers.length === 0
              ? 'Nenhum container associado a este ambiente.'
              : 'Containers não encontrados no Docker.'}
          </p>
          {environment.containers.length === 0 && (
            <button onClick={onEdit} className="mt-3 text-xs text-accent hover:underline">
              Adicionar containers →
            </button>
          )}
        </div>
      )}

      {missingSlots.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-attention/10 border border-attention/30 text-attention text-xs">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              {missingSlots.length} container{missingSlots.length > 1 ? 's' : ''} não encontrado{missingSlots.length > 1 ? 's' : ''} no Docker:
            </p>
            <p className="mt-0.5 text-fg-muted font-mono">{missingSlots.map(({ slot }) => slot.name).join(', ')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function BulkBtn({ icon, label, onClick, color, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; color: 'success' | 'danger' | 'attention'; disabled?: boolean }) {
  const cls = { success: 'text-success hover:bg-success/15', danger: 'text-danger hover:bg-danger/15', attention: 'text-attention hover:bg-attention/15' }[color]
  return (
    <button onClick={onClick} disabled={disabled} title={label} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-transparent hover:border-current/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}>
      {icon}{label}
    </button>
  )
}
