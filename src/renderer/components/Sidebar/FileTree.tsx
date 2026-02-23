import { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { Tree, type NodeRendererProps } from 'react-arborist'
import { useAppStore } from '../../stores/appStore'
import { getFileIcon, getChevronIcon } from '../Shared/FileIcons'
import type { DirEntry, ChangedFile, FileChangeEvent } from '../../types'

interface FileTreeProps {
  projectId: string
  projectPath: string
}

interface TreeNode {
  id: string
  name: string
  isDirectory: boolean
  children?: TreeNode[]
}

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
  '.json': 'json', '.md': 'markdown', '.mdx': 'markdown',
  '.css': 'css', '.scss': 'scss', '.html': 'html',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.h': 'c',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'toml',
  '.xml': 'xml', '.svg': 'svg',
  '.sql': 'sql', '.graphql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.swift': 'swift', '.kt': 'kotlin',
  '.vue': 'vue', '.svelte': 'svelte',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
  '.gif': 'image', '.webp': 'image', '.ico': 'image',
}

function getLanguage(name: string): string {
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : ''
  return LANGUAGE_MAP[ext] || 'text'
}

const STATUS_COLORS: Record<string, string> = {
  modified: '#e2c08d',
  added: '#73c991',
  untracked: '#73c991',
  deleted: '#c74e39',
  renamed: '#73c991'
}

const STATUS_LABELS: Record<string, string> = {
  modified: 'M',
  added: 'A',
  untracked: 'U',
  deleted: 'D',
  renamed: 'R'
}

function Node({ node, style, tree }: NodeRendererProps<TreeNode>): JSX.Element {
  const data = node.data
  const projectId = (tree.props as { projectId?: string }).projectId
  const openFile = useAppStore((s) => projectId ? s.openFiles.get(projectId) : undefined)
  const openDiff = useAppStore((s) => projectId ? s.openDiff.get(projectId) : undefined)
  const changedFiles = useAppStore((s) => projectId ? s.changedFiles.get(projectId) : undefined)

  const isActiveFile = !data.isDirectory && (openFile?.filePath === data.id || openDiff?.filePath === data.id)

  // Find if this file has a git change status
  const changeStatus = useMemo(() => {
    if (data.isDirectory || !changedFiles) return undefined
    return changedFiles.find((f) => f.absolutePath === data.id)?.status
  }, [data.isDirectory, data.id, changedFiles])

  const statusColor = changeStatus ? STATUS_COLORS[changeStatus] : undefined
  const statusLabel = changeStatus ? STATUS_LABELS[changeStatus] : undefined

  const indent = 8 + node.level * 14

  return (
    <div
      style={{ ...style, paddingLeft: indent }}
      className={`
        flex items-center gap-1 pr-2 h-[26px] cursor-pointer text-[12px] leading-none overflow-hidden
        ${isActiveFile ? 'bg-bg-active text-text-bright' : node.isSelected ? 'bg-bg-active text-text-bright' : 'text-text-primary hover:bg-bg-hover'}
      `}
      onClick={(e) => {
        e.stopPropagation()
        if (data.isDirectory) {
          node.toggle()
        } else {
          node.select()
        }
      }}
    >
      {data.isDirectory ? (
        <span className="flex-shrink-0 text-text-secondary flex items-center justify-center" style={{ width: 14 }}>
          {getChevronIcon(node.isOpen)}
        </span>
      ) : (
        <span className="flex-shrink-0" style={{ width: 14 }} />
      )}
      <span className="flex-shrink-0 flex items-center justify-center text-text-secondary" style={{ width: 16 }}>
        {getFileIcon(data.name, data.isDirectory, node.isOpen)}
      </span>
      <span
        className="truncate"
        style={statusColor ? { color: statusColor } : undefined}
      >
        {data.name}
      </span>
      {statusLabel && (
        <span
          className="ml-auto flex-shrink-0 text-[10px] font-mono font-bold leading-none"
          style={{ color: statusColor }}
        >
          {statusLabel}
        </span>
      )}
    </div>
  )
}

