import { ipcMain } from 'electron'
import { browserManager } from '../services/BrowserManager'
import { browserCDPProxy } from '../services/BrowserCDPProxy'
import { sessionManager } from '../services/SessionManager'

export function registerBrowserIpc(): void {
  ipcMain.handle('browser:hide-all', async () => {
    browserManager.hideAll()
    return { success: true }
  })

  ipcMain.handle('browser:hide-except', async (_event, keepProjectId: string) => {
    browserManager.hideAllExcept(keepProjectId)
    return { success: true }
  })

  ipcMain.handle(
    'browser:navigate',
    async (_event, args: { projectId: string; url: string }) => {
      browserManager.navigate(args.projectId, args.url)

      // If this is the active project and view was just created on-demand,
      // register it with the CDP proxy
      if (sessionManager.getActiveProjectId() === args.projectId) {
        const view = browserManager.getView(args.projectId)
        if (view) {
          browserCDPProxy.registerView(args.projectId, view)
          browserCDPProxy.setActiveProject(args.projectId)
        }
      }

      return { success: true }
    }
  )

  ipcMain.handle('browser:go-back', async (_event, args: { projectId: string }) => {
    browserManager.goBack(args.projectId)
    return { success: true }
  })

  ipcMain.handle('browser:go-forward', async (_event, args: { projectId: string }) => {
    browserManager.goForward(args.projectId)
    return { success: true }
  })

  ipcMain.handle('browser:reload', async (_event, args: { projectId: string }) => {
    browserManager.reload(args.projectId)
    return { success: true }
  })

  ipcMain.handle('browser:toggle-devtools', async (_event, args: { projectId: string }) => {
    // With --remote-debugging-port, Chrome's CDP server and DevTools coexist.
    // No need to detach/reattach debugger.
    browserManager.toggleDevTools(args.projectId)
    return { success: true }
  })

  ipcMain.handle(
    'browser:set-bounds',
    async (
      _event,
      args: { projectId: string; bounds: { x: number; y: number; width: number; height: number } }
    ) => {
      browserManager.setBounds(args.projectId, args.bounds)
      return { success: true }
    }
  )
}
