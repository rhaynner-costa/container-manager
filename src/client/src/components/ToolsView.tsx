import { useCallback, useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import type { WslDistro } from '../../../shared/types'
import DeleteContainerTool from './DeleteContainerTool'
import DeleteVolumeTool from './DeleteVolumeTool'
import NetskopeCertTool from './NetskopeCertTool'
import RmanBackupTool from './RmanBackupTool'
import RmanRestoreTool from './RmanRestoreTool'
import QaEnvTool from './QaEnvTool'

interface Props {
  distros: WslDistro[]
  notify: (msg: string, type?: 'ok' | 'err') => void
  onOperationChange: (label: string | null) => void
  onContainersChanged: () => void
}

// Aba Tools: ferramentas auxiliares. Cada ferramenta é um card próprio abaixo;
// novas ferramentas entram como mais um item da lista.
export default function ToolsView({ distros, notify, onOperationChange, onContainersChanged }: Props) {
  // Atua sempre na distro principal — mesma regra do Header e da aba Recursos
  const mainDistro = distros.find((d) => d.isDefault) ?? distros[0] ?? null

  // Operação em andamento por ferramenta — assim o fim de uma não destrava as abas
  // enquanto outra ainda está rodando.
  const [ops, setOps] = useState<Record<string, string | null>>({})
  // Incrementa ao apagar um container — o volume dele pode ter ficado livre
  const [volumesKey, setVolumesKey] = useState(0)
  // Incrementa ao terminar um backup RMAN — o restore recarrega a lista de cópias
  const [rmanKey, setRmanKey] = useState(0)
  const track = useCallback((tool: string) => (label: string | null) => {
    setOps((prev) => (prev[tool] === label ? prev : { ...prev, [tool]: label }))
  }, [])
  const trackContainer = useCallback((l: string | null) => track('container')(l), [track])
  const trackVolume = useCallback((l: string | null) => track('volume')(l), [track])
  const trackNetskope = useCallback((l: string | null) => track('netskope')(l), [track])
  const trackRmanBackup = useCallback((l: string | null) => track('rman-backup')(l), [track])
  const trackRmanRestore = useCallback((l: string | null) => track('rman-restore')(l), [track])
  const trackQa = useCallback((l: string | null) => track('qa')(l), [track])

  // Ferramenta em execução — as demais ficam travadas até ela terminar
  const running = Object.keys(ops).find((k) => !!ops[k]) ?? null
  const lockedFor = (tool: string) => running !== null && running !== tool

  useEffect(() => {
    onOperationChange(Object.values(ops).find((l) => !!l) ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops])

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Wrench size={16} className="text-accent shrink-0" />
        <div>
          <h1 className="text-lg font-bold text-fg">Tools</h1>
          <p className="text-xs text-fg-subtle">
            {mainDistro ? <>Ferramentas auxiliares · distro <span className="font-mono">{mainDistro.name}</span></> : 'Ferramentas auxiliares'}
          </p>
        </div>
      </div>

      {!mainDistro ? (
        <p className="text-xs text-fg-muted">Nenhuma distro WSL encontrada.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <DeleteContainerTool
            distro={mainDistro.name}
            notify={notify}
            onOperationChange={trackContainer}
            locked={lockedFor('container')}
            onContainersChanged={() => { setVolumesKey((k) => k + 1); onContainersChanged() }}
          />
          <DeleteVolumeTool
            distro={mainDistro.name}
            notify={notify}
            onOperationChange={trackVolume}
            locked={lockedFor('volume')}
            reloadKey={volumesKey}
          />
          <NetskopeCertTool
            distro={mainDistro.name}
            notify={notify}
            onOperationChange={trackNetskope}
            locked={lockedFor('netskope')}
            onContainersChanged={onContainersChanged}
          />
          <RmanBackupTool
            distro={mainDistro.name}
            notify={notify}
            onOperationChange={trackRmanBackup}
            locked={lockedFor('rman-backup')}
            onContainersChanged={onContainersChanged}
            onBackupDone={() => setRmanKey((k) => k + 1)}
          />
          <RmanRestoreTool
            distro={mainDistro.name}
            notify={notify}
            onOperationChange={trackRmanRestore}
            locked={lockedFor('rman-restore')}
            onContainersChanged={onContainersChanged}
            reloadKey={rmanKey}
          />
        </div>
      )}

      {/* Não depende da distro: roda .bat no próprio Windows */}
      <QaEnvTool notify={notify} onOperationChange={trackQa} locked={lockedFor('qa')} />
    </div>
  )
}
