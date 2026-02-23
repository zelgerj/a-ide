import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { destroyProjectTerminals } from '../../hooks/useTerminal'
import { switchProject } from '../../utils/switchProject'
import ProjectCard from './ProjectCard'
import FileTree from './FileTree'

interface SidebarProps {
  onAddProject: () => void
}

export default function Sidebar({ onAddProject }: SidebarProps): JSX.Element {
  const projects = useAppStore((s) => s.projects)
  const projectOrder = useAppStore((s) => s.projectOrder)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const gitStatuses = useAppStore((s) => s.gitStatuses)
  const sidebarMode = useAppStore((s) => s.sidebarMode)

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  )

  // Sort projects by order
  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const ai = projectOrder.indexOf(a.id)
        const bi = projectOrder.indexOf(b.id)
        return ai - bi
      }),
    [projects, projectOrder]
  )

  const handleProjectClick = (projectId: string): void => {
    switchProject(projectId)
  }

  const handleRemoveProject = async (projectId: string): Promise<void> => {
    await window.api.invoke('project:remove', projectId)
    destroyProjectTerminals(projectId)
    useAppStore.getState().removeProject(projectId)
  }

  const showFileTree = sidebarMode === 'files' && activeProject

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      {/* Header with mode toggle + add button */}
      <div className="titlebar-drag h-[38px] flex-shrink-0 flex items-end justify-between px-3 pb-1">
        <div className="titlebar-no-drag flex items-center gap-2">
          <button
            onClick={() => useAppStore.getState().setSidebarMode('projects')}
            className={`
              text-[11px] font-semibold uppercase tracking-wider py-0.5 pb-0 transition-colors duration-100
              border-b-2 ${sidebarMode === 'projects' ? 'text-text-bright border-accent-blue' : 'text-text-secondary border-transparent hover:text-text-primary'}
            `}
          >
            Projects
          </button>
          <button
            onClick={() => useAppStore.getState().setSidebarMode('files')}
            className={`
              text-[11px] font-semibold uppercase tracking-wider py-0.5 pb-0 transition-colors duration-100
              border-b-2 ${sidebarMode === 'files' ? 'text-text-bright border-accent-blue' : 'text-text-secondary border-transparent hover:text-text-primary'}
            `}
          >
            Files
          </button>
        </div>
        <button
          onClick={onAddProject}
          className="
            titlebar-no-drag flex items-center justify-center
            w-5 h-5 rounded
            text-text-secondary hover:text-text-primary hover:bg-bg-hover
            transition-colors duration-100 text-base leading-none
          "
          title="Add project folder (Cmd+O)"
        >
          +
        </button>
      </div>

      {/* Content */}
      {showFileTree ? (
        <FileTree projectId={activeProject.id} projectPath={activeProject.path} />
      ) : (
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
      )}
    </div>
  )
}
