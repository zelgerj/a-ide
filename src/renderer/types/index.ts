export type AgentId = 'claude' | 'codex' | 'gemini' | 'opencode'

export interface AgentDefinition {
  id: AgentId
  label: string
  binary: string
  defaultArgs: string[]
  resumeArgs: string[]
}

export interface Project {
  id: string
  name: string
  path: string
  browserUrl?: string
  startCommand?: string
  claudeArgs?: string[]
  addedAt: number
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  modified: number
  staged: number
  untracked: number
}

export interface ProjectSession {
  projectId: string
  claudeTerminalId: string
  shellTerminalId: string
  isActivated: boolean // Has this project been activated at least once?
  isLoading: boolean
}

export type PanelType = 'claude' | 'terminal' | 'browser'

export interface PanelSplits {
  vertical: number   // Claude vs Terminal (0-1)
  horizontal: number // Left panels vs Browser (0-1)
}

export interface TerminalData {
  terminalId: string
  data: string
}

export interface TerminalExitInfo {
  terminalId: string
  exitCode: number
  signal?: number
}
