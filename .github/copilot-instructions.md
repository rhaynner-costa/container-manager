# Container Manager

Aplicação web local para gerenciamento visual de ambientes Docker rodando dentro do WSL2 no Windows 11. Servidor Node.js em background no Windows expõe uma UI web em `http://localhost:3210`.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express + TypeScript |
| Frontend | React + TypeScript + Vite |
| Estilo | Tailwind CSS |
| Ícones | Lucide React |
| Config | JSON em `~/.container-manager/environments.json` |

## Arquitetura

- `src/server/` — Express (bind `127.0.0.1:3210` apenas, nunca expor externamente).
  - `docker.ts` — operações Docker via CLI (`exec`).
  - `wsl.ts` — operações WSL (`wsl.exe`), parsing de saída UTF-16 LE.
  - `config.ts` — leitura/escrita de `environments.json`.
  - `routes/index.ts` — rotas REST da API.
- `src/client/src/` — React + Vite, com `App.tsx` como estado global e polling.
- `src/shared/types.ts` — tipos compartilhados server ↔ client.

### Docker
- Sem distro selecionada: usa `docker` nativo do Windows (Docker Desktop).
- Com distro WSL: executa `wsl -d <distro> -- docker ps -a --format "{{json .}}"`; cada linha é um JSON parseado individualmente (tolerância a erros).

### WSL
- `wsl --list --verbose` emite UTF-16 LE → ler como `Buffer` e converter com `.toString('utf16le')`.
- Distros internas do Docker Desktop (`docker-desktop`, `docker-desktop-data`) são ignoradas.
- Import de distro (`wsl --import`): sempre criar o diretório de instalação (`C:\WSL\<nome>`) recursivamente via `fs.mkdirSync(dir, { recursive: true })` antes de rodar o comando — `wsl --import` não garante isso sozinho.

## Build e Execução

- Dev (hot reload): `dev.bat` — backend em `:3210`, frontend em `:5173` (abrir no browser).
- Produção: `npm run build` seguido de `start.bat` — acessar `:3210` (Express serve o frontend buildado).
- `npm run build` roda `tsc -p tsconfig.server.json && vite build`.

## Convenções

- Comentários e mensagens de commit em português.
- Operações longas (export/import/remoção de distro WSL) usam o padrão de job assíncrono em `routes/index.ts` (`jobs` Map + polling via `pollJob` no client) — nunca bloquear a requisição HTTP em operações de minutos.
- Componentes com polling real de CLI (ex: `StatsView`, `docker stats`) devem parar quando a aba não está ativa; polling que só lê estado em memória do servidor pode rodar continuamente sem custo.
- Decisões de arquitetura já tomadas (por que serviço web local e não Electron, polling HTTP e não WebSocket, Docker via CLI, config em JSON, etc.) estão registradas na memória de repositório do agente — consultar antes de propor mudanças estruturais.
