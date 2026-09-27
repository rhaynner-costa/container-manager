import { useState } from 'react'
import { Play, Square, RotateCcw, Server, ScrollText, Terminal, Loader } from 'lucide-react'
import type { Container } from '../../../shared/types'
import StatusBadge from './StatusBadge'

interface Props {
  container: Container
  onAction: (action: 'start' | 'stop' | 'restart', name: string) => Promise<void>
  onLogs: (name: string) => void
  onTerminal: (name: string) => void
  disabled?: boolean
}

function parsePorts(ports: string): string[] {
  if (!ports) return []
  return ports.split(',').map((p) => p.trim()).filter(Boolean)
}

export default function ContainerCard({ container, onAction, onLogs, onTerminal, disabled }: Props) {
  const [stopPending, setStopPending] = useState(false)
  const ports = parsePorts(container.ports)
  const isRunning = container.state === 'running'

  const handleStop = async () => {
    setStopPending(true)
    try {
      await onAction('stop', container.name)
    } finally {
      setStopPending(false)
    }
  }

  return (
    <div className="bg-canvas-subtle border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-border/80 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-border/30 shrink-0">
            <Server size={14} className="text-fg-muted" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg truncate" title={container.name}>
              {container.name}
            </p>
            <p className="text-xs text-fg-subtle truncate" title={container.image}>
              {container.image}
            </p>
          </div>
        </div>
        <StatusBadge state={container.state} />
      </div>

      {container.status && (
        <p className="text-xs text-fg-subtle truncate">{container.status}</p>
      )}

      {ports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ports.map((p) => (
            <span key={p} className="text-xs px-1.5 py-0.5 rounded bg-border/30 text-fg-muted font-mono">
              {p}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
        {!isRunning && (
          <Btn icon={<Play size={12} />} label="Start" onClick={() => onAction('start', container.name)} cls="text-success hover:bg-success/15" disabled={disabled} />
        )}
        {isRunning && (
          <button
            onClick={handleStop}
            disabled={disabled || stopPending}
            title="Stop"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors text-fg-muted text-danger hover:bg-danger/15 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stopPending ? <Loader size={12} className="animate-spin" /> : <Square size={12} />}
            Stop
          </button>
        )}
        <Btn icon={<RotateCcw size={12} />} label="Restart" onClick={() => onAction('restart', container.name)} cls="text-attention hover:bg-attention/15" disabled={disabled} />
        <div className="ml-auto flex items-center gap-1">
          {isRunning && (
            <Btn icon={<Terminal size={12} />} label="Terminal" onClick={() => onTerminal(container.name)} cls="text-fg-subtle hover:bg-border/40" />
          )}
          <Btn icon={<ScrollText size={12} />} label="Logs" onClick={() => onLogs(container.name)} cls="text-fg-subtle hover:bg-border/40" />
        </div>
      </div>
    </div>
  )
}

function Btn({ icon, label, onClick, cls, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; cls: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors text-fg-muted disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}>
      {icon}{label}
    </button>
  )
}