export default function FileTree({ projectId, projectPath }: FileTreeProps): JSX.Element {
  const [treeData, setTreeData] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  // Track expanded dirs for selective refresh
  const expandedDirs = useRef(new Set<string>())
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(400)
  const [containerWidth, setContainerWidth] = useState(220)

  const showChangesOnly = useAppStore((s) => s.fileTreeShowChangesOnly)
  const changedFiles = useAppStore((s) => s.changedFiles.get(projectId))

  // Build flat tree data for changes-only mode
  const changesOnlyData = useMemo((): TreeNode[] => {
    if (!changedFiles || changedFiles.length === 0) return []
    return [...changedFiles]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => ({
        id: f.absolutePath,
        name: f.path, // Show relative path in changes-only mode
        isDirectory: false
      }))
  }, [changedFiles])

  const effectiveTreeData = showChangesOnly ? changesOnlyData : treeData

  // Reusable root loader
  const loadRoot = useCallback(async () => {
    try {
      const entries = (await window.api.invoke('filesystem:read-dir', {
        projectId,
        dirPath: projectPath
      })) as DirEntry[]

      const nodes: TreeNode[] = entries.map((entry) => ({
        id: entry.path,
        name: entry.name,
        isDirectory: entry.isDirectory,
        children: entry.isDirectory ? [] : undefined
      }))

      setTreeData(nodes)
    } catch (err) {
      console.error('[FileTree] Failed to load root:', err)
    }
  }, [projectId, projectPath])

  // Load root directory on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    loadRoot().finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [loadRoot])

  const loadChildren = useCallback(
    async (dirPath: string) => {
      try {
        const entries = (await window.api.invoke('filesystem:read-dir', {
          projectId,
          dirPath
        })) as DirEntry[]

        const childNodes: TreeNode[] = entries.map((entry) => ({
          id: entry.path,
          name: entry.name,
          isDirectory: entry.isDirectory,
          children: entry.isDirectory ? [] : undefined
        }))

        setTreeData((prev) => updateChildren(prev, dirPath, childNodes))
      } catch (err) {
        console.error('[FileTree] Failed to load children:', err)
      }
    },
    [projectId]
  )

  // Listen for files-changed events to refresh affected expanded dirs
  useEffect(() => {
    const unsub = window.api.on('filesystem:files-changed', (payload: unknown) => {
      const { projectId: eventProjectId, affectedDirs } = payload as FileChangeEvent
      if (eventProjectId !== projectId) return

      for (const dir of affectedDirs) {
        if (dir === projectPath) {
          loadRoot()
        } else if (expandedDirs.current.has(dir)) {
          loadChildren(dir)
        }
      }
    })
    return unsub
  }, [projectId, projectPath, loadRoot, loadChildren])

  // Measure container dimensions for virtualization.
  // Depends on `loading` so the observer is attached after the tree container mounts
  // (during loading a different element is rendered and containerRef is null).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [loading])

  const handleToggle = useCallback(
    (id: string) => {
      const isExpanding = !expandedDirs.current.has(id)
      if (isExpanding) {
        expandedDirs.current.add(id)
        loadChildren(id)
      } else {
        expandedDirs.current.delete(id)
      }
    },
    [loadChildren]
  )

  const handleSelect = useCallback(
    (nodes: { data: TreeNode }[]) => {
      if (nodes.length === 0) return
      const node = nodes[0].data
      if (node.isDirectory) return

      const store = useAppStore.getState()
      const files = store.changedFiles.get(projectId)
      const isChanged = files?.some((f) => f.absolutePath === node.id)

      if (isChanged) {
        // Open diff view for changed files
        store.setOpenDiff(projectId, {
          filePath: node.id,
          fileName: node.name,
          language: getLanguage(node.name)
        })
      } else {
        // Open normal file viewer for unchanged files
        store.setOpenFile(projectId, {
          filePath: node.id,
          fileName: node.name,
          language: getLanguage(node.name)
        })
      }
    },
    [projectId]
  )

  if (loading && !showChangesOnly) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <FilterBar projectId={projectId} />
        <div className="flex items-center justify-center h-20 text-text-secondary text-xs">
          Loading...
        </div>
      </div>
    )
  }

  if (effectiveTreeData.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <FilterBar projectId={projectId} />
        <div className="flex items-center justify-center h-20 text-text-secondary text-xs">
          {showChangesOnly ? 'No changed files' : 'Empty directory'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <FilterBar projectId={projectId} />
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
        <Tree<TreeNode>
          data={effectiveTreeData}
          openByDefault={false}
          disableDrag={true}
          disableDrop={true}
          rowHeight={26}
          indent={14}
          width={containerWidth}
          height={containerHeight}
          onToggle={showChangesOnly ? undefined : handleToggle}
          onSelect={handleSelect}
          // Pass projectId so Node can access it for active-file highlighting
          {...({ projectId } as Record<string, unknown>)}
        >
          {Node}
        </Tree>
      </div>
    </div>
  )
}

function FilterBar({ projectId }: { projectId: string }): JSX.Element {
  const showChangesOnly = useAppStore((s) => s.fileTreeShowChangesOnly)
  const changedFiles = useAppStore((s) => s.changedFiles.get(projectId))
  const changeCount = changedFiles?.length ?? 0

  return (
    <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0">
      <button
        onClick={() => useAppStore.getState().setFileTreeShowChangesOnly(!showChangesOnly)}
        className={`
          flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors duration-100
          ${showChangesOnly ? 'bg-bg-active text-text-bright' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}
        `}
        title="Show changed files only"
      >
        {/* Git diff icon (simple SVG) */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="4" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <line x1="6" y1="6.5" x2="6" y2="9.5" />
          <path d="M8.5 4 H12 V8.5" />
        </svg>
        {changeCount > 0 && (
          <span>{changeCount}</span>
        )}
      </button>
    </div>
  )
}

/** Recursively update children for a given dir path in the tree. */
function updateChildren(
  nodes: TreeNode[],
  dirPath: string,
  newChildren: TreeNode[]
): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === dirPath) {
      return { ...node, children: newChildren }
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: updateChildren(node.children, dirPath, newChildren) }
    }
    return node
  })
}
