import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, RefreshCw, FileCheck, FileSearch } from 'lucide-react'
import type { Container } from '../../../shared/types'
import { api } from '../api'
import ConfirmModal from './ConfirmModal'
import ToolCard from './ToolCard'
import { useOperation, ProgressBar, LogPanel } from './ScriptRun'

interface Props {
  distro: string
  notify: (msg: string, type?: 'ok' | 'err') => void
  onOperationChange: (label: string | null) => void
  /** Outra ferramenta da aba está rodando */
  locked?: boolean
  onContainersChanged: () => void
}

// Tool: roda scripts/fix-netskope-cert-docker.sh no container escolhido — instala o
// certificado raiz da Netskope (SO + cacerts da JVM) e reinicia o container.
export default function NetskopeCertTool({ distro, notify, onOperationChange, onContainersChanged, locked }: Props) {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState('')
  const [certSaved, setCertSaved] = useState<boolean | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { operation, setOperation, elapsed } = useOperation(onOperationChange)
  const [log, setLog] = useState<string[]>([])

  // O script exige o container em execução
  const running = containers.filter((c) => c.state === 'running')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [list, status] = await Promise.all([api.docker.listContainers(distro), api.tools.netskopeStatus()])
      setContainers(list)
      setCertSaved(status.certSaved)
      setTarget((t) => (list.some((c) => c.name === t && c.state === 'running') ? t : ''))
    } catch {
      setContainers([])
    } finally {
      setLoading(false)
    }
  }, [distro])

  useEffect(() => {
    setTarget('')
    refresh()
  }, [refresh])

  const run = async () => {
    if (!target) return
    setConfirmOpen(false)
    const name = target
    setLog([])
    setOperation(`Instalando certificado em ${name}…`)
    try {
      const res = await api.tools.netskopeCert(name, distro, (lines) => setLog((prev) => [...prev, ...lines]))
      if (res.success && res.warning) notify(`Concluído em "${name}", mas com erros no log — confira.`, 'err')
      else if (res.success) notify(`Certificado Netskope instalado em "${name}".`)
      else notify(`Erro: ${res.error ?? 'falha ao executar o script.'}`, 'err')
    } catch (e) {
      notify(`Erro: ${(e as Error).message}`, 'err')
    } finally {
      setOperation(null)
      await refresh()
      onContainersChanged()
    }
  }

  const busy = !!operation

  return (
    <ToolCard
      icon={ShieldCheck}
      title="Certificado Netskope"
      description="Instala o certificado raiz da Netskope no container (SO + JVM) e o reinicia"
      busy={busy}
      locked={locked}
    >
      {operation && <ProgressBar label={operation} elapsed={elapsed} />}

      <div className="flex flex-col gap-3 max-w-lg">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Container em execução</label>
          <div className="flex items-center gap-3">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy || loading}
              className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg bg-canvas border border-border text-fg focus:outline-none focus:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="">{loading ? 'Carregando…' : running.length === 0 ? 'Nenhum container em execução' : 'Selecione um container…'}</option>
              {running.map((c) => (
                <option key={c.id} value={c.name}>{c.name} — {c.image}</option>
              ))}
            </select>
            <button
              onClick={refresh}
              disabled={loading || busy}
              title="Recarregar lista"
              className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {certSaved !== null && (
          <p className="text-xs text-fg-muted flex items-center gap-1.5">
            {certSaved
              ? <><FileCheck size={12} className="text-success shrink-0" />Certificado salvo em <code className="font-mono">scripts/certs</code></>
              : <><FileSearch size={12} className="shrink-0" />Nenhum certificado salvo — será extraído da conexão HTTPS na primeira execução</>}
          </p>
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!target || busy}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ShieldCheck size={12} />Instalar certificado
        </button>
      </div>

      <LogPanel lines={log} />

      {confirmOpen && (
        <ConfirmModal
          title={`Instalar certificado em ${target}?`}
          confirmLabel="Instalar"
          onConfirm={run}
          onCancel={() => setConfirmOpen(false)}
        >
          <p className="text-xs text-fg-muted">
            O certificado raiz da Netskope será instalado no container e ele será <strong className="text-fg">reiniciado</strong> ao final.
          </p>
        </ConfirmModal>
      )}
    </ToolCard>
  )
}
