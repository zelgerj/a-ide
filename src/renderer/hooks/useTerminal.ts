import { useRef, useCallback, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'

/**
 * Escape a file path for safe pasting into bash/zsh.
 * Backslash-escapes all shell metacharacters — matches Terminal.app / iTerm2 behavior.
 */
function escapePathForShell(filePath: string): string {
  // eslint-disable-next-line no-useless-escape
  return filePath.replace(/(?=[!"#$&'()*,;<=>?[\\\]^`{|}~ ])/g, '\\')
}

const TERMINAL_THEME: ITheme = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#cccccc',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#1e1e1e',
  red: '#f44747',
  green: '#4ec9b0',
  yellow: '#cca700',
  blue: '#007acc',
  magenta: '#c586c0',
  cyan: '#4ec9b0',
  white: '#cccccc',
  brightBlack: '#808080',
  brightRed: '#f44747',
  brightGreen: '#4ec9b0',
  brightYellow: '#cca700',
  brightBlue: '#007acc',
  brightMagenta: '#c586c0',
  brightCyan: '#4ec9b0',
  brightWhite: '#ffffff'
}

// Module-level terminal registry — persists across Activity transitions.
// Stores Terminal instances and their IPC cleanup functions so they survive
// React lifecycle events (Activity hide/show, StrictMode re-invocations).
const terminalRegistry = new Map<
  string,
  {
    term: Terminal
    ipcCleanup: () => void
  }
>()

/**
 * Clean up all terminal registry entries for a project.
 * Call when a project is permanently removed from the app.
 */
export function destroyProjectTerminals(projectId: string): void {
  for (const [id, entry] of terminalRegistry) {
    if (id.endsWith(`-${projectId}`)) {
      entry.ipcCleanup()
      entry.term.dispose()
      terminalRegistry.delete(id)
    }
  }
}

interface UseTerminalOptions {
  terminalId: string
  type: 'claude' | 'codex' | 'gemini' | 'opencode' | 'shell'
  projectId: string
  cwd: string
  fontSize?: number
  agentArgs?: string[]
  startCommand?: string
  isActive?: boolean
}

interface UseTerminalReturn {
  attachRef: (el: HTMLDivElement | null) => (() => void) | void
  terminal: React.RefObject<Terminal | null>
}

export function useTerminal({
  terminalId,
  type,
  projectId,
  cwd,
  fontSize = 13,
  agentArgs,
  startCommand,
  isActive = true
}: UseTerminalOptions): UseTerminalReturn {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  // Store PTY params in a ref so the callback ref closure always has the latest
  // values without needing them in the useCallback dependency array
  const paramsRef = useRef({ type, projectId, cwd, agentArgs, startCommand })
  paramsRef.current = { type, projectId, cwd, agentArgs, startCommand }

  // Callback ref with React 19 ref cleanup.
  //
  // Terminal + PTY lifecycle is DECOUPLED from React rendering:
  // - Terminal instances and IPC listeners persist in the module-level registry
  // - The callback ref creates them on first mount and REUSES them on subsequent invocations
  //   (Activity transitions, StrictMode re-invocations)
  // - PTY processes in the main process are only killed by explicit actions (restart, project removal)
  // - Cleanup only removes transient DOM listeners (drag-drop), NOT the terminal or IPC
  const attachRef = useCallback(
    (el: HTMLDivElement | null): (() => void) | void => {
      containerRef.current = el
      if (!el) return

      // Drag-drop handlers — added on every ref invocation, removed on cleanup
      const makeDragHandlers = (terminal: Terminal): {
        onDragOver: (e: DragEvent) => void
        onDrop: (e: DragEvent) => void
      } => ({
        onDragOver: (e: DragEvent): void => {
          e.preventDefault()
          e.stopPropagation()
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        },
        onDrop: (e: DragEvent): void => {
          e.preventDefault()
          e.stopPropagation()
          const files = e.dataTransfer?.files
          if (!files || files.length === 0) return
          const paths: string[] = []
          for (let i = 0; i < files.length; i++) {
            const filePath = window.api.getPathForFile(files[i])
            if (filePath) paths.push(escapePathForShell(filePath))
          }
          if (paths.length > 0) {
            terminal.paste(paths.join(' '))
          }
        }
      })

      // Check if terminal already exists in registry (Activity re-show, StrictMode re-invocation).
      // If so, REUSE it — don't destroy the Terminal instance or kill the PTY.
      const existing = terminalRegistry.get(terminalId)
      if (existing) {
        termRef.current = existing.term

        // Update fontSize if it changed (useCallback dep)
        if (existing.term.options.fontSize !== fontSize) {
          existing.term.options.fontSize = fontSize
        }

        // Add drag-drop listeners (they were removed by previous cleanup)
        const { onDragOver, onDrop } = makeDragHandlers(existing.term)
        el.addEventListener('dragover', onDragOver)
        el.addEventListener('drop', onDrop)

        // Cleanup: only remove transient DOM listeners
        return () => {
          el.removeEventListener('dragover', onDragOver)
          el.removeEventListener('drop', onDrop)
        }
      }

      // FIRST TIME — create Terminal instance, IPC subscription, and PTY process.
      // This only runs once per terminalId for the lifetime of the session.
      const term = new Terminal({
        fontSize,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: TERMINAL_THEME,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 10000,
        allowProposedApi: true
      })

      term.open(el)

      // Load web links addon (persistent)
      term.loadAddon(new WebLinksAddon())

      // IPC data subscription — set up BEFORE creating PTY to guarantee no data loss.
      // This listener persists in the registry and keeps receiving PTY output even
      // while the Activity is hidden, so the terminal buffer stays current.
      const unsub = window.api.on('terminal:data', (payload: unknown) => {
        const { terminalId: id, data } = payload as { terminalId: string; data: string }
        if (id === terminalId) {
          term.write(data)
        }
      })

      // Send user input to main process
      term.onData((data: string) => {
        window.api.send('terminal:input', { terminalId, data })
      })

      // Let Cmd+key and Ctrl+Tab pass through to Electron
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.metaKey) return false
        if (event.altKey && ['1', '2', '3'].includes(event.key)) return false
        if (event.ctrlKey && event.key === 'Tab') return false
        return true
      })

      // Drag-and-drop listeners
      const { onDragOver, onDrop } = makeDragHandlers(term)
      el.addEventListener('dragover', onDragOver)
      el.addEventListener('drop', onDrop)

      termRef.current = term
      terminalRegistry.set(terminalId, { term, ipcCleanup: unsub })

      // Create PTY in main process — IPC listener is already set up above
      const params = paramsRef.current
      window.api
        .invoke('terminal:create', {
          terminalId,
          type: params.type,
          projectId: params.projectId,
          cwd: params.cwd,
          agentArgs: params.agentArgs
        })
        .then(() => {
          if (params.startCommand) {
            // Give the shell time to initialize before sending start command
            setTimeout(() => {
              window.api.send('terminal:input', {
                terminalId,
                data: params.startCommand + '\n'
              })
            }, 500)
          }
        })

      // Cleanup: only remove transient DOM listeners.
      // Terminal instance and IPC subscription persist in the registry so they
      // survive Activity hide/show transitions and StrictMode re-invocations.
      // The PTY process in the main process continues running independently.
      return () => {
        el.removeEventListener('dragover', onDragOver)
        el.removeEventListener('drop', onDrop)
      }
    },
    [terminalId, fontSize]
  )

  // Transient effect — re-runs on every Activity visible transition and isActive change.
  // Manages WebGL, FitAddon, and ResizeObserver.
  // These are torn down on Activity hide (or when isActive becomes false) and re-created
  // on Activity show, which solves the WebGL context limit (max ~16 contexts in Chromium).
  useEffect(() => {
    const term = termRef.current
    const container = containerRef.current
    if (!term || !container || !isActive) return

    // Load WebGL addon (only for active/visible terminals)
    let webgl: WebglAddon | null = null
    try {
      webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        webgl?.dispose()
        webgl = null
      })
      term.loadAddon(webgl)
    } catch {
      // WebGL not available, use DOM renderer
    }

    // FitAddon
    const fit = new FitAddon()
    term.loadAddon(fit)

    // Synchronous fit + refresh immediately after WebGL addon loads.
    // This paints terminal content in the same frame as WebGL context creation,
    // eliminating the 1-3 frame blank flash from deferring to rAF.
    try {
      fit.fit()
      term.refresh(0, term.rows - 1)
      window.api.invoke('terminal:resize', {
        terminalId,
        cols: term.cols,
        rows: term.rows
      })
    } catch {
      // Container might not be visible yet — retry on next frame
      requestAnimationFrame(() => {
        try {
          fit.fit()
          term.refresh(0, term.rows - 1)
          window.api.invoke('terminal:resize', {
            terminalId,
            cols: term.cols,
            rows: term.rows
          })
        } catch {
          // Still not ready, ResizeObserver will handle it
        }
      })
    }

    // ResizeObserver for container size changes
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        window.api.invoke('terminal:resize', {
          terminalId,
          cols: term.cols,
          rows: term.rows
        })
      } catch {
        // Ignore resize errors
      }
    })
    ro.observe(container)

    return () => {
      // Runs when Activity hides this terminal, isActive becomes false, or StrictMode re-invokes
      ro.disconnect()
      webgl?.dispose()
      fit.dispose()
    }
  }, [terminalId, isActive])

  return { attachRef, terminal: termRef }
}
