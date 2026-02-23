import { useState, useEffect, useRef } from 'react'
import type { FileChangeEvent } from '../types'

interface DiffContentResult {
  oldContent: string | null
  newContent: string | null
  loading: boolean
  error: string | null
}

export function useDiffContent(projectId: string, filePath: string): DiffContentResult {
  const [state, setState] = useState<DiffContentResult>({
    oldContent: null,
    newContent: null,
    loading: true,
    error: null
  })
  const loadIdRef = useRef(0)

  useEffect(() => {
    const loadId = ++loadIdRef.current
    setState({ oldContent: null, newContent: null, loading: true, error: null })

    window.api
      .invoke('git:get-file-diff', { projectId, filePath })
      .then((result: unknown) => {
        if (loadId !== loadIdRef.current) return
        if (!result) {
          setState({ oldContent: null, newContent: null, loading: false, error: 'Failed to load diff' })
          return
        }
        const data = result as { oldContent: string; newContent: string }
        setState({
          oldContent: data.oldContent,
          newContent: data.newContent,
          loading: false,
          error: null
        })
      })
      .catch((err: Error) => {
        if (loadId !== loadIdRef.current) return
        setState({
          oldContent: null,
          newContent: null,
          loading: false,
          error: err.message || 'Failed to load diff'
        })
      })
  }, [projectId, filePath])

  // Auto-refresh on file changes from @parcel/watcher
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined

    const unsub = window.api.on('filesystem:files-changed', (payload: unknown) => {
      const { projectId: eventProjectId, changes } = payload as FileChangeEvent
      if (eventProjectId !== projectId) return

      const isAffected = changes.some((c) => c.path === filePath)
      if (!isAffected) return

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const loadId = ++loadIdRef.current
        setState((prev) => ({ ...prev, loading: true }))
        window.api
          .invoke('git:get-file-diff', { projectId, filePath })
          .then((result: unknown) => {
            if (loadId !== loadIdRef.current) return
            if (!result) {
              setState({ oldContent: null, newContent: null, loading: false, error: 'Diff not available' })
              return
            }
            const data = result as { oldContent: string; newContent: string }
            setState({
              oldContent: data.oldContent,
              newContent: data.newContent,
              loading: false,
              error: null
            })
          })
          .catch((err: Error) => {
            if (loadId !== loadIdRef.current) return
            setState({
              oldContent: null,
              newContent: null,
              loading: false,
              error: err.message
            })
          })
      }, 300)
    })

    return () => {
      unsub()
      clearTimeout(debounceTimer)
    }
  }, [projectId, filePath])

  return state
}
