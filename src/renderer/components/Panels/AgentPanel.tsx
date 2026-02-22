import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { useAppStore } from '../../stores/appStore'
import { AGENT_DEFINITIONS } from '../../constants/agents'
import PanelContainer from './PanelContainer'
import PanelExited from './PanelExited'
import AgentTabBar from './AgentTabBar'
import type { AgentId } from '../../types'

function buildAgentArgs(agentId: AgentId, claudeArgs?: string[]): string[] {
  const args = agentId === 'claude' ? [...(claudeArgs || [])] : []
  const agentDef = AGENT_DEFINITIONS.find((a) => a.id === agentId)
  if (agentDef) {
    args.push(...agentDef.defaultArgs)
  }
  return args
}

interface AgentPanelProps {
  projectId: string
  cwd: string
  claudeArgs?: string[]
}

export default function AgentPanel({
  projectId,
  cwd,
  claudeArgs
}: AgentPanelProps): JSX.Element {
  const focusedPanel = useAppStore((s) => s.focusedPanel)
  const detectedAgents = useAppStore((s) => s.detectedAgents)
  const activeAgents = useAppStore((s) => s.activeAgents)
  const activatedAgentsPerProject = useAppStore((s) => s.activatedAgentsPerProject)
  const exitedTerminals = useAppStore((s) => s.exitedTerminals)

  const activeAgentId = activeAgents.get(projectId) || 'claude'
  const savedActivated = activatedAgentsPerProject.get(projectId)

  // Which agents have had their terminal rendered (lazy init)
  const [activatedAgents, setLocalActivatedAgents] = useState<Set<AgentId>>(() => {
    if (savedActivated && savedActivated.length > 0) {
      return new Set(savedActivated)
    }
    return new Set([activeAgentId])
  })

  // Agents restored from saved state should resume their last session.
  // This set is created once on mount and never changes — agents activated
  // later by user clicks are NOT in this set and start fresh.
  const [resumingAgents] = useState<Set<AgentId>>(() => {
    if (savedActivated && savedActivated.length > 0) {
      return new Set(savedActivated)
    }
    return new Set<AgentId>()
  })

  // Debounced persist of activated agents + active tab to config
  const persistTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const persistAgentState = useCallback(() => {
    clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      const state = useAppStore.getState()
      const agentSessions: Record<string, { activeAgent: string; activatedAgents: string[] }> = {}
      for (const [pid] of state.activatedAgentsPerProject) {
        const active = state.activeAgents.get(pid) || 'claude'
        const activated = state.activatedAgentsPerProject.get(pid) || [active]
        agentSessions[pid] = { activeAgent: active, activatedAgents: activated }
      }
      window.api.invoke('config:update-settings', { agentSessions })
    }, 500)
  }, [])

  // Clean up debounce timer
  useEffect(() => {
    return () => clearTimeout(persistTimerRef.current)
  }, [])

  // Sync local activatedAgents to store + persist
  useEffect(() => {
    const agents = Array.from(activatedAgents)
    useAppStore.getState().setActivatedAgents(projectId, agents)
  }, [activatedAgents, projectId])

  // Persist whenever store agent state changes
  useEffect(() => {
    persistAgentState()
  }, [activeAgentId, activatedAgents, persistAgentState])

  // Filter agent definitions to only detected agents
  const availableAgents = useMemo(
    () => AGENT_DEFINITIONS.filter((a) => detectedAgents.includes(a.id)),
    [detectedAgents]
  )

  // Build set of exited agent IDs for the tab bar indicator
  const exitedAgentIds = useMemo(() => {
    const set = new Set<string>()
    for (const agent of availableAgents) {
      const termId = `agent-${agent.id}-${projectId}`
      if (exitedTerminals.has(termId)) {
        set.add(agent.id)
      }
    }
    return set
  }, [availableAgents, projectId, exitedTerminals])

  const handleSelectAgent = useCallback(
    (id: AgentId) => {
      setLocalActivatedAgents((prev) => {
        if (prev.has(id)) return prev
        return new Set(prev).add(id)
      })
      useAppStore.getState().setActiveAgent(projectId, id)
    },
    [projectId]
  )

  // Listen for Ctrl+Tab cycling shortcut
  useEffect(() => {
    const unsub = window.api.on('shortcut:cycle-agent', (payload: unknown) => {
      const { direction } = payload as { direction: 'next' | 'prev' }
      if (availableAgents.length <= 1) return
      const currentIndex = availableAgents.findIndex((a) => a.id === activeAgentId)
      let nextIndex: number
      if (direction === 'next') {
        nextIndex = (currentIndex + 1) % availableAgents.length
      } else {
        nextIndex = (currentIndex - 1 + availableAgents.length) % availableAgents.length
      }
      handleSelectAgent(availableAgents[nextIndex].id)
    })
    return unsub
  }, [availableAgents, activeAgentId, handleSelectAgent])

  const activeTerminalId = `agent-${activeAgentId}-${projectId}`
  const isActiveExited = exitedTerminals.has(activeTerminalId)

  const handleRestart = (): void => {
    useAppStore.getState().clearTerminalExited(activeTerminalId)
    const restartArgs = buildAgentArgs(activeAgentId, claudeArgs)
    window.api.invoke('terminal:create', {
      terminalId: activeTerminalId,
      type: activeAgentId,
      projectId,
      cwd,
      agentArgs: restartArgs
    })
  }

  // Only show tabs if more than one agent is detected
  const showTabs = availableAgents.length > 1

  const headerContent = showTabs ? (
    <AgentTabBar
      agents={availableAgents}
      activeAgentId={activeAgentId}
      exitedAgentIds={exitedAgentIds}
      onSelectAgent={handleSelectAgent}
    />
  ) : undefined

  return (
    <PanelContainer
      type="claude"
      label={availableAgents.find((a) => a.id === activeAgentId)?.label || 'Claude Code'}
      isFocused={focusedPanel === 'claude'}
      onFocus={() => useAppStore.getState().setFocusedPanel('claude')}
      headerContent={headerContent}
    >
      <div className="relative h-full w-full">
        {Array.from(activatedAgents).map((agentId) => (
          <AgentTerminal
            key={`${agentId}-${projectId}`}
            agentId={agentId}
            projectId={projectId}
            cwd={cwd}
            claudeArgs={claudeArgs}
            isActive={agentId === activeAgentId}
            isFocused={focusedPanel === 'claude'}
            isResuming={resumingAgents.has(agentId)}
          />
        ))}
        {isActiveExited && (
          <PanelExited
            label={availableAgents.find((a) => a.id === activeAgentId)?.label || 'Agent'}
            onRestart={handleRestart}
          />
        )}
      </div>
    </PanelContainer>
  )
}

