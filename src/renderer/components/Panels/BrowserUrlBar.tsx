import { useState, useCallback, useEffect, useRef } from 'react'

interface BrowserUrlBarProps {
  url: string
  loading: boolean
  title: string
  isFocused: boolean
  onNavigate: (url: string) => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onToggleDevTools: () => void
}

export default function BrowserUrlBar({
  url,
  loading,
  title,
  isFocused,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onToggleDevTools
}: BrowserUrlBarProps): JSX.Element {
  const [inputValue, setInputValue] = useState(url)
  const inputRef = useRef<HTMLInputElement>(null)

  // Update input when URL changes externally
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputValue(url)
    }
  }, [url])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (inputValue.trim()) {
        onNavigate(inputValue.trim())
        inputRef.current?.blur()
      }
    },
    [inputValue, onNavigate]
  )

  const handleFocus = useCallback(() => {
    inputRef.current?.select()
  }, [])

  return (
    <div
      className={`
        flex items-center h-[32px] px-2 gap-1 flex-shrink-0 select-none
        border-b transition-colors duration-100
        ${isFocused ? 'border-accent-blue bg-bg-secondary' : 'border-border-primary bg-bg-tertiary'}
      `}
    >
      {/* Navigation buttons */}
      <button
        onClick={onBack}
        className="flex items-center justify-center w-6 h-6 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover text-xs"
        title="Back"
      >
        ‹
      </button>
      <button
        onClick={onForward}
        className="flex items-center justify-center w-6 h-6 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover text-xs"
        title="Forward"
      >
        ›
      </button>
      <button
        onClick={onReload}
        className="flex items-center justify-center w-6 h-6 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover text-xs"
        title="Reload"
      >
        {loading ? '×' : '↻'}
      </button>

      {/* URL input */}
      <form onSubmit={handleSubmit} className="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          placeholder="Enter URL..."
          className="
            w-full h-6 px-2 rounded-sm
            bg-bg-primary border border-border-subtle
            text-text-primary text-xs font-mono
            placeholder:text-text-secondary
            focus:border-accent-blue focus:outline-none
          "
        />
      </form>

      {/* DevTools toggle */}
      <button
        onClick={onToggleDevTools}
        className="flex items-center justify-center w-6 h-6 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover text-[10px]"
        title="Toggle DevTools"
      >
        { '{ }' }
      </button>
    </div>
  )
}
