import { app, BrowserWindow, WebContentsView } from 'electron'
import path from 'path'

interface BrowserViewInstance {
  view: WebContentsView
  projectId: string
  currentUrl: string
  isVisible: boolean
  // When true, the view is eligible to be shown. The view only becomes
  // actually visible (added to hierarchy with non-zero bounds) when BOTH
  // shouldShow is true AND setBounds() receives non-zero bounds from the
  // renderer. This prevents flashing stale/wrong bounds during project switches.
  shouldShow: boolean
}

class BrowserManager {
  private views: Map<string, BrowserViewInstance> = new Map()
  private mainWindow: BrowserWindow | null = null
  private currentFocusedPanel: string = 'claude'

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  setFocusedPanel(panel: string): void {
    this.currentFocusedPanel = panel
  }

  create(projectId: string, url?: string): void {
    if (!this.mainWindow) return

    // Destroy existing view for this project
    this.destroy(projectId)

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    // Initial bounds (will be set properly by renderer)
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    this.mainWindow.contentView.addChildView(view)

    const instance: BrowserViewInstance = {
      view,
      projectId,
      currentUrl: url || '',
      isVisible: false,
      shouldShow: false
    }

    // Forward navigation events to renderer
    view.webContents.on('did-navigate', (_event, navUrl) => {
      instance.currentUrl = navUrl
      this.sendToRenderer('browser:url-changed', { projectId, url: navUrl })
    })

    view.webContents.on('did-navigate-in-page', (_event, navUrl) => {
      instance.currentUrl = navUrl
      this.sendToRenderer('browser:url-changed', { projectId, url: navUrl })
    })

    view.webContents.on('page-title-updated', (_event, title) => {
      this.sendToRenderer('browser:title-changed', { projectId, title })
    })

    view.webContents.on('did-start-loading', () => {
      this.sendToRenderer('browser:loading-changed', { projectId, loading: true })
    })

    view.webContents.on('did-stop-loading', () => {
      this.sendToRenderer('browser:loading-changed', { projectId, loading: false })
    })

    view.webContents.on('page-favicon-updated', (_event, favicons) => {
      this.sendToRenderer('browser:favicon-changed', { projectId, favicon: favicons[0] || '' })
    })

    // Prevent browser from stealing focus from terminal
    view.webContents.on('did-finish-load', () => {
      if (this.currentFocusedPanel !== 'browser' && this.mainWindow) {
        this.mainWindow.webContents.focus()
      }
    })

    // Register before-input-event on the view's webContents
    // so our shortcuts work even when browser is focused
    view.webContents.on('before-input-event', (event, input) => {
      if (input.meta && input.key >= '1' && input.key <= '9') {
        event.preventDefault()
        this.sendToRenderer('shortcut:project-switch', { index: parseInt(input.key) - 1 })
      }
      if (input.alt && ['1', '2', '3'].includes(input.key)) {
        event.preventDefault()
        this.sendToRenderer('shortcut:panel-focus', {
          panel: ['claude', 'terminal', 'browser'][parseInt(input.key) - 1]
        })
      }
    })

    this.views.set(projectId, instance)

    // Navigate if URL provided, otherwise load the placeholder page.
    // Chrome's CDP flat-session commands silently fail if the WebContentsView
    // has never loaded any URL — loading a page ensures the renderer process
    // is attached and CDP sessions respond to commands immediately.
    if (url) {
      this.navigate(projectId, url)
    } else {
      view.webContents.loadURL(this.getPlaceholderUrl(projectId))
    }
  }

  navigate(projectId: string, url: string): void {
    // Create view on demand if it doesn't exist yet
    if (!this.views.has(projectId)) {
      this.create(projectId)
    }

    const instance = this.views.get(projectId)
    if (!instance) return

    // Ensure URL has protocol
    let normalizedUrl = url
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
      normalizedUrl = 'http://' + url
    }

