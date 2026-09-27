import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Download, Upload, X, AlertTriangle, CheckCircle, Loader, RefreshCw, HardDrive, FolderSearch, Trash2 } from 'lucide-react'
import type { SnapshotFile, WslDistro } from '../../../shared/types'
import { api } from '../api'

interface Props {
  distros: WslDistro[]
  snapshotsDir: string
  onDirChange: (dir: string) => void
  onDistrosChanged: () => void
  onOperationChange?: (label: string | null) => void
}

type Operation = { type: 'export' | 'import'; label: string; startedAt: Date }

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}`
}

// ── Export Modal ────────────────────────────────────────────────────────────

interface ExportModalProps {
  distro: WslDistro
  dir: string
  onConfirm: (filePath: string) => void
  onCancel: () => void
}

function ExportModal({ distro, dir, onConfirm, onCancel }: ExportModalProps) {
  const [destDir, setDestDir] = useState(dir.replace(/\\$/, ''))
  const [filename, setFilename] = useState(`${distro.name}-snapshot-${nowStamp()}.tar`)
  const [pickingDir, setPickingDir] = useState(false)
  const fullPath = `${destDir.replace(/\\$/, '')}\\${filename}`

  const pickDir = async () => {
    setPickingDir(true)
    const { path } = await api.dialog.folder('Selecionar diretório de destino')
    if (path) setDestDir(path)
    setPickingDir(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-canvas border border-border rounded-xl shadow-2xl w-full max-w-md p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Exportar distro</h2>
          <button onClick={onCancel} className="p-1 rounded text-fg-muted hover:text-fg hover:bg-border/40 transition-colors"><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Distro</label>
          <p className="text-sm font-mono font-semibold text-fg">{distro.name}</p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Diretório de destino</label>
          <div className="flex gap-1.5">
            <input
              value={destDir}
              onChange={(e) => setDestDir(e.target.value)}
              placeholder="C:\Docker"
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-canvas-subtle border border-border text-fg focus:outline-none focus:border-accent/60 font-mono"
            />
            <button
              onClick={pickDir}
              disabled={pickingDir}
              title="Selecionar pasta"
              className="px-2.5 py-2 rounded-lg bg-canvas-subtle border border-border text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
            >
              {pickingDir ? <Loader size={13} className="animate-spin" /> : <FolderSearch size={13} />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Nome do arquivo</label>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg bg-canvas-subtle border border-border text-fg focus:outline-none focus:border-accent/60 font-mono"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Caminho completo</label>
          <p className="text-xs font-mono text-fg-muted bg-canvas-subtle px-3 py-2 rounded-lg border border-border break-all">{fullPath}</p>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-attention/10 border border-attention/30 text-attention text-xs">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>O WSL será encerrado (<code className="font-mono">wsl --shutdown</code>) antes de exportar para evitar erros de arquivo em uso.</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg text-fg-muted hover:text-fg hover:bg-border/40 transition-colors">Cancelar</button>
          <button
            onClick={() => onConfirm(fullPath)}
            disabled={!filename.trim() || !destDir.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
          >
            <Download size={12} className="inline mr-1" />Exportar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Import Modal ────────────────────────────────────────────────────────────

interface ImportModalProps {
  initialTarPath: string
  existingDistros: string[]
  onConfirm: (name: string, installDir: string, tarPath: string) => void
  onCancel: () => void
}

const WSL_INSTALL_BASE = 'C:\\WSL'

function guessNameFromPath(filePath: string): string {
  const filename = filePath.replace(/.*[\\/]/, '') // basename
  return filename
    .replace(/-snapshot-\d{4}-\d{2}-\d{2}[_T]\d{2}h?\d{2}.*\.tar$/i, '')
    .replace(/\.tar$/i, '')
}

function ImportModal({ initialTarPath, existingDistros, onConfirm, onCancel }: ImportModalProps) {
  const [tarPath, setTarPath] = useState(initialTarPath)
  const guessed = guessNameFromPath(tarPath)
  const [name, setName] = useState(guessed)
  const [installDir, setInstallDir] = useState(
    guessed ? `${WSL_INSTALL_BASE}\\${guessed}` : ''
  )
  const [pickingFile, setPickingFile] = useState(false)
  const [pickingDir, setPickingDir] = useState(false)

  const dirTouched = useRef(false)
  const nameTouched = useRef(false)
  const nameConflict = existingDistros.includes(name.trim())

  const pickFile = async () => {
    setPickingFile(true)
    const { path } = await api.dialog.file('Selecionar snapshot .tar', 'TAR (*.tar)|*.tar|Todos (*.*)|*.*')
    if (path) handleTarPathChange(path)
    setPickingFile(false)
  }

  const pickInstallDir = async () => {
    setPickingDir(true)
    const { path } = await api.dialog.folder('Selecionar diretório de instalação')
    if (path) { dirTouched.current = true; setInstallDir(path) }
    setPickingDir(false)
  }

  const handleTarPathChange = (v: string) => {
    setTarPath(v)
    const newGuess = guessNameFromPath(v)
    if (!nameTouched.current) {
      setName(newGuess)
      if (!dirTouched.current) {
        setInstallDir(newGuess ? `${WSL_INSTALL_BASE}\\${newGuess}` : '')
      }
    }
  }

  const handleNameChange = (v: string) => {
    nameTouched.current = true
    setName(v)
    if (!dirTouched.current) {
      setInstallDir(v ? `${WSL_INSTALL_BASE}\\${v}` : '')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-canvas border border-border rounded-xl shadow-2xl w-full max-w-md p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Importar snapshot</h2>
          <button onClick={onCancel} className="p-1 rounded text-fg-muted hover:text-fg hover:bg-border/40 transition-colors"><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Arquivo .tar</label>
          <div className="flex gap-1.5">
            <input
              value={tarPath}
              onChange={(e) => handleTarPathChange(e.target.value)}
              placeholder="C:\Docker\snapshot.tar"
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-canvas-subtle border border-border text-fg focus:outline-none focus:border-accent/60 font-mono"
            />
            <button
              onClick={pickFile}
              disabled={pickingFile}
              title="Selecionar arquivo"
              className="px-2.5 py-2 rounded-lg bg-canvas-subtle border border-border text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
            >
              {pickingFile ? <Loader size={13} className="animate-spin" /> : <FolderSearch size={13} />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Nome da nova distro</label>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg bg-canvas-subtle border border-border text-fg focus:outline-none focus:border-accent/60 font-mono"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-subtle">Diretório de instalação</label>
          <div className="flex gap-1.5">
            <input
              value={installDir}
              onChange={(e) => { dirTouched.current = true; setInstallDir(e.target.value) }}
              placeholder="C:\WSL\Winthor-local"
              className="flex-1 text-sm px-3 py-2 rounded-lg bg-canvas-subtle border border-border text-fg focus:outline-none focus:border-accent/60 font-mono"
            />
            <button
              onClick={pickInstallDir}
              disabled={pickingDir}
              title="Selecionar pasta"
              className="px-2.5 py-2 rounded-lg bg-canvas-subtle border border-border text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
            >
              {pickingDir ? <Loader size={13} className="animate-spin" /> : <FolderSearch size={13} />}
            </button>
          </div>
        </div>

        {nameConflict && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>Já existe uma distro com o nome <strong className="font-mono">{name}</strong>. Escolha um nome diferente.</span>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 rounded-lg bg-attention/10 border border-attention/30 text-attention text-xs">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>O WSL será encerrado (<code className="font-mono">wsl --shutdown</code>) antes de importar. Todos os containers em execução serão parados.</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg text-fg-muted hover:text-fg hover:bg-border/40 transition-colors">Cancelar</button>
          <button
            onClick={() => onConfirm(name, installDir, tarPath)}
            disabled={!tarPath.trim() || !name.trim() || !installDir.trim() || nameConflict}
            className="px-3 py-1.5 text-xs rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors disabled:opacity-40"
          >
            <Upload size={12} className="inline mr-1" />Importar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main View ───────────────────────────────────────────────────────────────

export default function SnapshotsView({ distros, snapshotsDir, onDirChange, onDistrosChanged, onOperationChange }: Props) {
  const [dirInput, setDirInput] = useState(snapshotsDir)
  const [snapshots, setSnapshots] = useState<SnapshotFile[]>([])
  const [loadingSnaps, setLoadingSnaps] = useState(false)
  const [exportTarget, setExportTarget] = useState<WslDistro | null>(null)
  const [importTarPath, setImportTarPath] = useState<string | null>(null)
  const [confirmUnregister, setConfirmUnregister] = useState<string | null>(null)
  const [operation, setOperation] = useState<Operation | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reporta a operação em andamento para o App — permite mostrar um indicador
  // na aba "Snapshots" mesmo quando o usuário navega para outra aba. A operação
  // em si (wsl --export/--import) já roda inteiramente no backend; isso é só
  // um aviso de UI, não gera nenhuma chamada extra ao WSL.
  useEffect(() => {
    onOperationChange?.(operation?.label ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation])

  const fetchSnapshots = async (dir: string) => {
    if (!dir.trim()) return
    setLoadingSnaps(true)
    try {
      const data = await api.wsl.snapshots(dir)
      setSnapshots(data)
    } catch {
      setSnapshots([])
    } finally {
      setLoadingSnaps(false)
    }
  }

  // Sync input field when prop arrives asynchronously (config load)
  useEffect(() => {
    setDirInput(snapshotsDir)
    fetchSnapshots(snapshotsDir)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotsDir])

  // elapsed timer during long operations
  useEffect(() => {
    if (operation) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [operation])

  const saveDir = async () => {
    const trimmed = dirInput.trim()
    if (!trimmed) return
    await api.config.setSnapshotsDir(trimmed)
    onDirChange(trimmed)
  }

  const pickDir = async () => {
    const { path } = await api.dialog.folder('Selecionar diretório de snapshots')
    if (path) {
      setDirInput(path)
      await api.config.setSnapshotsDir(path)
      onDirChange(path)
    }
  }

  const handleExport = async (filePath: string) => {
    if (!exportTarget) return
    const distroName = exportTarget.name
    setExportTarget(null)
    setResult(null)
    setOperation({ type: 'export', label: `Exportando ${distroName}…`, startedAt: new Date() })
    const res = await api.wsl.export(distroName, filePath)
    setOperation(null)
    if (res.success) {
      setResult({ ok: true, msg: `Exportação de ${distroName} concluída.` })
      await fetchSnapshots(snapshotsDir)
    } else {
      setResult({ ok: false, msg: res.error ?? 'Erro ao exportar.' })
    }
  }

  const handleUnregister = async (name: string) => {
    setConfirmUnregister(null)
    setResult(null)
    setOperation({ type: 'export', label: `Removendo distro ${name}…`, startedAt: new Date() })
    const res = await api.wsl.unregister(name)
    setOperation(null)
    if (res.success) {
      setResult({ ok: true, msg: `Distro "${name}" removida com sucesso.` })
      onDistrosChanged()
    } else {
      setResult({ ok: false, msg: res.error ?? 'Erro ao remover distro.' })
    }
  }

  const handleImport = async (name: string, installDir: string, tarPath: string) => {
    setImportTarPath(null)
    setResult(null)
    setOperation({ type: 'import', label: `Importando ${name}…`, startedAt: new Date() })
    const res = await api.wsl.import(name, installDir, tarPath)
    setOperation(null)
    if (res.success) {
      setResult({ ok: true, msg: `Distro "${name}" importada com sucesso.` })
      onDistrosChanged()
    } else {
      setResult({ ok: false, msg: res.error ?? 'Erro ao importar.' })
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HardDrive size={16} className="text-accent shrink-0" />
        <div>
          <h1 className="text-lg font-bold text-fg">Snapshots</h1>
          <p className="text-xs text-fg-subtle">Export e import de distros WSL2</p>
        </div>
      </div>

      {/* Directory bar */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-canvas-subtle border border-border">
        <FolderOpen size={14} className="text-fg-muted shrink-0" />
        <span className="text-xs text-fg-subtle shrink-0">Diretório:</span>
        <input
          value={dirInput}
          onChange={(e) => setDirInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveDir()}
          placeholder="C:\Docker\"
          disabled={!!operation}
          className="flex-1 text-xs px-2 py-1 rounded-md bg-canvas border border-border text-fg font-mono focus:outline-none focus:border-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          onClick={pickDir}
          disabled={!!operation}
          title={operation ? 'Aguarde a operação terminar' : 'Selecionar pasta'}
          className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-border/40 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FolderSearch size={14} />
        </button>
        <button
          onClick={saveDir}
          disabled={!!operation}
          title={operation ? 'Aguarde a operação terminar' : undefined}
          className="text-xs px-3 py-1 rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Salvar
        </button>
        <button
          onClick={() => fetchSnapshots(snapshotsDir)}
          disabled={loadingSnaps || !!operation}
          title={operation ? 'Aguarde a operação terminar' : 'Recarregar lista'}
          className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-border/40 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loadingSnaps ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Operation progress */}
      {operation && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm font-medium">
          <Loader size={15} className="animate-spin shrink-0" />
          <span className="flex-1">{operation.label}</span>
          <span className="text-xs font-mono tabular-nums">{elapsed}s</span>
        </div>
      )}

      {/* Result toast */}
      {result && !operation && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${result.ok ? 'bg-success/10 border-success/30 text-success' : 'bg-danger/10 border-danger/30 text-danger'}`}>
          {result.ok ? <CheckCircle size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
          <span className="flex-1">{result.msg}</span>
          <button onClick={() => setResult(null)} className="p-0.5 rounded hover:opacity-70 transition-opacity"><X size={13} /></button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Distros */}
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider">Distros WSL</h2>
          {distros.length === 0 ? (
            <p className="text-xs text-fg-muted">Nenhuma distro encontrada.</p>
          ) : (
            distros.map((d) => (
              <div key={d.name} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-canvas-subtle border border-border">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${d.state === 'Running' ? 'bg-success' : 'bg-fg-subtle'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-semibold text-fg truncate">{d.name}</p>
                    <p className="text-xs text-fg-subtle">{d.state === 'Running' ? 'Rodando' : 'Parada'} · WSL{d.version}</p>
                  </div>
                </div>
                {confirmUnregister === d.name ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-danger">Remover?</span>
                    <button
                      onClick={() => handleUnregister(d.name)}
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-danger/15 text-danger hover:bg-danger/25 transition-colors"
                    >
                      Sim
                    </button>
                    <button
                      onClick={() => setConfirmUnregister(null)}
                      className="px-2.5 py-1.5 text-xs rounded-lg text-fg-muted hover:text-fg hover:bg-border/40 transition-colors"
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { setResult(null); setExportTarget(d) }}
                      disabled={!!operation}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-40"
                    >
                      <Download size={12} />Exportar
                    </button>
                    <button
                      onClick={() => { setResult(null); setConfirmUnregister(d.name) }}
                      disabled={!!operation}
                      title="Remover distro"
                      className="p-1.5 rounded-lg text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Snapshots */}
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider">
            Snapshots disponíveis
            {snapshots.length > 0 && <span className="ml-1 normal-case font-normal">({snapshots.length})</span>}
          </h2>
          {!snapshotsDir.trim() ? (
            <p className="text-xs text-fg-muted">Configure o diretório acima para listar snapshots.</p>
          ) : loadingSnaps ? (
            <p className="text-xs text-fg-muted flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" />Carregando…</p>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-fg-muted">Nenhum arquivo .tar encontrado em <span className="font-mono">{snapshotsDir}</span></p>
              <button
                onClick={() => { setResult(null); setImportTarPath('') }}
                disabled={!!operation}
                className="self-start flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg text-fg-muted hover:text-fg hover:bg-border/40 border border-border transition-colors disabled:opacity-40"
              >
                <Upload size={11} />Importar de outro diretório…
              </button>
            </div>
          ) : (
            snapshots.map((s) => (
              <div key={s.path} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-canvas-subtle border border-border">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-fg truncate" title={s.name}>{s.name}</p>
                  <p className="text-xs text-fg-subtle">{formatBytes(s.sizeBytes)} · {formatDate(s.createdAt)}</p>
                </div>
                <button
                  onClick={() => { setResult(null); setImportTarPath(s.path) }}
                  disabled={!!operation}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-40 shrink-0"
                >
                  <Upload size={12} />Importar
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modals */}
      {exportTarget && (
        <ExportModal
          distro={exportTarget}
          dir={snapshotsDir}
          onConfirm={handleExport}
          onCancel={() => setExportTarget(null)}
        />
      )}
      {importTarPath !== null && (
        <ImportModal
          initialTarPath={importTarPath}
          existingDistros={distros.map((d) => d.name)}
          onConfirm={handleImport}
          onCancel={() => setImportTarPath(null)}
        />
      )}
    </div>
  )
}
