import { app, WebContentsView } from 'electron'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'

/**
 * Per-connection state for a CDP client (e.g. one Playwright MCP session).
 * Each connection is bound to a specific project and filters independently.
 */
interface ClientConnection {
  projectId: string
  chromeWs: WebSocket | null
  /** Track sessionId → targetId per connection for session-scoped message filtering */
  sessionTargets: Map<string, string>
}

/**
 * CDP filtering proxy that sits between external clients (Playwright MCP, etc.)
 * and Chromium's native remote debugging server.
 *
 * KEY DESIGN: Per-connection project isolation.
 * Each client connection is bound to a specific project (via URL path) and only
 * sees that project's browser target. Multiple projects can have active Playwright
 * sessions simultaneously without interference — switching projects in the UI
 * does not affect running CDP connections from other projects.
 *
 * URL routing:
 *   /project/<projectId>/json/list    → HTTP: targets for specific project
 *   /project/<projectId>/json/version → HTTP: WS URL scoped to project
 *   /project/<projectId>/*            → WS:   connection bound to project
 *   /json/list, /json/version, /*     → fallback to activeProjectId
 */
class BrowserCDPProxy {
  // Chrome's native CDP server
  private chromePort: number = 0
  private chromeBrowserWsUrl: string = ''

  // Our proxy server
  private httpServer: ReturnType<typeof createServer> | null = null
  private wss: WebSocketServer | null = null
  private proxyPort: number = 0

  // Target filtering
  private rendererUrl: string = '' // Main window URL — always hidden
  private projectTargets: Map<string, string> = new Map() // projectId → targetId
  private activeProjectId: string | null = null
  private registrationLock: Promise<void> = Promise.resolve()

  // WebSocket connections with per-connection state
  private clientConnections: Map<WebSocket, ClientConnection> = new Map()

  // Lazy view creation callback — receives projectId to create view for
  private ensureViewCallback: ((projectId: string) => Promise<void>) | null = null

  /**
   * Register a callback that ensures a browser view exists and is registered
   * for a given project. Called lazily when a CDP client connects but no
   * embedded browser target is available for that project.
   */
  setEnsureView(callback: (projectId: string) => Promise<void>): void {
    this.ensureViewCallback = callback
  }

  /**
   * Ensure an embedded browser view exists for the given project.
   * Waits for any in-flight registration to complete before checking,
   * so fire-and-forget registerView() calls from session:switch are
   * properly awaited when a CDP client connects shortly after.
   */
  private async ensureView(projectId: string | null): Promise<void> {
    if (!projectId) return
    if (this.projectTargets.has(projectId)) return
    // Wait for any in-flight registration to complete — registerView()
    // may have been started as fire-and-forget during project switch.
    await this.registrationLock
    if (this.projectTargets.has(projectId)) return
    if (this.ensureViewCallback) {
      await this.ensureViewCallback(projectId)
    }
  }

  /**
   * Read Chrome's DevToolsActivePort file to discover the CDP port and WS path.
   */
  private async readDevToolsActivePort(): Promise<{ port: number; wsPath: string }> {
    const filePath = path.join(app.getPath('userData'), 'DevToolsActivePort')

    for (let i = 0; i < 30; i++) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8').trim()
        const lines = content.split('\n')
        if (lines.length >= 2) {
          const port = parseInt(lines[0], 10)
          if (port > 0) {
            return { port, wsPath: lines[1] }
          }
        }
      } catch {
        // File not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Could not read DevToolsActivePort file after 3s')
  }

