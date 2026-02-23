import { useState, useEffect, useRef } from 'react'

interface FileContentResult {
  content: string | null
  binary: boolean
  loading: boolean
  error: string | null
  mimeType?: string
  truncated: boolean
  size: number
}

interface CacheEntry {
  content: string
  binary: boolean
  mimeType?: string
  truncated: boolean
  size: number
}

const cache = new Map<string, CacheEntry>()
const cacheOrder: string[] = []
const MAX_CACHE_ENTRIES = 5
const MAX_CACHE_BYTES = 5 * 1024 * 1024

function getCachedSize(): number {
  let total = 0
  for (const entry of cache.values()) {
    total += entry.content.length
  }
  return total
}

function evictCache(): void {
  while ((cache.size > MAX_CACHE_ENTRIES || getCachedSize() > MAX_CACHE_BYTES) && cacheOrder.length > 0) {
    const oldest = cacheOrder.shift()!
    cache.delete(oldest)
  }
}

export function useFileContent(projectId: string, filePath: string | null): FileContentResult {
  const [state, setState] = useState<FileContentResult>({
    content: null,
    binary: false,
    loading: false,
    error: null,
    truncated: false,
    size: 0
  })
  const loadIdRef = useRef(0)

  useEffect(() => {
    if (!filePath) {
      setState({ content: null, binary: false, loading: false, error: null, truncated: false, size: 0 })
      return
    }

    // Check cache first
    const cached = cache.get(filePath)
    if (cached) {
      setState({
        content: cached.content,
        binary: cached.binary,
        loading: false,
        error: null,
        mimeType: cached.mimeType,
        truncated: cached.truncated,
        size: cached.size
      })
      return
    }

    const loadId = ++loadIdRef.current
    setState((prev) => ({ ...prev, loading: true, error: null }))

    window.api
      .invoke('filesystem:read-file', { projectId, filePath })
      .then((result: unknown) => {
        if (loadId !== loadIdRef.current) return
        const data = result as {
          content: string
          binary: boolean
          truncated: boolean
          size: number
          mimeType?: string
        }

        // Cache the result
        cache.set(filePath, {
          content: data.content,
          binary: data.binary,
          mimeType: data.mimeType,
          truncated: data.truncated,
          size: data.size
        })
        cacheOrder.push(filePath)
        evictCache()

        setState({
          content: data.content,
          binary: data.binary,
          loading: false,
          error: null,
          mimeType: data.mimeType,
          truncated: data.truncated,
          size: data.size
        })
      })
      .catch((err: Error) => {
        if (loadId !== loadIdRef.current) return
        setState({
          content: null,
          binary: false,
          loading: false,
          error: err.message || 'Failed to load file',
          truncated: false,
          size: 0
        })
      })
  }, [projectId, filePath])

  return state
}
