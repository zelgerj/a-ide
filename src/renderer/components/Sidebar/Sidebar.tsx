import { useAppStore } from '../../stores/appStore'
import { destroyProjectTerminals } from '../../hooks/useTerminal'
import { switchProject } from '../../utils/switchProject'
import ProjectCard from './ProjectCard'

interface SidebarProps {
  onAddProject: () => void
}

export default function Sidebar({ onAddProject }: SidebarProps): JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const projectOrder = useAppStore((s) => s.projectOrder)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const gitStatuses = useAppStore((s) => s.gitStatuses)
  const removeProject = useAppStore((s) => s.removeProject)

  // Sort projects by order
  const sortedProjects = [...projects].sort((a, b) => {
    const ai = projectOrder.indexOf(a.id)
    const bi = projectOrder.indexOf(b.id)
    return ai - bi
  })

  const handleProjectClick = (projectId: string): void => {
    switchProject(projectId)
  }

  const handleRemoveProject = async (projectId: string): Promise<void> => {
    await window.api.invoke('project:remove', projectId)
    destroyProjectTerminals(projectId)
    removeProject(projectId)
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Header with title + add button */}
      <div className="titlebar-drag h-[38px] flex-shrink-0 flex items-end justify-between px-3 pb-1">
        <span className="titlebar-no-drag text-[11px] text-text-secondary font-semibold uppercase tracking-wider">
          Projects
        </span>
        <button
          onClick={onAddProject}
          className="
            titlebar-no-drag flex items-center justify-center
            w-5 h-5 rounded
            text-text-secondary hover:text-text-primary hover:bg-bg-hover
            transition-colors duration-100 text-base leading-none
          "
          title="Add project folder (⌘O)"
        >
          +
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5">
        {sortedProjects.map((project, index) => (
          <ProjectCard
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            index={index}
            gitStatus={gitStatuses.get(project.id)}
            onClick={() => handleProjectClick(project.id)}
            onRemove={() => handleRemoveProject(project.id)}
          />
        ))}
      </div>
    </div>
  )
}
