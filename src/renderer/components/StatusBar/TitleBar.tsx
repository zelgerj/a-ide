import { useActiveProjectInfo } from '../../hooks/useActiveProjectInfo'

export default function TitleBar(): JSX.Element {
  const { activeProject, gitStatus } = useActiveProjectInfo()

  return (
    <div className="titlebar-drag flex items-center h-[38px] px-3 flex-shrink-0 bg-bg-secondary select-none">
      {/* Traffic light spacer */}
      <div className="w-[70px] flex-shrink-0" />

      {activeProject ? (
        <div className="flex items-center gap-3 min-w-0 text-[11px]">
          <span className="text-text-primary font-medium truncate">{activeProject.name}</span>
          {gitStatus && (
            <div className="flex items-center gap-2 text-text-secondary">
              <span>⎇ {gitStatus.branch}</span>
              {gitStatus.modified > 0 && <span>M{gitStatus.modified}</span>}
              {gitStatus.staged > 0 && <span>S{gitStatus.staged}</span>}
            </div>
          )}
          <span className="text-text-secondary/50 truncate">{activeProject.path}</span>
        </div>
      ) : (
        <span className="text-text-secondary text-[11px]">A-IDE</span>
      )}
    </div>
  )
}
