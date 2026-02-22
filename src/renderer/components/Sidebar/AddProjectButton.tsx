interface AddProjectButtonProps {
  onClick: () => void
}

export default function AddProjectButton({ onClick }: AddProjectButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="
        flex items-center justify-center mx-2 py-2 rounded-md
        border border-dashed border-border-primary
        text-text-secondary hover:text-text-primary hover:border-text-secondary
        hover:bg-bg-hover transition-colors duration-100
        text-sm
      "
      title="Add project folder (⌘+O)"
    >
      + Add Project
    </button>
  )
}
