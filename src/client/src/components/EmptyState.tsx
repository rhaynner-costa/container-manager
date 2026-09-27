import { LayoutGrid, Plus } from 'lucide-react'

interface Props { onAdd: () => void }

export default function EmptyState({ onAdd }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      <div className="p-4 rounded-2xl bg-border/20">
        <LayoutGrid size={40} className="text-fg-subtle" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-fg">Nenhum ambiente configurado</h2>
        <p className="text-sm text-fg-muted mt-1">Crie um ambiente e associe seus containers Docker a ele.</p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-canvas text-sm font-medium hover:bg-accent/80 transition-colors"
      >
        <Plus size={15} />
        Criar primeiro ambiente
      </button>
    </div>
  )
}
