import { useEffect, useState, useMemo } from 'react'
import { DiffView, DiffModeEnum, DiffFile } from '@git-diff-view/react'
import { generateDiffFile } from '@git-diff-view/file'
import { useAppStore } from '../../stores/appStore'
import { useDiffContent } from '../../hooks/useDiffContent'
import { getFileIcon } from '../Shared/FileIcons'

interface DiffViewerPanelProps {
  projectId: string
  filePath: string
  fileName: string
  language: string
  onClose: () => void
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  modified: { label: 'M', color: '#e2c08d' },
  added: { label: 'A', color: '#73c991' },
  untracked: { label: 'U', color: '#73c991' },
  deleted: { label: 'D', color: '#c74e39' },
  renamed: { label: 'R', color: '#73c991' }
}

export default function DiffViewerPanel({
  projectId,
  filePath,
  fileName,
  language,
  onClose
}: DiffViewerPanelProps): JSX.Element {
  const [mode, setMode] = useState<DiffModeEnum>(DiffModeEnum.Split)
  const { oldContent, newContent, loading, error } = useDiffContent(projectId, filePath)

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const focusedPanel = useAppStore((s) => s.focusedPanel)
  const isFocused = focusedPanel === 'browser'

  // Find status of this file in changedFiles
  const changedFiles = useAppStore((s) => s.changedFiles.get(projectId))
  const fileStatus = changedFiles?.find((f) => f.absolutePath === filePath || f.path === filePath)?.status
  const badge = fileStatus ? STATUS_BADGE[fileStatus] : undefined

  // Create DiffFile instance
  const diffFile = useMemo(() => {
    if (oldContent === null && newContent === null) return null
    try {
      const df = generateDiffFile(
        fileName,
        oldContent ?? '',
        fileName,
        newContent ?? '',
        language,
        language
      )
      df.initTheme('dark')
      df.init()
      df.buildSplitDiffLines()
      df.buildUnifiedDiffLines()
      return df
    } catch {
      return null
    }
  }, [oldContent, newContent, fileName, language])

  return (
    <div
      className="flex flex-col h-full w-full min-h-0 min-w-0 overflow-hidden"
      onMouseDown={() => useAppStore.getState().setFocusedPanel('browser')}
    >
      {/* Header bar */}
      <div
        className={`
          h-[32px] flex-shrink-0 flex items-center justify-between px-2 gap-1 select-none
          border-b transition-colors duration-100
          ${isFocused ? 'border-accent-blue bg-bg-secondary' : 'border-border-primary bg-bg-tertiary'}
        `}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex-shrink-0 text-text-secondary flex items-center">
            {getFileIcon(fileName, false, false)}
          </span>
          <span className="text-[12px] text-text-bright truncate">{fileName}</span>
          {badge && (
            <span
              className="text-[10px] font-mono font-bold px-1 py-0.5 rounded flex-shrink-0"
              style={{ color: badge.color, backgroundColor: `${badge.color}20` }}
            >
              {badge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Split/Unified toggle */}
          <button
            onClick={() => setMode(DiffModeEnum.Split)}
            className={`
              px-1.5 py-0.5 text-[10px] rounded transition-colors duration-100
              ${mode === DiffModeEnum.Split ? 'bg-bg-active text-text-bright' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}
            `}
            title="Split view"
          >
            Split
          </button>
          <button
            onClick={() => setMode(DiffModeEnum.Unified)}
            className={`
              px-1.5 py-0.5 text-[10px] rounded transition-colors duration-100
              ${mode === DiffModeEnum.Unified ? 'bg-bg-active text-text-bright' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}
            `}
            title="Unified view"
          >
            Unified
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            className="
              flex items-center justify-center w-6 h-6 rounded
              text-text-secondary hover:text-text-primary hover:bg-bg-hover
              transition-colors duration-100 text-sm leading-none
            "
            title="Close (Esc)"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 bg-bg-primary overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            Loading diff...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-accent-red text-sm px-4 text-center">
            {error}
          </div>
        )}

        {!loading && !error && diffFile && (
          <DiffView
            diffFile={diffFile}
            diffViewMode={mode}
            diffViewTheme="dark"
            diffViewHighlight
            diffViewFontSize={12}
            diffViewWrap={false}
          />
        )}

        {!loading && !error && !diffFile && (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            No changes to display
          </div>
        )}
      </div>
    </div>
  )
}
