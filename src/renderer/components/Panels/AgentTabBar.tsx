import type { AgentId, AgentDefinition } from '../../types'

interface AgentTabBarProps {
  agents: AgentDefinition[]
  activeAgentId: AgentId
  exitedAgentIds: Set<string>
  onSelectAgent: (id: AgentId) => void
}

export default function AgentTabBar({
  agents,
  activeAgentId,
  exitedAgentIds,
  onSelectAgent
}: AgentTabBarProps): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 h-full w-full">
      {agents.map((agent) => {
        const isActive = agent.id === activeAgentId
        const isExited = exitedAgentIds.has(agent.id)

        return (
          <button
            key={agent.id}
            onClick={(e) => {
              e.stopPropagation()
              onSelectAgent(agent.id)
            }}
            className={`
              flex items-center gap-1.5 px-2.5 h-full relative
              text-xs font-medium transition-colors duration-100
              ${isActive ? 'text-text-bright' : 'text-text-secondary hover:text-text-primary'}
            `}
          >
            <span>{agent.label}</span>
            {isExited && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500/70 flex-shrink-0" />
            )}
            {isActive && (
              <div className="absolute bottom-0 left-1 right-1 h-[2px] bg-accent-blue rounded-t" />
            )}
          </button>
        )
      })}
    </div>
  )
}
