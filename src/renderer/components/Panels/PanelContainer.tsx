import type { ReactNode } from 'react'
import type { PanelType } from '../../types'
import PanelHeader from './PanelHeader'

interface PanelContainerProps {
  type: PanelType
  label: string
  isFocused: boolean
  onFocus: () => void
  children: ReactNode
  headerContent?: ReactNode
}

export default function PanelContainer({
  type,
  label,
  isFocused,
  onFocus,
  children,
  headerContent
}: PanelContainerProps): JSX.Element {
  return (
    <div
      className="flex flex-col h-full w-full min-h-0 min-w-0 overflow-hidden"
      onMouseDown={onFocus}
    >
      <PanelHeader type={type} label={label} isFocused={isFocused} onFocus={onFocus}>
        {headerContent}
      </PanelHeader>
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-bg-primary">
        {children}
      </div>
    </div>
  )
}
