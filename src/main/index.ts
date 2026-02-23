import { app, BrowserWindow, screen, Menu } from 'electron'
import path from 'path'
import { configManager } from './services/ConfigManager'
import { terminalManager } from './services/TerminalManager'
import { sessionManager } from './services/SessionManager'
import { processManager } from './services/ProcessManager'
import { browserManager } from './services/BrowserManager'
import { browserCDPProxy } from './services/BrowserCDPProxy'
import { gitWatcher } from './services/GitWatcher'
import { fileSystemManager } from './services/FileSystemManager'
import { registerAllIpc } from './ipc'

app.setName('A-IDE')

// Must be before app.whenReady() — Chromium command-line switch
app.commandLine.appendSwitch('remote-debugging-port', '0')

let mainWindow: BrowserWindow | null = null
let forceQuit = false

function createWindow(): void {
  const savedState = configManager.getWindowState()

  // Validate saved bounds against available displays
  let { x, y, width, height } = savedState
  const displays = screen.getAllDisplays()

  let onScreen = false
  if (x !== undefined && y !== undefined) {
    for (const display of displays) {
      const { x: dx, y: dy, width: dw, height: dh } = display.workArea
      // Check if at least 100px of the window overlaps a display
      if (
        x + 100 > dx && x < dx + dw &&
        y + 100 > dy && y < dy + dh
      ) {
        onScreen = true
        break
      }
    }
  }

  if (!onScreen) {
    x = undefined
    y = undefined
  }

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    show: false, // Prevent white flash
    backgroundColor: '#1e1e1e',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false, // Required for preload script to access Node APIs
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (savedState.isMaximized) {
    mainWindow.maximize()
  }

  // Show window once ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Save window state on changes (debounced to avoid ~60 calls/sec while dragging)
  let saveWindowStateTimer: ReturnType<typeof setTimeout> | null = null
  const saveWindowState = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const bounds = mainWindow.getBounds()
    configManager.setWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: mainWindow.isMaximized()
    })
  }
  const debouncedSaveWindowState = (): void => {
    if (saveWindowStateTimer) clearTimeout(saveWindowStateTimer)
    saveWindowStateTimer = setTimeout(saveWindowState, 500)
  }

  mainWindow.on('resize', debouncedSaveWindowState)
  mainWindow.on('move', debouncedSaveWindowState)

  // macOS close-vs-quit behavior
  mainWindow.on('close', (e) => {
    if (!forceQuit && process.platform === 'darwin') {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    if (saveWindowStateTimer) clearTimeout(saveWindowStateTimer)
    saveWindowState()
    mainWindow = null
  })

  // Keyboard shortcuts via before-input-event
  // Catches Cmd+1-9, Option+1-3, Cmd+B, Option+F before xterm.js consumes them
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    // Cmd+1-9: Switch to project by index
    if (input.meta && !input.shift && !input.alt && input.key >= '1' && input.key <= '9') {
      event.preventDefault()
      const index = parseInt(input.key) - 1
      mainWindow.webContents.send('shortcut:project-switch', { index })
      return
    }

    // Option+1/2/3: Focus panel (Claude/Terminal/Browser)
    if (input.alt && !input.meta && !input.shift && ['1', '2', '3'].includes(input.key)) {
      event.preventDefault()
      const panels = ['claude', 'terminal', 'browser']
      mainWindow.webContents.send('shortcut:panel-focus', {
        panel: panels[parseInt(input.key) - 1]
      })
      return
    }

    // Cmd+B: Toggle sidebar
    if (input.meta && !input.shift && !input.alt && input.key === 'b') {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:toggle-sidebar')
      return
    }

    // Option+F: Toggle maximize panel
    if (input.alt && !input.meta && !input.shift && input.key === 'f') {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:toggle-maximize')
      return
    }

    // Cmd+Shift+R: Restart active Claude session
    if (input.meta && input.shift && !input.alt && input.key === 'R') {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:restart-claude')
      return
    }

    // Cmd+O: Open folder
    if (input.meta && !input.shift && !input.alt && input.key === 'o') {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:open-folder')
      return
    }

    // Ctrl+Tab / Ctrl+Shift+Tab: Cycle agent tabs
    if (input.control && !input.meta && !input.alt && input.key === 'Tab') {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:cycle-agent', {
        direction: input.shift ? 'prev' : 'next'
      })
      return
    }

    // Cmd+E: Toggle file tree
    if (input.meta && !input.shift && !input.alt && input.key === 'e') {
      event.preventDefault()
      mainWindow.webContents.send('shortcut:toggle-file-tree')
      return
    }
  })

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// Build application menu
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  registerAllIpc()
  createMenu()
  createWindow()
  if (mainWindow) {
    terminalManager.setMainWindow(mainWindow)
    sessionManager.setMainWindow(mainWindow)
    browserManager.setMainWindow(mainWindow)
    gitWatcher.setMainWindow(mainWindow)
    fileSystemManager.setMainWindow(mainWindow)

    // Wire FileSystemManager → GitWatcher: file changes trigger debounced git status check
    fileSystemManager.onProjectChange((projectId) => {
      gitWatcher.onFilesChanged(projectId)
    })
  }

  // Start CDP proxy (reads Chrome's DevToolsActivePort, starts filtering proxy)
  try {
    const cdpPort = await browserCDPProxy.start()
    terminalManager.setCDPPort(cdpPort)

    // Register lazy view creation: when a CDP client connects for a project
    // but no embedded browser target exists, create one on demand.
    // The projectId comes from the connection's URL path (/project/<id>/...).
    browserCDPProxy.setEnsureView(async (projectId: string) => {
      if (!projectId) return

      if (!browserManager.getView(projectId)) {
        browserManager.create(projectId)
        // Wait for the placeholder page to finish loading so Chrome's CDP
        // session commands work. Without a loaded page, flat-session
        // commands silently fail.
        const view = browserManager.getView(projectId)
        if (view) {
          await new Promise<void>((resolve) => {
            if (view.webContents.getURL() && view.webContents.getURL() !== '') {
              resolve()
            } else {
              view.webContents.once('did-finish-load', () => resolve())
              setTimeout(resolve, 3000) // Safety timeout
            }
          })
        }
      }

      const view = browserManager.getView(projectId)
      if (view) {
        await browserCDPProxy.registerView(projectId, view)
      }
    })
  } catch (err) {
    console.error('[CDP Proxy] Failed to start:', err)
  }
})

app.on('before-quit', () => {
  forceQuit = true
  browserCDPProxy.stop()
  configManager.saveSync()
  gitWatcher.unwatchAll()
  fileSystemManager.unwatchAll()
  browserManager.closeAll()
  processManager.shutdownAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
  } else if (!mainWindow) {
    createWindow()
  }
})

export { mainWindow }
