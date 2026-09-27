import { AlertTriangle } from 'lucide-react'

interface Props {
  title: string
  confirmLabel: string
  danger?: boolean
  children?: React.ReactNode
  onConfirm: () => void
  onCancel: () => void
}

// Modal de confirmação genérico (mesmo visual do WslSwitchModal) — usado pelas ferramentas da aba Tools.
export default function ConfirmModal({ title, confirmLabel, danger, children, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-canvas-inset border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
            danger ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'
          }`}>
            <AlertTriangle size={18} />
          </div>
          <h2 className="text-sm font-semibold text-fg self-center break-all">{title}</h2>
        </div>

        {children}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              danger
                ? 'bg-danger/20 hover:bg-danger/30 text-danger border border-danger/40'
                : 'bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
