#!/usr/bin/env node
/**
 * CDP Proxy end-to-end test script.
 * Usage: node scripts/test-cdp-proxy.mjs <proxy-port>
 *
 * Tests:
 * 1. GET /json/version → valid response with webSocketDebuggerUrl
 * 2. GET /json → at least one page target, no main-window target
 * 3. WS connect → Browser.getVersion succeeds
 * 4. WS → Target.getTargets → only embedded browser targets
 * 5. WS → Target.attachToTarget → returns sessionId
 * 6. WS → Page.navigate (with sessionId) → success
 * 7. WS → Runtime.evaluate (with sessionId) → returns result
 * 8. WS → Accessibility.getFullAXTree (with sessionId) → returns tree
 */

import WebSocket from 'ws'

const port = process.argv[2]
if (!port) {
  console.error('Usage: node scripts/test-cdp-proxy.mjs <proxy-port>')
  process.exit(1)
}

const BASE = `http://127.0.0.1:${port}`
let passed = 0
let failed = 0

function ok(name) {
  passed++
  console.log(`  ✓ ${name}`)
}
function fail(name, err) {
  failed++
  console.log(`  ✗ ${name}: ${err}`)
}

// Helper: send CDP command over WS and wait for matching response
function sendCommand(ws, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9)
    const msg = { id, method, params }
    if (sessionId) msg.sessionId = sessionId

    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), 10000)

    function onMessage(data) {
      try {
        const resp = JSON.parse(data.toString())
        if (resp.id === id) {
          ws.removeListener('message', onMessage)
          clearTimeout(timeout)
          if (resp.error) reject(new Error(`${method} error: ${JSON.stringify(resp.error)}`))
          else resolve(resp.result)
        }
      } catch { /* ignore parse errors */ }
    }

    ws.on('message', onMessage)
    ws.send(JSON.stringify(msg))
  })
}

async function run() {
  console.log(`\nTesting CDP proxy at ${BASE}\n`)

  // Test 1: GET /json/version
  try {
    const resp = await fetch(`${BASE}/json/version`)
    const data = await resp.json()
    if (data.webSocketDebuggerUrl && data.Browser) {
      ok('GET /json/version')
    } else {
      fail('GET /json/version', `Missing fields: ${JSON.stringify(data)}`)
    }
  } catch (e) {
    fail('GET /json/version', e.message)
  }

  // Test 2: GET /json
  let targetId
  try {
    const resp = await fetch(`${BASE}/json`)
    const targets = await resp.json()
    const pages = targets.filter(t => t.type === 'page')
    const mainWindow = targets.find(t => t.url?.includes('renderer/index.html') || t.url?.includes('localhost:'))

    if (pages.length >= 1) {
      ok(`GET /json → ${pages.length} page target(s)`)
    } else {
      fail('GET /json', `Expected at least 1 page target, got ${pages.length}`)
    }

    if (!mainWindow) {
      ok('GET /json → no main window target')
    } else {
      fail('GET /json → no main window target', `Found: ${mainWindow.url}`)
    }

    targetId = pages[0]?.id
  } catch (e) {
    fail('GET /json', e.message)
  }

  // Tests 3-8: WebSocket
  const versionResp = await fetch(`${BASE}/json/version`)
  const { webSocketDebuggerUrl } = await versionResp.json()

  const ws = new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
    setTimeout(() => reject(new Error('WS connect timeout')), 5000)
  })

  // Test 3: Browser.getVersion
  try {
    const result = await sendCommand(ws, 'Browser.getVersion')
    if (result.product) {
      ok(`Browser.getVersion → ${result.product}`)
    } else {
      fail('Browser.getVersion', JSON.stringify(result))
    }
  } catch (e) {
    fail('Browser.getVersion', e.message)
  }

  // Test 4: Target.getTargets
  try {
    const result = await sendCommand(ws, 'Target.getTargets')
    const pages = (result.targetInfos || []).filter(t => t.type === 'page')
    const mainWindow = pages.find(t => t.url?.includes('renderer/index.html') || t.url?.includes('localhost:'))

    if (pages.length >= 1 && !mainWindow) {
      ok(`Target.getTargets → ${pages.length} page(s), no main window`)
    } else if (mainWindow) {
      fail('Target.getTargets', `Main window leaked: ${mainWindow.url}`)
    } else {
      fail('Target.getTargets', `No page targets found`)
    }

    if (!targetId && pages.length > 0) targetId = pages[0].targetId
  } catch (e) {
    fail('Target.getTargets', e.message)
  }

  if (!targetId) {
    console.log('\n  Skipping tests 5-8 (no target available)\n')
    ws.close()
    printSummary()
    return
  }

  // Test 5: Target.attachToTarget
  let sessionId
  try {
    const result = await sendCommand(ws, 'Target.attachToTarget', {
      targetId,
      flatten: true
    })
    sessionId = result.sessionId
    if (sessionId) {
      ok(`Target.attachToTarget → session ${sessionId.slice(0, 20)}...`)
    } else {
      fail('Target.attachToTarget', 'No sessionId returned')
    }
  } catch (e) {
    fail('Target.attachToTarget', e.message)
  }

  if (!sessionId) {
    ws.close()
    printSummary()
    return
  }

  // Test 6: Page.navigate
  try {
    await sendCommand(ws, 'Page.enable', {}, sessionId)
    const result = await sendCommand(ws, 'Page.navigate', { url: 'https://example.com' }, sessionId)
    if (result.frameId) {
      ok(`Page.navigate → frameId ${result.frameId}`)
    } else {
      fail('Page.navigate', JSON.stringify(result))
    }
    // Wait for load
    await new Promise(r => setTimeout(r, 2000))
  } catch (e) {
    fail('Page.navigate', e.message)
  }

  // Test 7: Runtime.evaluate
  try {
    await sendCommand(ws, 'Runtime.enable', {}, sessionId)
    const result = await sendCommand(ws, 'Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true
    }, sessionId)
    const title = result?.result?.value
    if (title) {
      ok(`Runtime.evaluate → "${title}"`)
    } else {
      fail('Runtime.evaluate', JSON.stringify(result))
    }
  } catch (e) {
    fail('Runtime.evaluate', e.message)
  }

  // Test 8: Accessibility.getFullAXTree
  try {
    const result = await sendCommand(ws, 'Accessibility.getFullAXTree', {}, sessionId)
    const nodeCount = result?.nodes?.length || 0
    if (nodeCount > 0) {
      ok(`Accessibility.getFullAXTree → ${nodeCount} nodes`)
    } else {
      fail('Accessibility.getFullAXTree', `Got ${nodeCount} nodes`)
    }
  } catch (e) {
    fail('Accessibility.getFullAXTree', e.message)
  }

  ws.close()
  printSummary()
}

function printSummary() {
  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Test runner error:', err)
  process.exit(1)
})
