import { ipcMain } from 'electron'
import { terminalManager } from '../services/TerminalManager'

export function registerTerminalIpc(): void {
  ipcMain.handle(
    'terminal:create',
    async (
      _event,
      args: {
        terminalId: string
        type: string
        projectId: string
        cwd: string
        agentArgs?: string[]
      }
    ) => {
      terminalManager.create(
        args.terminalId,
        args.type as 'shell' | 'claude' | 'codex' | 'gemini' | 'opencode',
        args.projectId,
        args.cwd,
        args.agentArgs
      )
      return { success: true }
    }
  )

  ipcMain.handle('agents:detect', () => {
    return terminalManager.getDetectedAgents()
  })

  // High-frequency: use ipcMain.on (fire-and-forget) for terminal input
  ipcMain.on('terminal:input', (_event, args: { terminalId: string; data: string }) => {
    terminalManager.write(args.terminalId, args.data)
  })

  ipcMain.handle(
    'terminal:resize',
    async (_event, args: { terminalId: string; cols: number; rows: number }) => {
      terminalManager.resize(args.terminalId, args.cols, args.rows)
      return { success: true }
    }
  )

  ipcMain.handle('terminal:restart', async (_event, args: { terminalId: string }) => {
    terminalManager.restart(args.terminalId)
    return { success: true }
  })

  ipcMain.handle('terminal:kill', async (_event, args: { terminalId: string }) => {
    terminalManager.kill(args.terminalId)
    return { success: true }
  })
}
