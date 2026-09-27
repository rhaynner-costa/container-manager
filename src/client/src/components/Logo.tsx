interface Props {
  size?: number
  className?: string
}

// Grafismo do Container Manager (o "C" do logo) — usa currentColor, então a cor vem
// da classe (ex: text-brand, que troca entre índigo no tema claro e lavanda no escuro).
// Mesma geometria de public/favicon.svg.
export default function Logo({ size = 16, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" className={className} aria-hidden="true">
      <path d="M24.67 9.23A11 11 0 0 0 14.47 5.11" strokeWidth={6} />
      <path d="M5.28 13.53A11 11 0 0 0 24.67 22.77" strokeWidth={6} />
      <path d="M14.05 2.14A14 14 0 0 0 2.36 12.85L8.21 14.20A8 8 0 0 1 14.89 8.08Z" strokeWidth={1.2} strokeLinejoin="round" />
      <circle cx="16" cy="16" r="4.8" fill="currentColor" stroke="none" />
    </svg>
  )
}
