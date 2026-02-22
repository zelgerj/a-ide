interface WelcomeScreenProps {
  onAddProject: () => void
}

export default function WelcomeScreen({ onAddProject }: WelcomeScreenProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="text-4xl mb-4 opacity-40">◆</div>
      <h2 className="text-lg font-semibold text-text-bright mb-2">Welcome to A-IDE</h2>
      <p className="text-sm text-text-secondary mb-6 max-w-sm">
        A project-centric developer workspace combining Claude Code, terminal, and browser.
      </p>
      <button
        onClick={onAddProject}
        className="
          px-4 py-2 rounded-md bg-accent-blue text-text-bright
          hover:opacity-90 transition-opacity text-sm font-medium
        "
      >
        Open a Project Folder
      </button>
      <p className="text-xs text-text-secondary mt-4 opacity-60">
        or drag a folder from Finder
      </p>
    </div>
  )
}
