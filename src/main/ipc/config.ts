import { ipcMain } from 'electron'
import { configManager } from '../services/ConfigManager'

export function registerConfigIpc(): void {
  ipcMain.handle('config:get-settings', async () => {
    const globalConfig = configManager.getGlobalConfig()
    const projects = configManager.getProjects()

    return {
      ...globalConfig,
      projects
    }
  })

  ipcMain.handle(
    'config:update-settings',
    async (_event, update: Record<string, unknown>) => {
      configManager.updateGlobalConfig(update as Parameters<typeof configManager.updateGlobalConfig>[0])
      return { success: true }
    }
  )
}
