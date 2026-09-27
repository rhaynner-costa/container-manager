import { useCallback, useEffect, useState } from 'react'
import { DatabaseZap, RefreshCw, AlertTriangle } from 'lucide-react'
import type { Container, RmanCopy } from '../../../shared/types'
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
  /** Muda quando um backup termina — força recarregar a lista de cópias */
  reloadKey?: number
}

// Mesma regra do servidor: vão direto num ALTER USER do restore_rman.sh
const ORACLE_IDENT_RE = /^[A-Za-z][A-Za-z0-9_]*$/

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Tool: restaura no container Oracle destino uma cópia de backup guardada no Windows
// (C:\WSL\rman) via scripts/restore_rman.sh.
export default function RmanRestoreTool({ distro, notify, onOperationChange, onContainersChanged, reloadKey, locked }: Props) {
  const [copies, setCopies] = useState<RmanCopy[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(false)
  const [copy, setCopy] = useState('')
  const [destino, setDestino] = useState('')
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { operation, setOperation, elapsed } = useOperation(onOperationChange)
  const [log, setLog] = useState<string[]>([])

  const selectedCopy = copies.find((c) => c.name === copy) ?? null
  // Destino: qualquer container Oracle — inclusive o que originou a cópia (volta o banco ao backup)
  const destinos = containers.filter((c) => c.image.toLowerCase().includes('oracle'))
  const sameContainer = !!selectedCopy && destino === selectedCopy.container
  const credsOk = ORACLE_IDENT_RE.test(usuario) && ORACLE_IDENT_RE.test(senha)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [cps, list] = await Promise.all([api.tools.rmanCopies(), api.docker.listContainers(distro)])
      setCopies(cps)
      setContainers(list)
      setCopy((c) => (cps.some((x) => x.name === c) ? c : ''))
      setDestino((d) => (list.some((x) => x.name === d) ? d : ''))
    } catch {
      setCopies([])
      setContainers([])
    } finally {
      setLoading(false)
    }
  }, [distro])

  useEffect(() => {
    refresh()
  }, [refresh, reloadKey])

  const run = async () => {
    if (!copy || !destino) return
    setConfirmOpen(false)
    setLog([])
    setOperation(`Restaurando ${copy} em ${destino}…`)
    try {
      const res = await api.tools.rmanRestore(copy, destino, usuario, senha, distro, (lines) => setLog((prev) => [...prev, ...lines]))
      if (res.success && res.warning) notify(`Restore em "${destino}" concluído, mas com erros no log — confira.`, 'err')
      else if (res.success) notify(`Restore concluído: "${destino}" agora tem o banco de ${copy}.`)
      else notify(`Erro: ${res.error ?? 'falha no restore.'}`, 'err')
    } catch (e) {
      notify(`Erro: ${(e as Error).message}`, 'err')
    } finally {
      setOperation(null)
      await refresh()
      onContainersChanged()
    }
  }

  const busy = !!operation
  const inputCls = 'text-sm px-3 py-2 rounded-lg bg-canvas border border-border text-fg focus:outline-none focus:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <ToolCard
      icon={DatabaseZap}
      title="Restore RMAN"
      description="Restaura em um container Oracle um backup guardado no Windows"
      tone="danger"
      busy={busy}
      locked={locked}
    >
      {operation && <ProgressBar label={operation} elapsed={elapsed} />}

      <div className="flex flex-col gap-3 max-w-lg">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Backup (cópia no Windows)</label>
          <div className="flex items-center gap-3">
            <select value={copy} onChange={(e) => setCopy(e.target.value)} disabled={busy || loading} className={`flex-1 min-w-0 ${inputCls}`}>
              <option value="">
                {loading ? 'Carregando…' : copies.length === 0 ? 'Nenhuma cópia encontrada — faça um backup primeiro' : 'Selecione um backup…'}
              </option>
              {copies.map((c) => (
                <option key={c.name} value={c.name}>{c.container} — {formatDate(c.createdAt)} — {formatBytes(c.sizeBytes)}</option>
              ))}
            </select>
            <button
              onClick={refresh}
              disabled={loading || busy}
              title="Recarregar listas"
              className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Container destino</label>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} disabled={busy || loading || !copy} className={inputCls}>
            <option value="">{destinos.length === 0 ? 'Nenhum container Oracle disponível' : 'Selecione o destino…'}</option>
            {destinos.map((c) => (
              <option key={c.id} value={c.name}>{c.name} — {c.image} ({c.state})</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-xs text-fg-subtle">Usuário</label>
            <input value={usuario} onChange={(e) => setUsuario(e.target.value.trim())} disabled={busy} placeholder="ex: system" className={`font-mono ${inputCls}`} />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-xs text-fg-subtle">Senha</label>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value.trim())} disabled={busy} className={`font-mono ${inputCls}`} />
          </div>
        </div>
        {(usuario || senha) && !credsOk && (
          <p className="text-xs text-attention">Usuário e senha: só letras, números e _, começando por letra.</p>
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!copy || !destino || !credsOk || busy}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <DatabaseZap size={12} />Restaurar
        </button>
      </div>

      <LogPanel lines={log} />

      {confirmOpen && selectedCopy && (
        <ConfirmModal
          title={`Restaurar em ${destino}?`}
          confirmLabel="Restaurar (irreversível)"
          danger
          onConfirm={run}
          onCancel={() => setConfirmOpen(false)}
        >
          <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            {sameContainer ? (
              <span>
                O banco de <strong className="font-mono">{destino}</strong> voltará ao estado do backup
                de {formatDate(selectedCopy.createdAt)}. Tudo o que foi feito depois disso será perdido.
              </span>
            ) : (
              <span>
                O banco de <strong className="font-mono">{destino}</strong> será <strong>substituído</strong> pelo backup
                de <strong className="font-mono">{selectedCopy.container}</strong> de {formatDate(selectedCopy.createdAt)}.
                Todos os dados atuais de {destino} serão perdidos.
              </span>
            )}
          </div>
        </ConfirmModal>
      )}
    </ToolCard>
  )
}
