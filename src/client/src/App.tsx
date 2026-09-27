import { useState, useEffect, useCallback, useRef } from 'react'
import type { Container, Environment, WslDistro } from '../../shared/types'

type Theme = 'dark' | 'light'
function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('light', t === 'light')
  localStorage.setItem('cm-theme', t)
}
import { api } from './api'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import EnvironmentView from './components/EnvironmentView'
import CreateEnvironmentModal from './components/CreateEnvironmentModal'
import WslSwitchModal from './components/WslSwitchModal'
import ContainerLogsModal from './components/ContainerLogsModal'
import EmptyState from './components/EmptyState'
import StatsView from './components/StatsView'
import SnapshotsView from './components/SnapshotsView'
import AboutView from './components/AboutView'
import ToolsView from './components/ToolsView'

type Tab = 'environments' | 'stats' | 'snapshots' | 'tools' | 'about'

function TabBtn({ label, active, onClick, pending, disabled, busyLabel }: { label: string; active: boolean; onClick: () => void; pending?: boolean; disabled?: boolean; busyLabel?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={pending ? `${label} — operação em andamento` : disabled ? `Aguarde: ${busyLabel ?? 'operação em andamento'}` : undefined}
      className={`relative px-3 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'bg-accent/15 text-accent'
          : 'text-fg-muted hover:text-fg hover:bg-border/40'
      }`}
    >
      {label}
      {pending && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      )}
    </button>
  )
}

