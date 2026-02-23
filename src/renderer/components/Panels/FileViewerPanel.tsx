import { useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useFileContent } from '../../hooks/useFileContent'
import { getFileIcon } from '../Shared/FileIcons'
import CodePreview from './CodePreview'
import MarkdownPreview from './MarkdownPreview'

interface FileViewerPanelProps {
  projectId: string
  filePath: string
  fileName: string
  language: string
  onClose: () => void
}

const IMAGE_LANGUAGES = new Set(['image'])
const MARKDOWN_LANGUAGES = new Set(['markdown'])

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileViewerPanel({
  projectId,
  filePath,
  fileName,
  language,
  onClose
}: FileViewerPanelProps): JSX.Element {
  const { content, binary, loading, error, mimeType, truncated, size } = useFileContent(
    projectId,
    filePath
  )

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
  const isImage = IMAGE_LANGUAGES.has(language) && mimeType
  const isMarkdown = MARKDOWN_LANGUAGES.has(language)

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
          <span className="text-[10px] text-text-secondary bg-bg-tertiary px-1.5 py-0.5 rounded flex-shrink-0">
            {language}
          </span>
        </div>
        <button
          onClick={onClose}
          className="
            flex items-center justify-center w-6 h-6 rounded
            text-text-secondary hover:text-text-primary hover:bg-bg-hover
            transition-colors duration-100 text-sm leading-none flex-shrink-0
          "
          title="Close (Esc)"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 bg-bg-primary">
        {loading && (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            Loading...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-accent-red text-sm px-4 text-center">
            {error}
          </div>
        )}

        {truncated && (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm px-4 text-center">
            File too large to display ({formatSize(size)})
          </div>
        )}

        {!loading && !error && !truncated && binary && !isImage && (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            Binary file — cannot display
          </div>
        )}

        {!loading && !error && !truncated && isImage && content && (
          <div className="h-full overflow-auto flex items-center justify-center p-4">
            <img
              src={`data:${mimeType};base64,${content}`}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}

        {!loading && !error && !truncated && !binary && content !== null && isMarkdown && (
          <MarkdownPreview content={content} />
        )}

        {!loading && !error && !truncated && !binary && content !== null && !isMarkdown && (
          <CodePreview content={content} language={language} />
        )}
      </div>
    </div>
  )
}
