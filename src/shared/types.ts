export type ContainerState =
  | 'running'
  | 'exited'
  | 'paused'
  | 'created'
  | 'restarting'
  | 'removing'
  | 'dead'

export interface Container {
  id: string
  name: string
  image: string
  status: string
  state: ContainerState
  ports: string
}

export interface WslDistro {
  name: string
  state: 'Running' | 'Stopped'
  version: number
  isDefault: boolean
}

export interface ContainerSlot {
  id: string    // UUID estável para este slot dentro do ambiente
  name: string  // nome do container Docker
  delay?: number // segundos a aguardar após iniciar este container (antes do próximo)
}

export interface Environment {
  id: string
  name: string
  color: string
  containers: ContainerSlot[]
  wslDistro?: string
}

export interface AppConfig {
  environments: Environment[]
  snapshotsDir?: string
}

export interface SnapshotFile {
  name: string
  path: string
  sizeBytes: number
  createdAt: string
}

export interface VolumeInfo {
  name: string
  containers: string[] // containers (rodando ou parados) que montam o volume
}

export interface ScriptJobStatus {
  done: boolean
  success?: boolean
  warning?: boolean // terminou ok, mas há ORA-/RMAN-/SP2- no log
  error?: string
  lines: string[] // linhas novas de saída desde o índice pedido (?since=)
}

export interface ServiceStatus {
  name: string
  status: string // Running, Stopped, StartPending… ou NotFound
}

export interface RmanCopy {
  name: string       // pasta rman/ dentro do diretório de snapshots — <container>_<AAAA-MM-DD_HHhMM>
  container: string  // container Oracle que originou o backup
  createdAt: string
  sizeBytes: number
}

export interface ActionResult {
  success: boolean
  error?: string
}

export interface ContainerStats {
  name: string
  cpuPerc: string
  memUsage: string
  memPerc: string
  netIO: string
  blockIO: string
  pids: string
}

// IPC channel names (used as type-safe string literals)
export type IpcChannels =
  | 'docker:listContainers'
  | 'docker:start'
  | 'docker:stop'
  | 'docker:restart'
  | 'wsl:listDistros'
  | 'config:getAll'
  | 'config:saveEnvironment'
  | 'config:deleteEnvironment'
