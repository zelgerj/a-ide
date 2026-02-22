import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { configManager, type ProjectConfig } from '../services/ConfigManager'

export function registerProjectIpc(): void {
  ipcMain.handle('project:add', async (_event, args: { path: string }) => {
    const projectPath = args.path
    const name = path.basename(projectPath)

    // Check for .a-ide.json project config
    let browserUrl: string | undefined
    let startCommand: string | undefined
    let claudeArgs: string[] | undefined

    const configPath = path.join(projectPath, '.a-ide.json')
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        browserUrl = config.browserUrl
        startCommand = config.startCommand
        claudeArgs = config.claudeArgs
      } catch {
        // Invalid config, ignore
      }
    }

    const project: ProjectConfig = {
      id: uuidv4(),
      name,
      path: projectPath,
      browserUrl,
      startCommand,
      claudeArgs,
      addedAt: Date.now()
    }

    configManager.addProject(project)
    return project
  })

  ipcMain.handle('project:remove', async (_event, projectId: string) => {
    configManager.removeProject(projectId)
    return { success: true }
  })

  ipcMain.handle('project:list', async () => {
    return configManager.getProjects()
  })

  ipcMain.handle('project:get-config', async (_event, projectId: string) => {
    return configManager.getProject(projectId) || null
  })

  ipcMain.handle('project:reorder', async (_event, order: string[]) => {
    configManager.reorderProjects(order)
    return { success: true }
  })

  ipcMain.handle('app:open-folder-dialog', async () => {
    const mainWindow = BrowserWindow.getFocusedWindow()
    if (!mainWindow) return null

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Open Project Folder'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const projectPath = result.filePaths[0]
    const name = path.basename(projectPath)

    // Check for .a-ide.json project config
    let browserUrl: string | undefined
    let startCommand: string | undefined
    let claudeArgs: string[] | undefined

    const configPath = path.join(projectPath, '.a-ide.json')
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        browserUrl = config.browserUrl
        startCommand = config.startCommand
        claudeArgs = config.claudeArgs
      } catch {
        // Invalid config, ignore
      }
    }

    const project: ProjectConfig = {
      id: uuidv4(),
      name,
      path: projectPath,
      browserUrl,
      startCommand,
      claudeArgs,
      addedAt: Date.now()
    }

    configManager.addProject(project)
    return project
  })
}
