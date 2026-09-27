import { useState, useEffect } from 'react'
import { X, Check, Plus, Trash2, Loader2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { Environment, ContainerSlot, WslDistro, Container } from '../../../shared/types'
import { api } from '../api'

const ENV_COLORS = [
  '#58a6ff', '#3fb950', '#bc8cff', '#d29922',
  '#f85149', '#ec6cb9', '#2dd4bf', '#fb923c'
]

interface Props {
  editing: Environment | null
  distros: WslDistro[]
  allContainers: Container[]
  onSave: (env: Environment) => void
  onClose: () => void
}

export default function CreateEnvironmentModal({ editing, distros, allContainers, onSave, onClose }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(ENV_COLORS[0])
  const [wslDistro, setWslDistro] = useState('')
  const [slots, setSlots] = useState<ContainerSlot[]>([])
  const [manualInput, setManualInput] = useState('')
  const [modalContainers, setModalContainers] = useState<Container[]>(allContainers)
  const [loadingContainers, setLoadingContainers] = useState(false)

  // Sem opção de Docker Desktop: o padrão é sempre a distro WSL padrão
  const defaultDistro = (distros.find((d) => d.isDefault) ?? distros[0])?.name ?? ''

  useEffect(() => {
    if (editing) {
      setName(editing.name)
      setColor(editing.color)
      setWslDistro(editing.wslDistro ?? defaultDistro)
      setSlots(editing.containers)
    } else {
      setName(''); setColor(ENV_COLORS[0]); setWslDistro(defaultDistro); setSlots([])
    }
  }, [editing, defaultDistro])

  // Re-busca containers sempre que a distro WSL mudar no modal
  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      setLoadingContainers(true)
      try {
        const list = await api.docker.listContainers(wslDistro || undefined)
        if (!cancelled) setModalContainers(list)
      } catch {
        if (!cancelled) setModalContainers([])
      } finally {
        if (!cancelled) setLoadingContainers(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [wslDistro])

  const setDelay = (slotId: string, value: string) => {
    const n = parseInt(value, 10)
    setSlots((prev) =>
      prev.map((s) => s.id === slotId ? { ...s, delay: isNaN(n) || n <= 0 ? undefined : n } : s)
    )
  }

  const removeSlot = (slotId: string) => setSlots((prev) => prev.filter((s) => s.id !== slotId))

  const addFromDetected = (c: Container) => {
    setSlots((prev) => [...prev, { id: uuidv4(), name: c.name }])
  }

  const addManual = () => {
    const t = manualInput.trim()
    if (!t) return
    setSlots((prev) => [...prev, { id: uuidv4(), name: t }])
    setManualInput('')
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    onSave({
      id: editing?.id ?? uuidv4(),
      name: name.trim(),
      color,
      wslDistro: wslDistro || undefined,
      containers: slots
    })
  }

  // Containers detectados que ainda não estão nos slots
  const available = modalContainers.filter((c) => !slots.some((s) => s.name === c.name))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas-inset/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-canvas-subtle border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-fg">{editing ? 'Editar ambiente' : 'Novo ambiente'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-border/40 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-fg-muted">Nome do ambiente</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Dev, Staging, QA…" autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Cor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-fg-muted">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {ENV_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} style={{ backgroundColor: c }}
                  className="w-6 h-6 rounded-full transition-transform hover:scale-110 relative"
                >
                  {color === c && <Check size={12} className="absolute inset-0 m-auto text-white drop-shadow" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* WSL */}
          {distros.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-muted">
                Distro WSL
              </label>
              <select value={wslDistro} onChange={(e) => setWslDistro(e.target.value)}
                className="bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent transition-colors"
              >
                {distros.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} {d.state === 'Running' ? '● Running' : '○ Stopped'} (WSL{d.version})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Containers */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-fg-muted">Containers</label>

            {slots.length > 0 && (
              <div className="flex flex-col gap-1">
                {slots.map((slot, i) => {
                  const live = modalContainers.find((x) => x.name === slot.name)
                  const isLast = i === slots.length - 1
                  return (
                    <div key={slot.id} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-canvas rounded-lg border border-border">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-fg-subtle font-mono w-4 shrink-0">{i + 1}.</span>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${live?.state === 'running' ? 'bg-success' : 'bg-fg-subtle'}`} />
                          <span className="text-sm text-fg truncate font-mono">{slot.name}</span>
                          {live && <span className="text-xs text-fg-subtle truncate">{live.image}</span>}
                        </div>
                        <button onClick={() => removeSlot(slot.id)}
                          className="p-1 text-fg-subtle hover:text-danger transition-colors shrink-0">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {!isLast && (
                        <div className="flex items-center gap-2 pl-9 py-0.5">
                          <span className="text-xs text-fg-subtle">aguardar</span>
                          <input
                            type="number" min={0} max={300}
                            value={slot.delay || ''}
                            onChange={(e) => setDelay(slot.id, e.target.value)}
                            placeholder="0"
                            className="w-14 bg-canvas border border-border rounded px-2 py-0.5 text-xs text-fg text-center focus:outline-none focus:border-accent transition-colors font-mono"
                          />
                          <span className="text-xs text-fg-subtle">s antes do próximo</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {loadingContainers && (
              <div className="flex items-center gap-2 text-xs text-fg-subtle py-1">
                <Loader2 size={12} className="animate-spin" />
                Buscando containers…
              </div>
            )}

            {!loadingContainers && available.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-fg-subtle">
                  Containers detectados (WSL: {wslDistro}):
                </p>
                <div className="max-h-36 overflow-y-auto flex flex-col gap-1 border border-border rounded-lg p-1">
                  {available.map((c) => (
                    <button key={c.id} onClick={() => addFromDetected(c)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-border/30 text-left transition-colors group"
                    >
                      <Plus size={11} className="text-fg-subtle group-hover:text-accent shrink-0" />
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.state === 'running' ? 'bg-success' : 'bg-fg-subtle'}`} />
                      <span className="text-sm font-mono text-fg truncate">{c.name}</span>
                      <span className="text-xs text-fg-subtle truncate ml-auto">{c.image}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!loadingContainers && available.length === 0 && (
              <p className="text-xs text-fg-subtle italic px-1">
                {wslDistro
                  ? `Nenhum container encontrado em "${wslDistro}". Verifique se o Docker está rodando dentro da distro.`
                  : 'Nenhuma distro WSL encontrada. Adicione o nome do container manualmente.'}
              </p>
            )}

            <div className="flex gap-2">
              <input type="text" value={manualInput} onChange={(e) => setManualInput(e.target.value)}
                placeholder="Nome do container (manual)" onKeyDown={(e) => e.key === 'Enter' && addManual()}
                className="flex-1 bg-canvas border border-border rounded-lg px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent font-mono transition-colors"
              />
              <button onClick={addManual} disabled={!manualInput.trim()}
                className="px-3 py-1.5 rounded-lg text-xs bg-border/40 text-fg-muted hover:bg-border hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-border/40 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={!name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-canvas hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check size={14} />
            {editing ? 'Salvar alterações' : 'Criar ambiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