  async start(): Promise<number> {
    // 1. Read Chrome's CDP port
    const { port, wsPath } = await this.readDevToolsActivePort()
    this.chromePort = port
    this.chromeBrowserWsUrl = `ws://127.0.0.1:${port}${wsPath}`
    console.log(`[CDP Proxy] Chrome CDP on port ${this.chromePort}`)

    // 2. Determine the renderer URL to filter out
    if (process.env.ELECTRON_RENDERER_URL) {
      this.rendererUrl = process.env.ELECTRON_RENDERER_URL
    } else {
      this.rendererUrl = `file://${path.join(__dirname, '../renderer/index.html')}`
    }

    // 3. Start proxy server
    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => this.handleHttpRequest(req, res))
      this.wss = new WebSocketServer({ server: this.httpServer })

      this.wss.on('connection', (clientWs: WebSocket, req: IncomingMessage) => {
        this.bridgeClient(clientWs, req)
      })

      this.httpServer.listen(0, '127.0.0.1', () => {
        const addr = this.httpServer!.address()
        if (addr && typeof addr === 'object') {
          this.proxyPort = addr.port
          console.log(`[CDP Proxy] Proxy listening on 127.0.0.1:${this.proxyPort}`)
          resolve(this.proxyPort)
        } else {
          reject(new Error('Failed to get CDP proxy server address'))
        }
      })