    instance.currentUrl = normalizedUrl
    instance.view.webContents.loadURL(normalizedUrl)
  }

  /**
   * Set bounds for a project's browser view.
   *
   * This is the ONLY method that makes a view visible (adds to hierarchy with
   * non-zero bounds). The view must first be marked with show() (shouldShow=true)
   * AND the renderer must provide non-zero bounds. This two-condition gate
   * prevents the view from ever appearing with stale/incorrect bounds during
   * project switches.
   */
  setBounds(projectId: string, bounds: { x: number; y: number; width: number; height: number }): void {
    const instance = this.views.get(projectId)
    if (!instance) return

    if (instance.shouldShow && bounds.width > 0 && bounds.height > 0) {
      instance.view.setBounds(bounds)

      // Add to hierarchy only on the transition from hidden → visible.
      // Subsequent setBounds calls (e.g. from ResizeObserver) just update bounds.
      if (!instance.isVisible && this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          this.mainWindow.contentView.removeChildView(instance.view)
        } catch {
          // May not be in hierarchy
        }
        this.mainWindow.contentView.addChildView(instance.view)
      }
      instance.isVisible = true
    } else {
      instance.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      // Remove from hierarchy when bounds become zero
      if (instance.isVisible && this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          this.mainWindow.contentView.removeChildView(instance.view)
        } catch {
          // Already removed
        }
      }
      instance.isVisible = false
    }
  }

  /**
   * Mark a project's browser view as eligible for display.
   *
   * Does NOT immediately add to hierarchy or set bounds. The view becomes
   * visible only when setBounds() is subsequently called with non-zero bounds
   * from the renderer's BrowserPanel component. This ensures the view always
   * appears at the correct, current position.
   */
  show(projectId: string): void {
    const instance = this.views.get(projectId)
    if (!instance) return

    instance.shouldShow = true
  }

  hide(projectId: string): void {
    const instance = this.views.get(projectId)
    if (!instance) return

    instance.shouldShow = false
    instance.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    instance.isVisible = false

    // Remove from view hierarchy to guarantee it's not rendered.
    // setBounds(0,0,0,0) alone can leave visual artifacts on some platforms.
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.contentView.removeChildView(instance.view)
      } catch {
        // Already removed
      }
    }
  }

  hideAll(): void {
    for (const [projectId] of this.views) {
      this.hide(projectId)
    }
  }

  hideAllExcept(keepProjectId: string): void {
    for (const [projectId] of this.views) {
      if (projectId !== keepProjectId) {
        this.hide(projectId)
      }
    }
  }

  goBack(projectId: string): void {
    const instance = this.views.get(projectId)
    if (instance?.view.webContents.canGoBack()) {
      instance.view.webContents.goBack()
    }
  }

  goForward(projectId: string): void {
    const instance = this.views.get(projectId)
    if (instance?.view.webContents.canGoForward()) {
      instance.view.webContents.goForward()
    }
  }

  reload(projectId: string): void {
    const instance = this.views.get(projectId)
    if (instance) {
      instance.view.webContents.reload()
    }
  }

  toggleDevTools(projectId: string): void {
    const instance = this.views.get(projectId)
    if (instance) {
      if (instance.view.webContents.isDevToolsOpened()) {
        instance.view.webContents.closeDevTools()
      } else {
        instance.view.webContents.openDevTools({ mode: 'detach' })
      }
    }
  }

  getView(projectId: string): WebContentsView | undefined {
    return this.views.get(projectId)?.view
  }

  getCurrentUrl(projectId: string): string {
    return this.views.get(projectId)?.currentUrl || ''
  }

  destroy(projectId: string): void {
    const instance = this.views.get(projectId)
    if (!instance) return

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.contentView.removeChildView(instance.view)
      } catch {
        // View may already be removed
      }
    }

    if (!instance.view.webContents.isDestroyed()) {
      instance.view.webContents.removeAllListeners()
      instance.view.webContents.close()
    }

    this.views.delete(projectId)
  }

  closeAll(): void {
    for (const [projectId] of Array.from(this.views)) {
      this.destroy(projectId)
    }
  }

  /**
   * Get the file:// URL for the browser placeholder page.
   * In development: references resources/ in the project root (up from out/main/).
   * In production: references the app's extraResources directory.
   */
  private getPlaceholderUrl(projectId: string): string {
    const resourcePath = app.isPackaged
      ? path.join(process.resourcesPath, 'browser-placeholder.html')
      : path.join(__dirname, '../../resources', 'browser-placeholder.html')
    return `file://${resourcePath}#${projectId}`
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }
}

export const browserManager = new BrowserManager()
