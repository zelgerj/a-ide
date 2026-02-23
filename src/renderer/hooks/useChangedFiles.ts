import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import type { ChangedFile } from '../types'

export function useChangedFiles(): void {
  useEffect(() => {
    const unsub = window.api.on('git:changed-files-updated', (payload: unknown) => {
      const { projectId, files } = payload as { projectId: string; files: ChangedFile[] }
      useAppStore.getState().setChangedFiles(projectId, files)
    })
    return unsub
  }, [])
}
