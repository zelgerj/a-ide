interface PanelLoadingProps {
  label: string
}

export default function PanelLoading({ label }: PanelLoadingProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-text-secondary text-sm">Starting {label}...</p>
    </div>
  )
}
