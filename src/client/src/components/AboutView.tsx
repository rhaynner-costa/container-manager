import { Github, Mail, Bug, Heart, Box, Terminal, Layers, Globe } from 'lucide-react'
import Logo from './Logo'

const AUTHOR = {
  name: 'Rhaynner Costa',
  email: 'rhaynner.costa@totvs.com.br',
  role: 'Criador & Mantenedor',
}

const CONTACT_SUBJECT = 'Container Manager - '
const REPORT_EMAIL = 'rhaynner.costa@totvs.com.br'
const REPORT_SUBJECT = 'Container Manager - Bug Report - '

function gmailComposeUrl(to: string, subject?: string): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to })
  if (subject) params.set('su', subject)
  return `https://mail.google.com/mail/?${params.toString()}`
}

function LinkButton({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg hover:border-accent/50 hover:bg-accent/5 transition-colors"
    >
      <Icon size={13} />
      {label}
    </a>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold text-fg-subtle uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  )
}

export default function AboutView() {
  return (
    <div className="flex flex-col gap-8 max-w-2xl">

      {/* Hero */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-brand/10 border border-brand/20 shrink-0">
          <Logo size={36} className="text-brand" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-fg tracking-tight">Container Manager</h1>
          <p className="text-sm text-fg-muted mt-1">
            Interface web local para gerenciamento visual de ambientes Docker no WSL2.
          </p>
          <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-canvas-subtle border border-border text-xs text-fg-subtle font-mono">
            v{__APP_VERSION__}
          </span>
        </div>
      </div>

      {/* Autor */}
      <Section title="Autor">
        <div className="flex items-center gap-4 p-4 rounded-xl bg-canvas-subtle border border-border">
          <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0">
            <span className="text-accent font-bold text-sm">RC</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-fg">{AUTHOR.name}</p>
            <p className="text-xs text-fg-muted">{AUTHOR.role}</p>
            <a
              href={gmailComposeUrl(AUTHOR.email, CONTACT_SUBJECT)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent hover:underline font-mono mt-0.5 inline-block"
            >
              {AUTHOR.email}
            </a>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LinkButton href={gmailComposeUrl(AUTHOR.email, CONTACT_SUBJECT)} icon={Mail} label="Contato" />
          </div>
        </div>
      </Section>

      {/* Reportar */}
      <Section title="Reportar problema ou sugerir melhoria">
        <div className="p-4 rounded-xl bg-canvas-subtle border border-border flex flex-col gap-3">
          <p className="text-xs text-fg-muted leading-relaxed">
            Encontrou um bug ou tem uma ideia de melhoria? Envie um e-mail com o máximo de detalhes possível:
            versão do Windows, distro WSL, passos para reproduzir o problema e, se disponível, o log de erro.
          </p>
          <a
            href={gmailComposeUrl(REPORT_EMAIL, REPORT_SUBJECT)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-lg bg-accent/10 border border-accent/30 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
          >
            <Bug size={13} />
            Reportar via e-mail
          </a>
        </div>
      </Section>

      {/* Stack */}
      <Section title="Tecnologias">
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Terminal, label: 'Node.js + Express', desc: 'Servidor local na porta 3210' },
            { icon: Layers,   label: 'React + TypeScript', desc: 'Interface web com Vite' },
            { icon: Globe,    label: 'Tailwind CSS',       desc: 'Estilização utilitária' },
            { icon: Box,      label: 'Docker CLI + WSL2',  desc: 'Controle de containers' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-canvas-subtle border border-border">
              <Icon size={14} className="text-fg-subtle shrink-0" />
              <div>
                <p className="text-xs font-medium text-fg">{label}</p>
                <p className="text-xs text-fg-subtle">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <Heart size={11} className="text-danger" />
        Feito para simplificar o dia a dia com Docker no Windows.
      </p>
    </div>
  )
}
