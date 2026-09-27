import { useEffect, useRef, useState } from 'react'
import { X, ArrowDown } from 'lucide-react'
import { api } from '../api'

interface Props {
  containerName: string
  distro?: string
  onClose: () => void
}

// Linhas de histórico ao abrir; depois disso o log segue ao vivo
const TAIL = 200
// Limite do texto mantido na tela — o log ao vivo cresce sem parar
const MAX_CHARS = 500_000

export default function ContainerLogsModal({ containerName, distro, onClose }: Props) {
  const [logs, setLogs] = useState<string>('')
  const [status, setStatus] = useState<'connecting' | 'live' | 'ended' | 'error'>('connecting')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLPreElement>(null)

  // Acompanha o log ao vivo (docker logs -f). Fechar o modal aborta a conexão, e o
  // servidor encerra o processo.
  useEffect(() => {
    const ctrl = new AbortController()
    setLogs('')
    setStatus('connecting')
    api.docker.followLogs(containerName, distro, TAIL, (text) => {
      setStatus('live')
      setLogs((prev) => {
        const next = prev + text
        return next.length > MAX_CHARS ? next.slice(next.length - MAX_CHARS) : next
      })
    }, ctrl.signal)
      .then(() => setStatus('ended'))
      .catch(() => { if (!ctrl.signal.aborted) setStatus('error') })
    return () => ctrl.abort()
  }, [containerName, distro])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-canvas-inset border border-border rounded-xl shadow-2xl w-full max-w-[95vw] h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-fg font-mono truncate">{containerName}</span>
            {distro && <span className="text-xs text-fg-subtle">WSL: {distro}</span>}
            {status === 'live' && (
              <span className="flex items-center gap-1.5 text-xs text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />ao vivo
              </span>
            )}
            {status === 'ended' && <span className="text-xs text-fg-subtle">encerrado (container parado)</span>}
            {status === 'error' && <span className="text-xs text-danger">erro ao buscar logs</span>}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-border/40 transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Log output */}
        <pre
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 text-xs font-mono text-fg-muted leading-relaxed whitespace-pre-wrap break-all bg-canvas"
        >
          {logs || (status === 'connecting' ? 'Carregando…' : 'Sem logs disponíveis.')}
        </pre>

        {/* Auto-scroll indicator */}
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true)
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
            }}
            className="absolute bottom-6 right-8 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-canvas text-xs font-medium shadow-lg hover:bg-accent/80 transition-colors"
          >
            <ArrowDown size={12} />
            Final
          </button>
        )}
      </div>
    </div>
  )
}
