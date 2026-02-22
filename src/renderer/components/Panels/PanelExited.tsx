interface PanelExitedProps {
  label: string
  onRestart: () => void
}

export default function PanelExited({ label, onRestart }: PanelExitedProps): JSX.Element {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary/90 z-10">
      <p className="text-text-secondary text-sm mb-3">{label} process has exited</p>
      <button
        onClick={onRestart}
        className="
          px-3 py-1.5 rounded-md bg-bg-tertiary border border-border-primary
          text-text-primary text-sm
          hover:bg-bg-hover hover:border-text-secondary
          transition-colors duration-100
        "
      >
        Restart
      </button>
    </div>
  )
}
