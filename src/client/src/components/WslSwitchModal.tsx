import { AlertTriangle, Play, Square } from 'lucide-react'
import type { WslDistro, Container } from '../../../shared/types'

interface Props {
  action: 'start' | 'terminate'
  distro: WslDistro
  runningContainers: Container[]
  onConfirm: () => void
  onCancel: () => void
}

export default function WslSwitchModal({ action, distro, runningContainers, onConfirm, onCancel }: Props) {
  const isTerminate = action === 'terminate'
  const hasRunning = runningContainers.length > 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-canvas-inset border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
            isTerminate && hasRunning
              ? 'bg-warning/15 text-warning'
              : isTerminate
              ? 'bg-danger/15 text-danger'
              : 'bg-success/15 text-success'
          }`}>
            {isTerminate && hasRunning
              ? <AlertTriangle size={18} />
              : isTerminate
              ? <Square size={18} />
              : <Play size={18} />
            }
          </div>

          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-fg">
              {isTerminate ? `Encerrar ${distro.name}?` : `Iniciar ${distro.name}?`}
            </h2>
            <p className="text-xs text-fg-muted">
              {isTerminate
                ? 'A distro WSL será encerrada com todos os seus processos.'
                : 'A distro WSL será iniciada e ficará disponível para gerenciamento.'}
            </p>
          </div>
        </div>

        {isTerminate && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-attention/10 border border-attention/30 text-attention text-xs">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>Todas as distros WSL serão encerradas (<code className="font-mono">wsl --shutdown</code>), não apenas <strong className="font-mono">{distro.name}</strong>.</span>
          </div>
        )}

        {isTerminate && hasRunning && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2.5 flex flex-col gap-1.5">
            <p className="text-xs font-medium text-danger">
              Containers em execução que serão parados:
            </p>
            <ul className="flex flex-col gap-0.5">
              {runningContainers.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5 text-xs text-fg-muted font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger/70 shrink-0" />
                  {c.name}
                  <span className="text-fg-subtle">({c.state})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg transition-colors"
          >
            {isTerminate && hasRunning ? 'Fechar' : 'Cancelar'}
          </button>
          {!(isTerminate && hasRunning) && (
            <button
              onClick={onConfirm}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                isTerminate
                  ? 'bg-danger/20 hover:bg-danger/30 text-danger border border-danger/40'
                  : 'bg-success/20 hover:bg-success/30 text-success border border-success/40'
              }`}
            >
              {isTerminate ? 'Encerrar' : 'Iniciar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
