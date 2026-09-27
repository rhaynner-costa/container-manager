import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Cpu, MemoryStick, Network, HardDrive, Activity } from 'lucide-react'
import type { ContainerStats, WslDistro } from '../../../shared/types'
import { api } from '../api'

interface Props {
  distros: WslDistro[]
  active: boolean
}

function parsePerc(val: string): number {
  return parseFloat(val.replace('%', '')) || 0
}

function PercBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-border/50 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-fg-muted w-12 text-right shrink-0">{value.toFixed(1)}%</span>
    </div>
  )
}

export default function StatsView({ distros, active }: Props) {
  const [stats, setStats] = useState<ContainerStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const mainDistro = distros.find((d) => d.isDefault) ?? distros[0] ?? null

  const fetchStats = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const data = await api.docker.stats(mainDistro?.name)
      if (controller.signal.aborted) return
      setStats(data)
      setLastRefresh(new Date())
    } catch {
      if (controller.signal.aborted) return
      setError('Não foi possível buscar stats. Docker está rodando?')
      setStats([])
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [mainDistro?.name])

  // Atualização ao vivo (tipo `docker stats`) somente enquanto a aba Recursos está aberta.
  // Ao sair da aba o interval é destruído imediatamente — zero polling fantasma em segundo
  // plano, então nenhum processo `docker`/`wsl` continua sendo disparado sem o usuário ver.
  useEffect(() => {
    if (!active) return
    fetchStats()
    intervalRef.current = setInterval(fetchStats, 3000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      abortRef.current?.abort()
    }
  }, [fetchStats, active])

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity size={16} className="text-accent shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-fg">Recursos</h1>
            <p className="text-xs text-fg-subtle">
              {stats.length} container{stats.length !== 1 ? 's' : ''} monitorado{stats.length !== 1 ? 's' : ''}
              {lastRefresh && ` · ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchStats()}
            disabled={loading}
            title="Atualizar"
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && stats.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-8 text-center">
          <p className="text-fg-muted text-sm">Nenhum container em execução.</p>
        </div>
      )}

      {/* Stats table */}
      {stats.length > 0 && (
        <div className="flex flex-col gap-2">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_180px_180px_130px_130px_50px] gap-3 px-4 py-1.5 text-xs text-fg-subtle font-medium">
            <div className="flex items-center gap-1.5"><Cpu size={11} />Container</div>
            <div className="flex items-center gap-1.5"><Cpu size={11} />CPU</div>
            <div className="flex items-center gap-1.5"><MemoryStick size={11} />Memória</div>
            <div className="flex items-center gap-1.5"><Network size={11} />Rede</div>
            <div className="flex items-center gap-1.5"><HardDrive size={11} />Disco</div>
            <div>PIDs</div>
          </div>

          {stats.map((s) => {
            const cpu = parsePerc(s.cpuPerc)
            const mem = parsePerc(s.memPerc)
            const cpuColor = cpu > 80 ? 'bg-danger' : cpu > 50 ? 'bg-attention' : 'bg-success'
            const memColor = mem > 80 ? 'bg-danger' : mem > 60 ? 'bg-attention' : 'bg-accent'

            return (
              <div
                key={s.name}
                className="grid grid-cols-[1fr_180px_180px_130px_130px_50px] gap-3 items-center px-4 py-3 rounded-xl bg-canvas-subtle border border-border hover:border-border/80 transition-colors"
              >
                {/* Name */}
                <p className="text-sm font-semibold text-fg truncate font-mono" title={s.name}>
                  {s.name}
                </p>

                {/* CPU */}
                <PercBar value={cpu} color={cpuColor} />

                {/* Memory */}
                <div className="flex flex-col gap-0.5">
                  <PercBar value={mem} color={memColor} />
                  <span className="text-xs text-fg-subtle font-mono truncate">{s.memUsage}</span>
                </div>

                {/* Net I/O */}
                <div className="text-xs font-mono text-fg-muted leading-4">
                  <div className="truncate" title={s.netIO}>{s.netIO}</div>
                </div>

                {/* Block I/O */}
                <div className="text-xs font-mono text-fg-muted leading-4">
                  <div className="truncate" title={s.blockIO}>{s.blockIO}</div>
                </div>

                {/* PIDs */}
                <span className="text-xs font-mono text-fg-muted text-center">{s.pids}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
