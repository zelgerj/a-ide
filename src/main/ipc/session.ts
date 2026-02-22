import { ipcMain } from 'electron'
import { sessionManager } from '../services/SessionManager'
import { browserManager } from '../services/BrowserManager'
import { browserCDPProxy } from '../services/BrowserCDPProxy'

export function registerSessionIpc(): void {
  ipcMain.handle('session:switch', async (_event, projectId: string) => {
    try {
      const session = await sessionManager.switchToProject(projectId)

      // Eagerly create browser view if it doesn't exist. This loads the
      // placeholder page so Chrome's CDP target is ready before any client
      // connects — eliminates the race where Playwright connects before
      // the view exists.
      const viewExisted = !!browserManager.getView(projectId)
      if (!viewExisted) {
        browserManager.create(projectId)
        browserManager.show(projectId)
      }
      // If the view already existed, switchToProject already called show()

      // Set active project for CDP routing IMMEDIATELY (synchronous)
      browserCDPProxy.setActiveProject(projectId)

      // Register view with CDP proxy in BACKGROUND — don't block the switch.
      // CDP registration involves HTTP polling which can take 50-800ms.
      // Playwright connections will work once registration completes.
      const view = browserManager.getView(projectId)
      if (view) {
        browserCDPProxy.registerView(projectId, view).catch((err) => {
          console.warn('[CDP Proxy] Background registration failed:', (err as Error).message)
        })
      }

      return { success: true, session }
    } catch (error) {
      // Switch was cancelled by a newer request
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('session:get-active', async () => {
    const projectId = sessionManager.getActiveProjectId()
    if (!projectId) return null
    return sessionManager.getSession(projectId) || null
  })
}