      this.httpServer.on('error', reject)
    })
  }

  getPort(): number {
    return this.proxyPort
  }

  // ---------------------------------------------------------------------------
  // URL path parsing — extract projectId from /project/<id>/...
  // ---------------------------------------------------------------------------

  /**
   * Extract projectId from a URL path like /project/<uuid>/json/list
   * Returns { projectId, remainingPath } or null if no project prefix.
   */
  private parseProjectPath(urlPath: string): { projectId: string; remainingPath: string } | null {
    const match = urlPath.match(/^\/project\/([a-f0-9-]+)(\/.*)?$/)
    if (match) {
      return {
        projectId: match[1],
        remainingPath: match[2] || ''
      }
    }
    return null
  }

  // ---------------------------------------------------------------------------
  // Target registration
  // ---------------------------------------------------------------------------

  /**
   * Register a WebContentsView for a project. Finds its Chrome CDP target by URL matching.
   */
  async registerView(projectId: string, view: WebContentsView): Promise<void> {
    // Serialize registrations to prevent two concurrent calls from
    // reading the same existingTargetIds snapshot and stealing each other's target.
    const prevLock = this.registrationLock
    let releaseLock: () => void
    this.registrationLock = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    await prevLock

    try {
      const targetId = await this.findTargetForView(view)
      if (targetId) {
        this.projectTargets.set(projectId, targetId)
        console.log(`[CDP Proxy] Registered project ${projectId} → target ${targetId}`)
      }
    } finally {
      releaseLock!()
    }
  }

  /**
   * Set the active project (used as fallback for connections without project ID in path).
   */
  setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId
  }

  /**
   * Find the Chrome CDP target that corresponds to a WebContentsView.
   */
  private async findTargetForView(view: WebContentsView): Promise<string | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const resp = await fetch(`http://127.0.0.1:${this.chromePort}/json/list`)
        const targets = (await resp.json()) as Array<{
          id: string
          url: string
          type: string
          webSocketDebuggerUrl?: string
        }>

        const viewUrl = view.webContents.getURL()
        const existingTargetIds = new Set(this.projectTargets.values())

        for (const target of targets) {
          if (target.type !== 'page') continue
          if (this.isMainWindowTarget(target.url)) continue
          if (existingTargetIds.has(target.id)) continue

          // Match by URL, or if view is at about:blank/placeholder, pick first unmatched
          if (target.url === viewUrl || viewUrl === '' || viewUrl === 'about:blank') {
            return target.id
          }
        }
      } catch {
        // Chrome CDP not ready yet
      }

      await new Promise((r) => setTimeout(r, 150))
    }

    console.warn('[CDP Proxy] Could not find target for view')
    return null
  }

  /**
   * Check if a URL belongs to the main Electron renderer window.
   */
  private isMainWindowTarget(url: string): boolean {
    if (!url) return false
    if (this.rendererUrl && url.startsWith(this.rendererUrl)) return true
    if (url.includes('/renderer/index.html')) return true
    if (url.startsWith('devtools://') || url.startsWith('chrome-extension://')) return true
    return false
  }

  /**
   * Check if a target should be visible to a CDP client for a given project.
   * Each connection is scoped to its own project — only that project's
   * registered browser target is allowed through.
   */
  private isTargetAllowed(targetId: string, projectId: string | null, targetUrl?: string): boolean {
    if (targetUrl && this.isMainWindowTarget(targetUrl)) return false
    const allowedId = projectId ? this.projectTargets.get(projectId) : undefined
    if (allowedId && targetId === allowedId) return true
    return false
  }

  // ---------------------------------------------------------------------------
  // HTTP endpoints — per-project target filtering
  // ---------------------------------------------------------------------------

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json')
    const rawPath = req.url?.replace(/\/+$/, '') || ''

    // Parse project-specific path prefix
    const parsed = this.parseProjectPath(rawPath)
    const projectId = parsed?.projectId || this.activeProjectId
    const urlPath = parsed?.remainingPath?.replace(/\/+$/, '') || rawPath

    if (!parsed?.projectId && (urlPath === '/json' || urlPath === '/json/list' || urlPath === '/json/version')) {
      console.warn(`[CDP Proxy] HTTP request without project path: ${rawPath} — using active project fallback`)
    }

    try {
      if (urlPath === '/json' || urlPath === '/json/list') {
        await this.handleJsonList(res, projectId)
      } else if (urlPath === '/json/version') {
        await this.handleJsonVersion(res, projectId)
      } else if (urlPath === '/json/protocol') {
        const resp = await fetch(`http://127.0.0.1:${this.chromePort}/json/protocol`)
        const data = await resp.text()
        res.end(data)
      } else {
        res.statusCode = 404
        res.end('{}')
      }
    } catch (err) {
      res.statusCode = 502
      res.end(JSON.stringify({ error: (err as Error).message }))
    }
  }

  private async handleJsonList(res: ServerResponse, projectId: string | null): Promise<void> {
    if (projectId) await this.ensureView(projectId)

    const resp = await fetch(`http://127.0.0.1:${this.chromePort}/json/list`)
    const targets = (await resp.json()) as Array<Record<string, unknown>>

    const filtered = targets.filter((t) => {
      return this.isTargetAllowed(t.id as string, projectId, t.url as string)
    })

    // Rewrite WS URLs to include the project prefix so clients auto-route
    const prefix = projectId ? `/project/${projectId}` : ''
    for (const target of filtered) {
      if (target.webSocketDebuggerUrl) {
        const wsUrl = target.webSocketDebuggerUrl as string
        const wsPath = new URL(wsUrl).pathname
        target.webSocketDebuggerUrl = `ws://127.0.0.1:${this.proxyPort}${prefix}${wsPath}`
      }
    }

    res.end(JSON.stringify(filtered))
  }

  private async handleJsonVersion(res: ServerResponse, projectId: string | null): Promise<void> {
    const resp = await fetch(`http://127.0.0.1:${this.chromePort}/json/version`)
    const version = (await resp.json()) as Record<string, unknown>

    // Include project ID in the WS URL so Playwright connects with routing context
    const prefix = projectId ? `/project/${projectId}` : ''
    version.webSocketDebuggerUrl = `ws://127.0.0.1:${this.proxyPort}${prefix}/devtools/browser/aide`

    res.end(JSON.stringify(version))
  }

  // ---------------------------------------------------------------------------
  // WebSocket proxy — per-connection project-scoped filtering
  // ---------------------------------------------------------------------------

  private bridgeClient(clientWs: WebSocket, req: IncomingMessage): void {
    // Extract projectId from WebSocket upgrade URL path
    const wsPath = req.url || ''
    const parsed = this.parseProjectPath(wsPath)
    const projectId = parsed?.projectId || this.activeProjectId || ''

    if (!parsed?.projectId) {
      console.warn(
        `[CDP Proxy] WS client connected without project path — falling back to active project ${projectId.substring(0, 8)}...`,
        '\n  MCP config should use AIDE_BROWSER_CDP_URL (not AIDE_BROWSER_CDP_PORT) for project-scoped routing.'
      )
    }

    // Create per-connection state
    const conn: ClientConnection = {
      projectId,
      chromeWs: null,
      sessionTargets: new Map()
    }

    console.log(`[CDP Proxy] Client connected for project ${projectId.substring(0, 8)}...`)

    // Queue client messages immediately — Playwright sends commands right after
    // WS connects, before ensureView/Chrome WS setup completes.
    const pendingFromClient: string[] = []
    let chromeReady = false

    // Set up client message handler IMMEDIATELY to capture all messages
    clientWs.on('message', async (data: Buffer | string) => {
      const str = data.toString()
      const intercepted = await this.interceptClientMessage(str, clientWs, conn)

      if (intercepted !== null) {
        clientWs.send(intercepted)
        return
      }

      if (chromeReady && conn.chromeWs) {
        conn.chromeWs.send(str)
      } else {
        pendingFromClient.push(str)
      }
    })

    clientWs.on('close', () => {
      conn.chromeWs?.close()
      this.clientConnections.delete(clientWs)
    })

    clientWs.on('error', () => {
      conn.chromeWs?.close()
      this.clientConnections.delete(clientWs)
    })

    this.clientConnections.set(clientWs, conn)

    // Ensure view exists for this specific project before opening Chrome WS
    this.ensureView(projectId || null).then(() => {
      if (clientWs.readyState !== WebSocket.OPEN) return

      const chromeWs = new WebSocket(this.chromeBrowserWsUrl)
      conn.chromeWs = chromeWs

      chromeWs.on('open', () => {
        chromeReady = true
        console.log('[CDP Proxy] Chrome browser WS connected')
        // Flush queued client messages
        for (const msg of pendingFromClient) {
          chromeWs.send(msg)
        }
        pendingFromClient.length = 0
      })

      chromeWs.on('error', (err) => {
        console.warn('[CDP Proxy] Chrome WS error:', err.message)
        clientWs.close()
      })

      chromeWs.on('close', () => {
        clientWs.close()
        this.clientConnections.delete(clientWs)
      })

      // Chrome → Client (with per-connection filtering)
      chromeWs.on('message', (data: Buffer | string) => {
        if (clientWs.readyState !== WebSocket.OPEN) return

        const str = data.toString()
        const filtered = this.filterChromeMessage(str, conn)
        if (filtered !== null) {
          clientWs.send(filtered)
        }
      })
    })
  }

  /**
   * Intercept client → Chrome messages.
   * Returns a JSON string response if handled, or null to pass through.
   */
  private async interceptClientMessage(
    raw: string,
    _clientWs: WebSocket,
    conn: ClientConnection
  ): Promise<string | null> {
    let msg: { id?: number; method?: string; params?: Record<string, unknown> }
    try {
      msg = JSON.parse(raw)
    } catch {
      return null
    }

    const { id, method, params } = msg
    if (!method) return null

    switch (method) {
      case 'Target.createTarget': {
        await this.ensureView(conn.projectId || null)

        const allowedTargetId = conn.projectId
          ? this.projectTargets.get(conn.projectId)
          : undefined

        if (allowedTargetId) {
          const url = params?.url as string | undefined
          if (url && url !== 'about:blank') {
            await this.navigateTarget(allowedTargetId, url)
          }
          return JSON.stringify({ id, result: { targetId: allowedTargetId } })
        }
        return null
      }

      case 'Target.createBrowserContext': {
        return JSON.stringify({ id, result: { browserContextId: '' } })
      }

      default:
        return null
    }
  }

  /**
   * Navigate a target via Chrome's page-level CDP endpoint.
   */
  private async navigateTarget(targetId: string, url: string): Promise<void> {
    try {
      const resp = await fetch(`http://127.0.0.1:${this.chromePort}/json/list`)
      const targets = (await resp.json()) as Array<{
        id: string
        webSocketDebuggerUrl?: string
      }>
      const target = targets.find((t) => t.id === targetId)
      if (!target?.webSocketDebuggerUrl) return

      const ws = new WebSocket(target.webSocketDebuggerUrl)
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url } }))
          setTimeout(() => {
            ws.close()
            resolve()
          }, 500)
        })
        ws.on('error', reject)
        setTimeout(() => reject(new Error('timeout')), 3000)
      })
    } catch (err) {
      console.warn('[CDP Proxy] navigateTarget error:', (err as Error).message)
    }
  }

  /**
   * Filter Chrome → Client messages for a specific connection.
   * Uses the connection's projectId for target filtering and its own
   * sessionTargets map for session-scoped message tracking.
   */
  private filterChromeMessage(raw: string, conn: ClientConnection): string | null {
    let msg: {
      id?: number
      method?: string
      params?: Record<string, unknown>
      result?: Record<string, unknown>
      sessionId?: string
    }
    try {
      msg = JSON.parse(raw)
    } catch {
      return raw
    }

    // Suppress events on sessions belonging to blocked targets
    if (msg.sessionId) {
      const targetId = conn.sessionTargets.get(msg.sessionId)
      if (targetId && !this.isTargetAllowed(targetId, conn.projectId)) {
        return null
      }
    }

    // --- Target domain event filtering ---

    if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') {
      const targetInfo = msg.params?.targetInfo as
        | { targetId?: string; url?: string }
        | undefined
      if (
        targetInfo?.targetId &&
        !this.isTargetAllowed(targetInfo.targetId, conn.projectId, targetInfo.url)
      ) {
        return null
      }
    }

    if (msg.method === 'Target.targetDestroyed') {
      const targetId = msg.params?.targetId as string | undefined
      if (targetId && !this.isTargetAllowed(targetId, conn.projectId)) {
        return null
      }
    }

    // Track sessionId → targetId for Target.attachedToTarget, then filter
    if (msg.method === 'Target.attachedToTarget') {
      const targetInfo = msg.params?.targetInfo as
        | { targetId?: string; url?: string }
        | undefined
      const sessionId = msg.params?.sessionId as string | undefined
      if (targetInfo?.targetId && sessionId) {
        conn.sessionTargets.set(sessionId, targetInfo.targetId)
      }
      if (
        targetInfo?.targetId &&
        !this.isTargetAllowed(targetInfo.targetId, conn.projectId, targetInfo.url)
      ) {
        return null
      }
    }

    if (msg.method === 'Target.detachedFromTarget') {
      const sessionId = msg.params?.sessionId as string | undefined
      if (sessionId) {
        const targetId = conn.sessionTargets.get(sessionId)
        conn.sessionTargets.delete(sessionId)
        if (targetId && !this.isTargetAllowed(targetId, conn.projectId)) {
          return null
        }
      }
    }

    // Filter Target.getTargets responses
    if (msg.id !== undefined && msg.result?.targetInfos) {
      const infos = msg.result.targetInfos as Array<{ targetId: string; url?: string }>
      msg.result.targetInfos = infos.filter((t) =>
        this.isTargetAllowed(t.targetId, conn.projectId, t.url)
      )
      return JSON.stringify(msg)
    }

    return raw
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  stop(): void {
    for (const [clientWs, conn] of this.clientConnections) {
      conn.chromeWs?.close()
      clientWs.close()
    }
    this.clientConnections.clear()
    this.projectTargets.clear()
    this.wss?.close()
    this.httpServer?.close()
    this.wss = null
    this.httpServer = null
  }
}

export const browserCDPProxy = new BrowserCDPProxy()
