interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-secondary border border-border-primary rounded-lg shadow-xl max-w-sm mx-4 overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-sm font-semibold text-text-bright mb-2">{title}</h3>
          <p className="text-sm text-text-secondary">{message}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-bg-tertiary border-t border-border-primary">
          <button
            onClick={onCancel}
            className="
              px-3 py-1.5 rounded-md text-sm
              text-text-primary bg-bg-primary border border-border-primary
              hover:bg-bg-hover transition-colors
            "
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`
              px-3 py-1.5 rounded-md text-sm font-medium
              text-text-bright transition-colors
              ${destructive
                ? 'bg-accent-red hover:bg-accent-red/80'
                : 'bg-accent-blue hover:bg-accent-blue/80'
              }
            `}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
