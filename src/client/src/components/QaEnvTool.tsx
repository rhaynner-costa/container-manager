import { useState } from 'react'
import { Play, Square, Monitor } from 'lucide-react'
import { api } from '../api'
import ToolCard from './ToolCard'
import { useOperation, ProgressBar, LogPanel } from './ScriptRun'

interface Props {
  notify: (msg: string, type?: 'ok' | 'err') => void
  onOperationChange: (label: string | null) => void
  locked?: boolean
}

// Tool: roda scripts/oracle_start.bat e oracle_stop.bat — sobe/para o ambiente de QA do
// Mississauga instalado no Windows (serviços Oracle, WTA e WSH).
export default function QaEnvTool({ notify, onOperationChange, locked }: Props) {
  const [wta, setWta] = useState(false)
  const [wsh, setWsh] = useState(false)
  const { operation, setOperation, elapsed } = useOperation(onOperationChange)
  const [log, setLog] = useState<string[]>([])

  const run = async (action: 'start' | 'stop') => {
    setLog([])
    setOperation(action === 'start' ? 'Iniciando ambiente QA…' : 'Parando ambiente QA…')
    try {
      const res = await api.tools.qaRun(action, { wta, wsh }, (lines) => setLog((prev) => [...prev, ...lines]))
      if (res.success) notify(`Ambiente QA: ${action === 'start' ? 'início' : 'parada'} concluído — confira o estado dos serviços no log.`)
      else notify(`Erro: ${res.error ?? 'falha ao executar o .bat.'}`, 'err')
    } catch (e) {
      notify(`Erro: ${(e as Error).message}`, 'err')
    } finally {
      setOperation(null)
    }
  }

  const busy = !!operation

  return (
    <ToolCard
      icon={Monitor}
      title="Ambiente QA Mississauga"
      description="Inicia ou para os serviços Oracle, WTA e WSH instalados no Windows"
      busy={busy}
      locked={locked}
    >
      {operation && <ProgressBar label={operation} elapsed={elapsed} />}

      <div className="flex flex-col gap-3 max-w-lg">
        <div className="flex gap-4 text-xs text-fg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={wta} onChange={(e) => setWta(e.target.checked)} disabled={busy} />
            Iniciar WTA
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={wsh} onChange={(e) => setWsh(e.target.checked)} disabled={busy} />
            Iniciar WSH
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => run('start')}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={12} />Iniciar
          </button>
          <button
            onClick={() => run('stop')}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Square size={12} />Parar
          </button>
        </div>
      </div>

      <LogPanel lines={log} />
    </ToolCard>
  )
}
