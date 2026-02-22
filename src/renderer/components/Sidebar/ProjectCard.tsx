import type { Project, GitStatus } from '../../types'

interface ProjectCardProps {
  project: Project
  isActive: boolean
  index: number
  gitStatus?: GitStatus
  onClick: () => void
  onRemove: () => void
}

export default function ProjectCard({
  project,
  isActive,
  index,
  gitStatus,
  onClick,
  onRemove
}: ProjectCardProps): JSX.Element {
  return (
    <div
      onClick={onClick}
      className={`
        group relative flex flex-col px-3 py-2 mx-2 rounded-md cursor-pointer
        transition-colors duration-100
        ${isActive ? 'bg-bg-active border border-border-primary' : 'hover:bg-bg-hover border border-transparent'}
      `}
    >
      {/* Project number badge */}
      {index < 9 && (
        <span className="absolute top-1.5 right-2 text-[10px] text-text-secondary font-mono opacity-60">
          ⌘{index + 1}
        </span>
      )}

      {/* Project name */}
      <span
        className={`text-sm font-medium truncate pr-6 ${isActive ? 'text-text-bright' : 'text-text-primary'}`}
      >
        {project.name}
      </span>

      {/* Git branch */}
      {gitStatus && (
        <div className="flex items-center mt-1 gap-2">
          <span className="text-[11px] text-text-secondary truncate">
            ⎇ {gitStatus.branch}
          </span>
          {(gitStatus.modified > 0 || gitStatus.staged > 0) && (
            <span className="text-[10px] text-accent-yellow">
              {gitStatus.modified + gitStatus.staged}
            </span>
          )}
        </div>
      )}

      {/* Remove button (hidden until hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="
          absolute top-1.5 right-2 hidden group-hover:flex
          items-center justify-center w-4 h-4 rounded
          text-text-secondary hover:text-text-bright hover:bg-bg-tertiary
          text-xs leading-none
        "
        title="Remove project"
      >
        ×
      </button>
    </div>
  )
}
