import { ipcMain } from 'electron'
import { gitWatcher } from '../services/GitWatcher'
import { configManager } from '../services/ConfigManager'

export function registerGitIpc(): void {
  ipcMain.handle('git:get-status', async (_event, projectId: string) => {
    const project = configManager.getProject(projectId)
    if (!project) return null
    return gitWatcher.getStatus(project.path)
  })

  ipcMain.handle('git:get-changed-files', async (_event, projectId: string) => {
    const project = configManager.getProject(projectId)
    if (!project) return []
    return gitWatcher.getChangedFiles(project.path)
  })

  ipcMain.handle(
    'git:get-file-diff',
    async (_event, { projectId, filePath }: { projectId: string; filePath: string }) => {
      const project = configManager.getProject(projectId)
      if (!project) return null
      return gitWatcher.getFileDiff(project.path, filePath)
    }
  )
}
