import type { AgentDefinition } from '../types'

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    binary: 'claude',
    defaultArgs: ['--dangerously-skip-permissions'],
    resumeArgs: ['--continue']
  },
  {
    id: 'codex',
    label: 'Codex',
    binary: 'codex',
    defaultArgs: ['--yolo'],
    resumeArgs: ['resume', '--last']
  },
  {
    id: 'gemini',
    label: 'Gemini',
    binary: 'gemini',
    defaultArgs: ['--yolo'],
    resumeArgs: ['--resume']
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    binary: 'opencode',
    defaultArgs: ['--continue'],
    resumeArgs: ['--continue']
  }
]
