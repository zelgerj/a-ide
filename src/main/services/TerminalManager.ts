import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { execSync } from 'child_process'
import os from 'os'
import fs from 'fs'
import path from 'path'

const DEFAULT_SHELL = process.env.SHELL || '/bin/zsh'
const BATCH_INTERVAL = 5 // 5ms — optimal for throughput vs latency
const BATCH_MAX_SIZE = 200 * 1024 // 200KB

const AGENT_BINARIES = ['claude', 'codex', 'gemini', 'opencode'] as const
type AgentBinary = (typeof AGENT_BINARIES)[number]
type TerminalType = 'shell' | AgentBinary

/**
 * Resolve the full PATH from the user's login shell.
 * Electron apps launched from Dock/Finder don't inherit the shell PATH.
 */
function resolveLoginShellPath(): string {
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    // Ask the login shell for its PATH
    const result = execSync(`${shell} -ilc 'echo $PATH'`, {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env }
    }).trim()
    return result || process.env.PATH || ''
  } catch {
    return process.env.PATH || ''
  }
}

/**
 * Resolve the absolute path to a CLI binary by name.
 */
function resolveAgentBinaryPath(binaryName: string, envPath: string): string | null {
  // Common install locations
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', binaryName),
    path.join(os.homedir(), `.${binaryName}`, 'bin', binaryName),
    `/usr/local/bin/${binaryName}`,
    `/opt/homebrew/bin/${binaryName}`
  ]

  // Also search PATH directories
  for (const dir of envPath.split(':')) {
    if (dir) candidates.push(path.join(dir, binaryName))
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        fs.accessSync(candidate, fs.constants.X_OK)
        return candidate
      }
    } catch {
      // Not executable or doesn't exist
    }
  }

  return null
}

// Resolve once at startup
const loginShellPath = resolveLoginShellPath()
const agentBinaryPaths = new Map<string, string>()
for (const binary of AGENT_BINARIES) {
  const resolved = resolveAgentBinaryPath(binary, loginShellPath)
  if (resolved) agentBinaryPaths.set(binary, resolved)
}

interface PtyInstance {
  process: pty.IPty
  batcher: PtyBatcher
  onExitDisposable: { dispose(): void }
  onDataDisposable: { dispose(): void }
  type: TerminalType
  projectId: string
  cwd: string
}

class PtyBatcher {
  private buffer = ''
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private send: (data: string) => void) {}

  push(data: string): void {
    this.buffer += data
    if (this.buffer.length >= BATCH_MAX_SIZE) {
      this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), BATCH_INTERVAL)
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.buffer.length > 0) {
      this.send(this.buffer)
      this.buffer = ''
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.buffer = ''
  }
}

class TerminalManager {
  private ptys: Map<string, PtyInstance> = new Map()
  private mainWindow: BrowserWindow | null = null
  private cdpPort: number = 0

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  setCDPPort(port: number): void {
    this.cdpPort = port
  }

  getDetectedAgents(): string[] {
    return Array.from(agentBinaryPaths.keys())
  }

  create(
    terminalId: string,
    type: TerminalType,
    projectId: string,
    cwd: string,
    agentArgs?: string[]
  ): void {
    // Kill existing pty if any
    this.kill(terminalId)

    const env: Record<string, string> = {
      ...process.env,
      PATH: loginShellPath,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'A-IDE'
    } as Record<string, string>

    let shell: string
    let args: string[]

    if (type === 'shell') {
      shell = DEFAULT_SHELL
      args = []
    } else {
      // Inject CDP proxy env vars into agent terminals.
      // URL includes /project/<id> so the proxy routes this connection
      // to the correct project's browser target — even if the user
      // switches to a different project while this agent is running.
      if (this.cdpPort > 0) {
        env.AIDE_BROWSER_CDP_PORT = String(this.cdpPort)
        env.AIDE_BROWSER_CDP_URL = `http://127.0.0.1:${this.cdpPort}/project/${projectId}`
        env.AIDE_BROWSER_CDP_ENDPOINT = `http://127.0.0.1:${this.cdpPort}/project/${projectId}`
      }
      // Agent type — resolve binary from the detected paths
      const binaryPath = agentBinaryPaths.get(type)
      shell = binaryPath || type // Fallback to bare name if not in map
      args = agentArgs || []
    }

    let ptyProcess: pty.IPty
    try {
      ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env
      })
    } catch (err) {
      console.error(`[TerminalManager] Failed to spawn pty for ${terminalId}:`, err)
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('terminal:exit', { terminalId, exitCode: 1, signal: 0 })
      }
      return
    }

    const batcher = new PtyBatcher((data: string) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('terminal:data', { terminalId, data })
      }
    })

    const onDataDisposable = ptyProcess.onData((data: string) => {
      batcher.push(data)
    })

    const onExitDisposable = ptyProcess.onExit(({ exitCode, signal }) => {
      batcher.flush()
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('terminal:exit', { terminalId, exitCode, signal })
      }
      this.ptys.delete(terminalId)
    })

    this.ptys.set(terminalId, {
      process: ptyProcess,
      batcher,
      onExitDisposable,
      onDataDisposable,
      type,
      projectId,
      cwd
    })
  }

  write(terminalId: string, data: string): void {
    const instance = this.ptys.get(terminalId)
    if (instance) {
      instance.process.write(data)
    }
  }

  resize(terminalId: string, cols: number, rows: number): void {
    const instance = this.ptys.get(terminalId)
    if (instance) {
      try {
        instance.process.resize(cols, rows)
      } catch {
        // Resize may fail if process has exited
      }
    }
  }

  restart(terminalId: string): void {
    const instance = this.ptys.get(terminalId)
    if (!instance) return

    const { type, projectId, cwd } = instance
    this.kill(terminalId)
    this.create(terminalId, type, projectId, cwd)
  }

  kill(terminalId: string): void {
    const instance = this.ptys.get(terminalId)
    if (instance) {
      // Dispose event handlers BEFORE killing to prevent stale onExit/onData
      // callbacks from firing after the process is replaced by a new one.
      instance.onExitDisposable.dispose()
      instance.onDataDisposable.dispose()
      instance.batcher.dispose()
      try {
        instance.process.kill()
      } catch {
        // Already dead
      }
      this.ptys.delete(terminalId)
    }
  }

  killByProject(projectId: string): void {
    for (const [id, instance] of this.ptys) {
      if (instance.projectId === projectId) {
        this.kill(id)
      }
    }
  }

  killAll(): void {
    for (const id of Array.from(this.ptys.keys())) {
      this.kill(id)
    }
  }

  getByProject(projectId: string): string[] {
    const ids: string[] = []
    for (const [id, instance] of this.ptys) {
      if (instance.projectId === projectId) {
        ids.push(id)
      }
    }
    return ids
  }

  isAlive(terminalId: string): boolean {
    return this.ptys.has(terminalId)
  }
}

export const terminalManager = new TerminalManager()
