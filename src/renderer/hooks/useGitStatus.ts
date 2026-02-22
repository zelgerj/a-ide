import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { GitStatus } from '../types'

export function useGitStatus(): void {
  const setGitStatus = useAppStore((s) => s.setGitStatus)

  useEffect(() => {
    const unsub = window.api.on('git:status-updated', (payload: unknown) => {
      const { projectId, status } = payload as { projectId: string; status: GitStatus }
      setGitStatus(projectId, status)
    })
    return unsub
  }, [setGitStatus])
}
