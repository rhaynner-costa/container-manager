import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Environment, Container } from '../../../shared/types'

interface Props {
  environments: Environment[]
  selectedId: string | null
  containers: Container[]
  onSelect: (id: string) => void
  onAdd: () => void
  onEdit: (env: Environment) => void
  onDelete: (id: string) => void
}

export default function Sidebar({ environments, selectedId, containers, onSelect, onAdd, onEdit, onDelete }: Props) {
  // Online = pelo menos um container do ambiente rodando
  const isOnline = (env: Environment) =>
    containers.some((c) => c.state === 'running' && env.containers.some((s) => s.name === c.name))

  return (
    <aside className="w-56 shrink-0 bg-canvas-inset border-r border-border flex flex-col overflow-hidden">
      <div className="px-3 py-3 border-b border-border">
        <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wider">Ambientes</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        {environments.length === 0 && (
          <p className="text-xs text-fg-subtle text-center mt-6 px-4">Nenhum ambiente criado.</p>
        )}

        {environments.map((env) => {
          const online = isOnline(env)
          const isSelected = env.id === selectedId

          return (
            <div
              key={env.id}
              onClick={() => onSelect(env.id)}
              className={`group relative flex items-center gap-2 mx-1 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                isSelected ? 'bg-accent/10 text-fg' : 'text-fg-muted hover:bg-border/40 hover:text-fg'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: env.color }} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{env.name}</p>
                <p className="text-xs text-fg-subtle">
                  {env.containers.length} container{env.containers.length !== 1 ? 's' : ''}
                  {env.wslDistro && ` · ${env.wslDistro}`}
                </p>
              </div>

              {online && (
                <span className="shrink-0 group-hover:invisible px-1.5 py-0.5 rounded border border-success/40 bg-success/15 text-success text-[10px] font-medium leading-none">
                  online
                </span>
              )}

              <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-canvas-inset pl-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(env) }}
                  className="p-1 rounded hover:bg-border text-fg-subtle hover:text-fg transition-colors"
                  title="Editar"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Remover "${env.name}"?`)) onDelete(env.id) }}
                  className="p-1 rounded hover:bg-danger/20 text-fg-subtle hover:text-danger transition-colors"
                  title="Remover"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          )
        })}
      </nav>

      <div className="p-2 border-t border-border">
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-border/40 border border-dashed border-border/60 transition-colors"
        >
          <Plus size={12} />
          Novo ambiente
        </button>
      </div>
    </aside>
  )
}