interface AgentTerminalProps {
  agentId: AgentId
  projectId: string
  cwd: string
  claudeArgs?: string[]
  isActive: boolean
  isFocused: boolean
  isResuming: boolean
}

const AgentTerminal = memo(function AgentTerminal({
  agentId,
  projectId,
  cwd,
  claudeArgs,
  isActive,
  isFocused,
  isResuming
}: AgentTerminalProps): JSX.Element {
  const terminalId = `agent-${agentId}-${projectId}`
  const agentDef = AGENT_DEFINITIONS.find((a) => a.id === agentId)

  // Compute args: user args + default args (permissions) + resume args
  const agentArgs = useMemo(() => {
    const base = buildAgentArgs(agentId, claudeArgs)
    if (isResuming && agentDef && agentDef.resumeArgs.length > 0) {
      base.push(...agentDef.resumeArgs)
    }
    return base
  }, [agentId, claudeArgs, isResuming, agentDef])

  const { attachRef, terminal } = useTerminal({
    terminalId,
    type: agentId,
    projectId,
    cwd,
    agentArgs,
    isActive
  })

  // Focus terminal when this agent tab is active and panel is focused
  useEffect(() => {
    if (isActive && isFocused && terminal.current) {
      terminal.current.focus()
    }
  }, [isActive, isFocused, terminal])

  return (
    <div
      className="h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
      ref={attachRef}
    />
  )
})
