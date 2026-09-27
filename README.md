# Container Manager

> Interface web local para gerenciar containers Docker rodando dentro do WSL2 no Windows 11.

Servidor Node.js que roda em background e expõe uma UI em `http://localhost:3210`. Agrupa containers em **ambientes** (Dev, Staging, QA…), permite iniciar sequências ordenadas com delays, monitora recursos em tempo real e gerencia snapshots de distros WSL2 — tudo sem sair do browser.

---

## Funcionalidades

### Ambientes
- Agrupa containers em ambientes com nome e cor personalizáveis
- Start / Stop / Restart individual ou em massa
- **Sequência de startup com delays**: start oracle → aguarda 60 s → start app → aguarda 20 s → start proxy
- Contador regressivo em tempo real durante a sequência
- Ordem dos containers preservada conforme configurado

### Recursos (Stats)
- Monitoramento via `docker stats` da distro WSL principal (ou Docker Desktop), com **auto-refresh a cada 3 segundos**
- Atualização ao vivo somente enquanto a aba "Recursos" está aberta — zero polling em segundo plano ao navegar para outra aba
- Barras de progresso coloridas para CPU e memória (verde → amarelo → vermelho)
- Colunas: CPU%, Memória (uso + %), Rede I/O, Disco I/O, PIDs

### Snapshots WSL
- **Export** de distros via `wsl --export` com seletor nativo de pasta do Windows
- **Import** via `wsl --import` com seletor nativo de arquivo `.tar`
- Nome pré-preenchido com data e hora: `Winthor-local-snapshot-2026-06-05_14h32.tar`
- Detecta conflito de nome ao importar — bloqueia se a distro já existir
- `wsl --shutdown` automático antes de export/import para evitar erros de arquivo em uso
- Lista arquivos `.tar` no diretório configurado com tamanho e data
- Diretório de snapshots configurável e persistido

### Distros WSL
- Badge de status no header para a distro WSL principal (a marcada como padrão em `wsl --list --verbose`, ou a primeira da lista)
- Iniciar ou encerrar a distro com um clique
- Encerramento bloqueado se houver containers fora do estado `exited`

### Logs
- Modal de logs de qualquer container no próprio browser
- Opções de tail: 100 / 200 / 500 / 1 000 linhas com auto-scroll
- Polling automático de status a cada 5 segundos

### Sobre
- Versão exibida sempre sincronizada com o `version` do `package.json` (injetada em build-time)
- Botões de contato e reporte de bug abrem o compose do Gmail direto no browser (sem depender de cliente de e-mail instalado)

---

## Stack

| Camada    | Tecnologia                      |
|-----------|---------------------------------|
| Backend   | Node.js + Express + TypeScript  |
| Frontend  | React + TypeScript + Vite       |
| Estilo    | Tailwind CSS                    |
| Ícones    | Lucide React                    |
| Config    | JSON em `~/.container-manager/` |

---

## Requisitos

