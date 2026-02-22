import { useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import type { Project, GitStatus } from '../types'

interface ActiveProjectInfo {
  activeProject: Project | undefined
  gitStatus: GitStatus | undefined
}

export function useActiveProjectInfo(): ActiveProjectInfo {
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const projects = useAppStore((s) => s.projects)
  const gitStatuses = useAppStore((s) => s.gitStatuses)

  return useMemo(() => {
    const activeProject = projects.find((p) => p.id === activeProjectId)
    const gitStatus = activeProjectId ? gitStatuses.get(activeProjectId) : undefined
    return { activeProject, gitStatus }
  }, [activeProjectId, projects, gitStatuses])
}
