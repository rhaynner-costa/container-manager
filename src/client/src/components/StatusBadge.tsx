import type { ContainerState } from '../../../shared/types'

interface Props {
  state: ContainerState
  size?: 'sm' | 'md'
}

const config: Record<ContainerState, { label: string; dot: string; text: string }> = {
  running:    { label: 'Running',    dot: 'bg-success animate-pulse', text: 'text-success' },
  restarting: { label: 'Restarting', dot: 'bg-attention animate-spin', text: 'text-attention' },
  paused:     { label: 'Paused',     dot: 'bg-attention',             text: 'text-attention' },
  created:    { label: 'Created',    dot: 'bg-accent',                text: 'text-accent' },
  exited:     { label: 'Exited',     dot: 'bg-fg-subtle',             text: 'text-fg-muted' },
  removing:   { label: 'Removing',   dot: 'bg-severe',                text: 'text-severe' },
  dead:       { label: 'Dead',       dot: 'bg-danger',                text: 'text-danger' }
}

export default function StatusBadge({ state, size = 'md' }: Props) {
  const { label, dot, text } = config[state] ?? config.dead
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'

  return (
    <span className={`inline-flex items-center gap-1.5 ${text}`}>
      <span className={`rounded-full shrink-0 ${dotSize} ${dot}`} />
      <span className="text-xs font-medium">{label}</span>
    </span>
  )
}