export default function App() {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [distros, setDistros] = useState<WslDistro[]>([])
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null)
  const [wslPending, setWslPending] = useState<{
    action: 'start' | 'terminate'
    distro: (typeof distros)[number]
    runningContainers: Container[]
  } | null>(null)
  const [loadingContainers, setLoadingContainers] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [notification, setNotification] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [sequenceStatus, setSequenceStatus] = useState<string | null>(null)
  const [logsTarget, setLogsTarget] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('environments')
  const [snapshotsDir, setSnapshotsDir] = useState('')
  // Operação longa em andamento (export/import de snapshot, remoção de container…) — enquanto
  // existir, a navegação fica presa na aba dona da operação.
  const [blockingOperation, setBlockingOperation] = useState<{ tab: Tab; label: string } | null>(null)
  const [operationPending, setOperationPending] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('cm-theme') as Theme | null
    return saved ?? 'dark'
  })
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { applyTheme(theme) }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const selectedEnv = environments.find((e) => e.id === selectedEnvId) ?? null

  const notify = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current)
    setNotification({ msg, type })
    notifyTimerRef.current = setTimeout(() => setNotification(null), 10000)
  }, [])

  const refreshContainers = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingContainers(true)
      try {
        const [all, wslDistros] = await Promise.all([
          api.docker.listContainers(selectedEnv?.wslDistro),
          api.wsl.listDistros()
        ])
        setContainers(all)
        setDistros(wslDistros)
        setLastRefresh(new Date())
      } catch {
        // Docker offline — falha silenciosa no background
      } finally {
        if (!silent) setLoadingContainers(false)
      }
    },
    [selectedEnv?.wslDistro]
  )

  useEffect(() => {
    const init = async () => {
      const [cfg, wslDistros] = await Promise.all([
        api.config.getAll(),
        api.wsl.listDistros()
      ])
      setEnvironments(cfg.environments)
      setDistros(wslDistros)
      setSnapshotsDir(cfg.snapshotsDir ?? '')
      if (cfg.environments.length > 0) setSelectedEnvId(cfg.environments[0].id)
    }
    init()
  }, [])

  useEffect(() => {
    refreshContainers()
  }, [refreshContainers])

  const handleSaveEnvironment = async (env: Environment) => {
    const cfg = await api.config.saveEnvironment(env)
    setEnvironments(cfg.environments)
    setSelectedEnvId(env.id)
    setShowModal(false)
    setEditingEnv(null)
    notify(`Ambiente "${env.name}" salvo.`)
  }

  const handleDeleteEnvironment = async (id: string) => {
    const env = environments.find((e) => e.id === id)
    const cfg = await api.config.deleteEnvironment(id)
    setEnvironments(cfg.environments)
    if (selectedEnvId === id) setSelectedEnvId(cfg.environments[0]?.id ?? null)
    notify(`Ambiente "${env?.name}" removido.`)
  }

  const handleTerminal = (containerName: string) => {
    api.docker.terminal(containerName, selectedEnv?.wslDistro)
  }

  const handleAction = async (action: 'start' | 'stop' | 'restart', containerName: string) => {
    setOperationPending(true)
    try {
      const distro = selectedEnv?.wslDistro
      const result = await api.docker[action](containerName, distro)
      if (result.success) {
        notify(`${containerName}: ${action} executado.`)
      } else {
        notify(`Erro: ${result.error}`, 'err')
      }
      await refreshContainers(true)
    } finally {
      setOperationPending(false)
    }
  }

  const handleDistroClick = async (distro: (typeof distros)[number]) => {
    if (distro.state === 'Running') {
      const all = await api.docker.listContainers(distro.name)
      const runningContainers = all.filter((c) => c.state !== 'exited')
      setWslPending({ action: 'terminate', distro, runningContainers })
    } else {
      setWslPending({ action: 'start', distro, runningContainers: [] })
    }
  }

  const handleWslConfirm = async () => {
    if (!wslPending) return
    const { action, distro } = wslPending
    setWslPending(null)
    // Atualização otimista: muda o ícone imediatamente
    setDistros((prev) =>
      prev.map((d) => d.name === distro.name ? { ...d, state: action === 'start' ? 'Running' : 'Stopped' } : d)
    )
    const result = action === 'start'
      ? await api.wsl.start(distro.name)
      : await api.wsl.terminate(distro.name)
    if (result.success) {
      notify(`WSL ${distro.name}: ${action === 'start' ? 'iniciada' : 'encerrada'}.`)
    } else {
      notify(`Erro ao ${action === 'start' ? 'iniciar' : 'encerrar'} ${distro.name}: ${result.error}`, 'err')
      // Reverte se deu erro
      setDistros((prev) => prev.map((d) => d.name === distro.name ? distro : d))
    }
    await refreshContainers(true)
    // wsl start só garante que a distro subiu, não que o dockerd dentro dela já
    // está pronto — uma segunda checagem alguns segundos depois cobre esse gap.
    if (result.success && action === 'start') {
      setTimeout(() => refreshContainers(true), 3000)
    }
  }

  const handleDirChange = async (dir: string) => {
    const cfg = await api.config.setSnapshotsDir(dir)
    setSnapshotsDir(cfg.snapshotsDir ?? dir)
  }

  // Enquanto uma operação longa está rodando (snapshots, tools), trava a troca de aba —
  // assim o usuário não perde de vista o progresso nem corre o risco de achar que foi
  // interrompida ao navegar para outro lugar da aplicação.
  const changeTab = (tab: Tab) => {
    if (blockingOperation && tab !== blockingOperation.tab) return
    setActiveTab(tab)
  }

  const trackOperation = useCallback((tab: Tab) => (label: string | null) => {
    setBlockingOperation(label ? { tab, label } : null)
  }, [])

  const tabProps = (tab: Tab) => ({
    active: activeTab === tab,
    onClick: () => changeTab(tab),
    pending: blockingOperation?.tab === tab,
    disabled: !!blockingOperation && blockingOperation.tab !== tab,
    busyLabel: blockingOperation?.label
  })

  const handleBulkAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!selectedEnv) return
    setOperationPending(true)
    try {
      const slots = selectedEnv.containers
      const hasDelays = action === 'start' && slots.some((s) => (s.delay ?? 0) > 0)
      const verb = { start: 'Iniciando', stop: 'Parando', restart: 'Reiniciando' }[action]
      const verbDone = { start: 'start', stop: 'stop', restart: 'restart' }[action]
      if (hasDelays) {
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i]
          setSequenceStatus(`Iniciando ${slot.name}… (${i + 1}/${slots.length})`)
          await api.docker.start(slot.name, selectedEnv.wslDistro)
          const delay = slot.delay ?? 0
          if (delay > 0 && i < slots.length - 1) {
            for (let s = delay; s > 0; s--) {
              setSequenceStatus(`Aguardando ${s}s antes de ${slots[i + 1].name}…`)
              await new Promise((r) => setTimeout(r, 1000))
            }
          }
        }
        setSequenceStatus(null)
        notify('Sequência de start concluída.')
      } else {
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i]
          setSequenceStatus(`${verb} ${slot.name}… (${i + 1}/${slots.length})`)
          await api.docker[action](slot.name, selectedEnv.wslDistro)
        }
        setSequenceStatus(null)
        notify(`${verbDone} aplicado a todos os containers.`)
      }
      await refreshContainers(true)
    } finally {
      setOperationPending(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-canvas overflow-hidden">
      <Header distros={distros} lastRefresh={lastRefresh} onRefresh={() => refreshContainers()} onDistroClick={handleDistroClick} theme={theme} onThemeToggle={toggleTheme} />

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 h-9 bg-canvas-inset border-b border-border shrink-0">
        <TabBtn label="Ambientes" {...tabProps('environments')} />
        <TabBtn label="Recursos" {...tabProps('stats')} />
        <TabBtn label="Snapshots" {...tabProps('snapshots')} />
        <TabBtn label="Tools" {...tabProps('tools')} />
        <TabBtn label="Sobre" {...tabProps('about')} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'environments' && (
          <Sidebar
            environments={environments}
            selectedId={selectedEnvId}
            containers={containers}
            onSelect={setSelectedEnvId}
            onAdd={() => { setEditingEnv(null); setShowModal(true) }}
            onEdit={(env) => { setEditingEnv(env); setShowModal(true) }}
            onDelete={handleDeleteEnvironment}
          />
        )}

        <main className="flex-1 overflow-y-auto p-6">
          {/* StatsView permanece montado mesmo fora da aba Recursos para não perder a
              monitoria em andamento — o polling interno se ajusta sozinho (ver StatsView). */}
          <div className={activeTab === 'stats' ? 'contents' : 'hidden'}>
            <StatsView distros={distros} active={activeTab === 'stats'} />
          </div>
          {activeTab === 'about' ? (
            <AboutView />
          ) : activeTab === 'stats' ? null : activeTab === 'tools' ? (
            <ToolsView
              distros={distros}
              notify={notify}
              onOperationChange={trackOperation('tools')}
              onContainersChanged={() => refreshContainers(true)}
            />
          ) : activeTab === 'snapshots' ? (
            <SnapshotsView
              distros={distros}
              snapshotsDir={snapshotsDir}
              onDirChange={handleDirChange}
              onOperationChange={trackOperation('snapshots')}
              onDistrosChanged={async () => {
                const cfg = await api.config.getAll()
                setEnvironments(cfg.environments)
                await refreshContainers(true)
              }}
            />
          ) : selectedEnv ? (
            <EnvironmentView
              environment={selectedEnv}
              allContainers={containers}
              loading={loadingContainers}
              operationPending={operationPending}
              sequenceStatus={sequenceStatus}
              onAction={handleAction}
              onBulkAction={handleBulkAction}
              onLogs={(name) => setLogsTarget(name)}
              onTerminal={handleTerminal}
              onEdit={() => { setEditingEnv(selectedEnv); setShowModal(true) }}
            />
          ) : (
            <EmptyState onAdd={() => { setEditingEnv(null); setShowModal(true) }} />
          )}
        </main>
      </div>

      {notification && (
        <div
          className={`fixed bottom-4 right-4 flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg z-50 ${
            notification.type === 'ok'
              ? 'bg-success/20 border border-success text-success'
              : 'bg-danger/20 border border-danger text-danger'
          }`}
        >
          <span>{notification.msg}</span>
          <button
            onClick={() => {
              if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current)
              setNotification(null)
            }}
            className="opacity-60 hover:opacity-100 leading-none"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      )}

      {logsTarget && (
        <ContainerLogsModal
          containerName={logsTarget}
          distro={selectedEnv?.wslDistro}
          onClose={() => setLogsTarget(null)}
        />
      )}

      {wslPending && (
        <WslSwitchModal
          action={wslPending.action}
          distro={wslPending.distro}
          runningContainers={wslPending.runningContainers}
          onConfirm={handleWslConfirm}
          onCancel={() => setWslPending(null)}
        />
      )}

      {showModal && (
        <CreateEnvironmentModal
          editing={editingEnv}
          distros={distros}
          allContainers={containers}
          onSave={handleSaveEnvironment}
          onClose={() => { setShowModal(false); setEditingEnv(null) }}
        />
      )}
    </div>
  )
}
