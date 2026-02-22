import type { ReactNode } from 'react'
import type { PanelType } from '../../types'

interface PanelHeaderProps {
  type: PanelType
  label: string
  isFocused: boolean
  onFocus: () => void
  children?: ReactNode
}

const PANEL_ICONS: Record<PanelType, string> = {
  claude: '◆',
  terminal: '>_',
  browser: '◎'
}

export default function PanelHeader({
  type,
  label,
  isFocused,
  onFocus,
  children
}: PanelHeaderProps): JSX.Element {
  return (
    <div
      onClick={onFocus}
      className={`
        flex items-center h-[32px] px-3 flex-shrink-0 select-none cursor-pointer
        border-b transition-colors duration-100
        ${isFocused ? 'border-accent-blue bg-bg-secondary' : 'border-border-primary bg-bg-tertiary'}
      `}
    >
      {children ? (
        children
      ) : (
        <>
          <span className="text-xs text-text-secondary mr-2 font-mono">
            {PANEL_ICONS[type]}
          </span>
          <span
            className={`text-xs font-medium ${isFocused ? 'text-text-bright' : 'text-text-secondary'}`}
          >
            {label}
          </span>
        </>
      )}
      {isFocused && !children && (
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-blue" />
      )}
    </div>
  )
}
