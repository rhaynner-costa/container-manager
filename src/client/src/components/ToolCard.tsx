import { useEffect, useState } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description: string
  /** Cor do ícone: 'danger' para ferramentas destrutivas */
  tone?: 'accent' | 'danger'
  /** Operação em andamento: abre o card e mostra um indicador pulsante quando fechado */
  busy?: boolean
  /** Outra ferramenta está rodando: desabilita todos os controles do card até ela terminar */
  locked?: boolean
  children: React.ReactNode
}

// Card recolhível da aba Tools — cada ferramenta fica fechada por padrão e abre ao
// clicar no cabeçalho, deixando a aba compacta mesmo com várias ferramentas.
export default function ToolCard({ icon: Icon, title, description, tone = 'accent', busy, locked, children }: Props) {
  const [expanded, setExpanded] = useState(false)

  // Ao iniciar uma operação, abre pra não deixar o progresso escondido
  useEffect(() => {
    if (busy) setExpanded(true)
  }, [busy])

  const iconCls = tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'

  return (
    <div className="rounded-xl border border-border bg-canvas-subtle overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-border/20 transition-colors"
      >
        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${iconCls}`}>
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-fg flex items-center gap-1.5">
            {title}
            {busy && !expanded && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />}
          </p>
          <p className="text-xs text-fg-subtle truncate">{description}</p>
        </div>
        <ChevronDown size={15} className={`shrink-0 text-fg-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <fieldset disabled={locked} className="px-4 pb-4 pt-3 border-t border-border flex flex-col gap-4 min-w-0">
          {locked && (
            <p className="text-xs text-attention">Aguarde: outra ferramenta está em execução.</p>
          )}
          <div className={`flex flex-col gap-4 ${locked ? 'opacity-50' : ''}`}>{children}</div>
        </fieldset>
      )}
    </div>
  )
}
