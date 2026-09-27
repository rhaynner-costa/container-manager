import { RefreshCw, Sun, Moon } from 'lucide-react'
import Logo from './Logo'
import type { WslDistro } from '../../../shared/types'

interface Props {
  distros: WslDistro[]
  lastRefresh: Date | null
  onRefresh: () => void
  onDistroClick: (distro: WslDistro) => void
  theme: 'dark' | 'light'
  onThemeToggle: () => void
}

export default function Header({ distros, lastRefresh, onRefresh, onDistroClick, theme, onThemeToggle }: Props) {
  // Mostrar/operar apenas a distro padrão do WSL (marcada com * no `wsl --list --verbose`)
  // evita a confusão de exibir todas as distros como se fossem intercambiáveis — start/stop
  // aqui sempre agiu sobre uma distro por vez, mas a lista completa dava a impressão de que
  // todas seriam afetadas junto.
  const mainDistro = distros.find((d) => d.isDefault) ?? distros[0] ?? null

  return (
    <header className="flex items-center justify-between px-4 h-11 bg-canvas-inset border-b border-border shrink-0">
      <div className="flex items-center gap-2 text-fg">
        <Logo size={18} className="text-brand shrink-0" />
        <span className="text-sm font-semibold tracking-tight">Container Manager</span>
      </div>

      <div className="flex items-center gap-4">
        {mainDistro && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDistroClick(mainDistro)}
              title={mainDistro.state === 'Running' ? `Encerrar ${mainDistro.name}` : `Iniciar ${mainDistro.name}`}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-opacity hover:opacity-70 cursor-pointer ${
                mainDistro.state === 'Running'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-border text-fg-subtle'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${mainDistro.state === 'Running' ? 'bg-success' : 'bg-fg-subtle'}`} />
              WSL · {mainDistro.name}
            </button>
          </div>
        )}

        <button
          onClick={onRefresh}
          title={lastRefresh ? `Atualizado: ${lastRefresh.toLocaleTimeString()}` : 'Atualizar'}
          className="flex items-center gap-1.5 text-fg-muted hover:text-fg transition-colors"
        >
          <RefreshCw size={13} />
          {lastRefresh && (
            <span className="text-xs text-fg-subtle">
              {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </button>

        <button
          onClick={onThemeToggle}
          title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          className="flex items-center text-fg-muted hover:text-fg transition-colors"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  )
}
