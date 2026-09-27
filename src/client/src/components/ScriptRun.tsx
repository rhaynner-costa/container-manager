import { useEffect, useRef, useState } from 'react'
import { Loader } from 'lucide-react'

// Peças comuns das tools que executam scripts: operação em andamento com cronômetro,
// faixa de progresso e painel de log ao vivo.

/** Estado da operação em andamento — avisa o App (trava de abas) e conta os segundos. */
export function useOperation(onOperationChange: (label: string | null) => void) {
  const [operation, setOperation] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  return { operation, setOperation, elapsed }
}

function formatElapsed(s: number): string {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`
}

export function ProgressBar({ label, elapsed }: { label: string; elapsed: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm font-medium">
      <Loader size={15} className="animate-spin shrink-0" />
      <span className="flex-1">{label}</span>
      <span className="text-xs font-mono tabular-nums">{formatElapsed(elapsed)}</span>
    </div>
  )
}

/** Log do script, sempre rolado para a última linha. */
export function LogPanel({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLPreElement | null>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])
  if (lines.length === 0) return null
  return (
    <pre
      ref={ref}
      className="max-h-64 overflow-auto p-3 rounded-lg bg-canvas-inset border border-border text-xs font-mono text-fg-muted whitespace-pre-wrap break-all"
    >
      {lines.join('\n')}
    </pre>
  )
}