- **Node.js** v22.21.1 — [nodejs.org/download](https://nodejs.org/en/download)
- **Windows 11** com WSL2 habilitado
- **Docker Desktop** (Windows) **ou** Docker instalado dentro da distro WSL2

---

## Instalação

Com o Node.js instalado, dentro da pasta do projeto execute:

```bash
npm install
```

---

## Uso

```bat
start.bat
```

Acesse **http://localhost:3210**.

Para encerrar o servidor:

```bat
stop.bat
```

---

## Configuração

O arquivo de configuração fica em:

```
C:\Users\<usuario>\.container-manager\environments.json
```

Pode ser versionado no git, editado manualmente ou restaurado de backup — é texto simples.

### Exemplo completo

```json
{
  "environments": [
    {
      "id": "uuid-gerado-automaticamente",
      "name": "Dev",
      "color": "#58a6ff",
      "wslDistro": "Winthor-local",
      "containers": ["oracle-local", "wta-local", "wsh-local"],
      "delays": {
        "oracle-local": 60,
        "wta-local": 20
      }
    }
  ],
  "snapshotsDir": "C:\\Docker"
}
```

### Campos

| Campo         | Descrição |
|---------------|-----------|
| `id`          | UUID gerado automaticamente pela aplicação |
| `name`        | Nome exibido na sidebar |
| `color`       | Cor em hex para identificação visual |
| `wslDistro`   | Nome da distro WSL2 (omitir para usar Docker Desktop) |
| `containers`  | Lista de nomes de containers na ordem de startup |
| `delays`      | Segundos a aguardar após iniciar cada container antes do próximo |
| `snapshotsDir`| Diretório onde os `.tar` de snapshot são salvos e listados |

---

## API REST

### Docker

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`  | `/api/docker/containers?distro=` | Lista containers |
| `POST` | `/api/docker/start` | `{ name, distro? }` — inicia container |
| `POST` | `/api/docker/stop` | `{ name, distro? }` — para container |
| `POST` | `/api/docker/restart` | `{ name, distro? }` — reinicia container |
| `GET`  | `/api/docker/logs?name=&distro=&tail=` | Logs do container |
| `GET`  | `/api/docker/stats?distro=` | Recursos em tempo real |

### WSL

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`  | `/api/wsl/distros` | Lista distros WSL |
| `POST` | `/api/wsl/start` | `{ name }` — inicia distro |
| `POST` | `/api/wsl/terminate` | `{ name }` — encerra distro |
| `POST` | `/api/wsl/shutdown` | Encerra todo o WSL |
| `POST` | `/api/wsl/export` | `{ name, filePath }` |
| `POST` | `/api/wsl/import` | `{ name, installDir, tarPath }` |
| `GET`  | `/api/wsl/snapshots?dir=` | Lista `.tar` em um diretório |

### Config

| Método   | Rota | Descrição |
|----------|------|-----------|
| `GET`    | `/api/config` | Lê configuração |
| `PUT`    | `/api/config/environments` | Cria / atualiza ambiente |
| `DELETE` | `/api/config/environments/:id` | Remove ambiente |
| `PUT`    | `/api/config/snapshots-dir` | `{ dir }` — salva diretório de snapshots |

### Dialogs

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/dialog/file` | Abre seletor nativo de arquivo |
| `POST` | `/api/dialog/folder` | Abre seletor nativo de pasta |

---

## Notas importantes

> **Nunca use `docker compose down` ou `docker compose up`** — os containers utilizam named volumes e devem ser gerenciados apenas via `docker start/stop/restart`. O app segue essa convenção.

- A distro WSL2 só pode ser encerrada se **todos** os seus containers estiverem com estado `exited`.
- Export e import executam `wsl --shutdown` automaticamente — todas as distros são paradas no processo.
- Os seletores de arquivo/pasta usam o dialog nativo do Windows via PowerShell (`System.Windows.Forms`).
- O servidor faz bind apenas em `127.0.0.1` — não fica exposto na rede local.

---

## Estrutura do projeto

```
container-manager/
├── src/
│   ├── server/
│   │   ├── index.ts          # Entry point Express (porta 3210)
│   │   ├── docker.ts         # Operações Docker via CLI
│   │   ├── wsl.ts            # Operações WSL (parsing UTF-16 LE)
│   │   ├── config.ts         # Leitura/escrita environments.json
│   │   ├── cache.ts          # Cache de respostas
│   │   ├── dialog.ts         # Seletores nativos do Windows
│   │   └── routes/
│   │       └── index.ts      # Rotas REST
│   ├── client/
│   │   └── src/
│   │       ├── App.tsx                    # Estado global + polling
│   │       ├── api.ts                     # Fetch wrapper tipado
│   │       └── components/
│   │           ├── Header.tsx             # Badge de status da distro WSL principal
│   │           ├── Sidebar.tsx            # Lista de ambientes
│   │           ├── EnvironmentView.tsx    # Grid de containers + bulk actions
│   │           ├── ContainerCard.tsx      # Card individual
│   │           ├── StatsView.tsx          # Monitoramento de recursos (ao vivo enquanto aba ativa)
│   │           ├── SnapshotsView.tsx      # Export / Import WSL
│   │           ├── ContainerLogsModal.tsx # Modal de logs
│   │           ├── WslSwitchModal.tsx     # Confirmação de start/terminate da distro
│   │           ├── AboutView.tsx          # Aba Sobre (versão, contato, stack)
│   │           └── CreateEnvironmentModal.tsx
│   └── shared/
│       └── types.ts          # Tipos compartilhados server ↔ client
├── dev.bat                   # Inicia backend + frontend em modo dev
├── start.bat                 # Inicia servidor de produção
└── stop.bat                  # Encerra o servidor
```
