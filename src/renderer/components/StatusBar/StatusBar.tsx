import { useActiveProjectInfo } from '../../hooks/useActiveProjectInfo'

export default function StatusBar(): JSX.Element {
  const { activeProject, gitStatus } = useActiveProjectInfo()

  return (
    <div className="flex items-center h-[22px] px-3 bg-accent-blue text-text-bright text-[11px] select-none flex-shrink-0">
      {activeProject ? (
        <>
          <span className="truncate mr-4">{activeProject.name}</span>
          {gitStatus && (
            <>
              <span className="opacity-80 mr-4">⎇ {gitStatus.branch}</span>
              {gitStatus.modified > 0 && (
                <span className="opacity-80 mr-2">M{gitStatus.modified}</span>
              )}
              {gitStatus.staged > 0 && (
                <span className="opacity-80 mr-2">S{gitStatus.staged}</span>
              )}
            </>
          )}
          <span className="ml-auto opacity-60 truncate">{activeProject.path}</span>
        </>
      ) : (
        <span className="opacity-80">No project selected</span>
      )}
    </div>
  )
}
