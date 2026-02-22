# A-IDE — Product Requirements Document (PRD)

> **A-IDE** (pronounced "aid") — An agentic developer workspace that combines Claude Code, a browser, and a terminal in one window with instant project switching.
>
> This document is the single source of truth for implementing A-IDE. It is written for an AI coding agent (Claude Code) and contains all specifications needed to build the MVP.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Technical Stack](#2-technical-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Data Models](#5-data-models)
6. [Feature Specifications](#6-feature-specifications)
7. [IPC API Reference](#7-ipc-api-reference)
8. [UI Specifications](#8-ui-specifications)
9. [Implementation Plan](#9-implementation-plan)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Product Overview

### 1.1 What is A-IDE?

A-IDE is a macOS Electron app that serves as a project-centric workspace for developers who primarily work with AI coding agents. It is NOT a code editor. It is a "project cockpit" with three main panels:

1. **Claude Code** — A terminal running the `claude` CLI
2. **Terminal** — A regular shell (zsh/bash) for manual commands
3. **Browser** — An embedded Chromium webview for localhost previews with DevTools

The killer feature is **instant project switching with full state preservation**. Users have 5–10 projects open simultaneously. Clicking a project in the sidebar switches all three panels to that project's context instantly.

### 1.2 Target Platform

- macOS only (Apple Silicon + Intel)
- Minimum macOS version: 12.0 (Monterey)
- Dark theme only (MVP)

### 1.3 Prerequisites on User's Machine

- Node.js >= 22 (LTS)
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Git installed

### 1.4 Non-Goals (MVP)

- NOT a code editor (no Monaco, no syntax highlighting of files)
- NOT cross-platform (no Windows/Linux)
- NOT a Claude Code wrapper with custom UI (we embed the CLI as-is)
- NO plugin/extension system
- NO cloud sync
- NO light theme

---

## 1.5 UX Principles

These principles guide EVERY implementation decision. When in doubt, prioritize the user's experience.

### Principle 1: Zero-Friction First Launch

The first 30 seconds determine if someone keeps the app. The user must feel productive immediately.

**First Launch Flow:**
1. App opens → window appears with a **Welcome state** (not an empty void)
2. Welcome state shows:
   - A-IDE logo + tagline centered in the panel area
   - A large, inviting "Add your first project" button (not just a tiny "+" in the sidebar)
   - Brief visual hint: "Drop a folder here or click to browse"
   - Subtle keyboard shortcut hint: `Cmd+N`
3. User picks a folder → Project appears in sidebar, all panels activate, Claude Code starts
4. The transition from "empty" to "working" should feel like the app comes alive — panels slide/fade in, not just pop

**Empty States (all must be designed, never leave blank panels):**
- **Sidebar with no projects:** Welcome message + "Add Project" button, same as above
- **Browser with no URL:** Styled placeholder page (dark, matches theme) with: "Enter a URL above or add `browserUrl` to `.a-ide.json`" — include a small illustration or icon, not just plain text
- **Terminal exited:** Dark overlay with centered message: "Process exited (code 0)" + "Restart" button styled as a primary action + subtle "Cmd+Shift+R" hint. Must not look like an error if exit code was 0
- **Claude Code exited:** Same as terminal but with message "Claude Code session ended" + "New Session" button

### Principle 2: Every Interaction Needs Feedback

Nothing should feel dead or unresponsive. Every click, hover, and action must have immediate visual feedback.

**Hover States:**
- Sidebar project cards: background shifts to `--bg-hover` with 150ms ease transition
- Buttons (URL bar, sidebar "+", DevTools toggle): slight background highlight + cursor pointer
- Resize handles: color shifts to `--accent-blue` with 100ms ease, cursor changes
- Resize handles: show a 3-dot grip icon on hover (⋮ for vertical, ⋯ for horizontal) for discoverability

**Click/Active States:**
- Sidebar project card: brief press animation (scale 0.98 for 100ms, then back to 1.0)
- Buttons: darken background by 10% on mousedown
- URL bar input: focus ring with `--accent-blue` glow (0 0 0 2px rgba(0, 122, 204, 0.5))

**Loading States:**
- **Project first activation:** Sidebar card shows a subtle pulse animation while sessions are being created (~1-2s). Panels show a minimal spinner with "Starting Claude Code..." / "Starting terminal..." text
- **Browser page loading:** URL bar shows a thin animated progress bar (like Chrome's blue bar) at the top of the browser panel. Show a subtle loading spinner in the URL bar replacing the favicon area
- **Git status loading:** Show a small spinner icon next to git info while polling, don't flash between states

**Transition Animations (keep them fast — 150-200ms max):**
- Project switch: crossfade between terminal states (opacity 0→1 on new, 1→0 on old) over 120ms. No slide, no bounce — just a clean fade
- Panel resize: real-time, no animation needed (must follow cursor 1:1 with no lag)
- Sidebar width resize: real-time following cursor
- Panel maximize (Option+F): animate panel expanding to fill space over 200ms with ease-out curve. Other panels shrink proportionally. Reverse on restore
- Adding a project: new card slides in from the top of the list with a 200ms ease-out
- Removing a project: card fades out + collapses height over 200ms

### Principle 3: Native macOS Feel

A-IDE should feel like it belongs on macOS — not like a web page in a window.

**Window:**
- Use macOS native title bar with traffic lights (close, minimize, fullscreen)
- Title bar should be transparent/integrated with the sidebar background color (like Slack, Discord, or Spotify)
- Traffic lights positioned in the sidebar area (top-left), with enough padding (~16px from top and left)
- The sidebar extends behind the title bar area (full bleed) — use `titleBarStyle: 'hiddenInset'` in Electron
- Window remembers its size and position across restarts (save to config)
- Support macOS native fullscreen (green traffic light button)
- Minimum window size: 900x600 to prevent unusable panel sizes

**Scrolling:**
- Use native macOS scrollbars (overlay style, auto-hide) — not custom styled scrollbars
- Sidebar scrolls with native momentum scrolling if there are many projects
- Terminal scrollback uses xterm's built-in scrolling (which already feels native)

**Context Menus:**
- Use Electron's native `Menu.buildFromTemplate()` for right-click menus — these will look like real macOS context menus, not custom HTML dropdowns
- Context menu items should have keyboard shortcut hints where applicable

**System Integration:**
- Respect macOS dark mode (the app is always dark, but match system accent color if possible)
- Support drag & drop: user can drag a folder FROM Finder INTO the sidebar to add it as a project
- Support "Open with A-IDE" from Finder (register as folder handler in Info.plist) — post-MVP but plan for it

### Principle 4: Clear Visual Hierarchy

The user must instantly know: Where am I? What's active? What can I interact with?

**Panel Labels:**
Each panel MUST have a small header bar (24px) with:
- An icon + label: "⚡ Claude Code", "▸ Terminal", "🌐 Browser"
- The header doubles as the resize drag target area
- Active/focused panel header has a subtle bottom border in `--accent-blue` (2px)
- Inactive panel headers use `--text-secondary` for the label

**Focus Management:**
- When switching to a panel (Option+1/2/3 or clicking), the panel header gets the blue border
- The focused terminal gets keyboard input — there must NEVER be a state where typing goes nowhere
- When switching projects, the previously focused panel type stays focused (if Claude Code was focused in Project A, Claude Code gets focus in Project B too)
- Clicking anywhere inside a panel focuses it (including clicking in the terminal area)
- Browser panel focus: clicking in the URL bar focuses the URL input. Clicking in the page content focuses the WebContentsView. Both count as "browser panel focused"

**Active Project Indicator (Sidebar):**
- Active project has: `--accent-blue` left border (3px), slightly lighter background (`--bg-active`), white project name (`--text-bright`)
- Inactive projects have: transparent left border, default background, dimmer text (`--text-primary`)
- The difference must be obvious at a glance — not subtle

### Principle 5: Graceful Degradation

Every error must be handled with a helpful, non-scary message. The app must never show raw error text, stack traces, or leave the user stuck.

**Error Scenarios and Their UX:**

| Scenario | What the user sees |
|---|---|
| Claude CLI not installed | Panel shows friendly message: "Claude Code CLI not found. Install it with: `npm install -g @anthropic-ai/claude-code`" with a copy button for the command |
| Project folder deleted | Sidebar card shows ⚠ icon + "(folder not found)" in red. Clicking it shows a dialog: "This project folder no longer exists. Remove it from A-IDE?" with Remove / Locate buttons |
| Git not installed | Sidebar shows project name without any git info (no error, just absent) |
| Dev server not running | Browser shows its placeholder. Status bar shows red dot next to URL. No error popup |
| node-pty spawn fails | Panel shows: "Failed to start terminal. Check that [shell/claude] is available in your PATH." with Retry button |
| WebContentsView crash | Browser panel shows: "Page crashed. Click to reload." with reload button |
| Config file corrupted | App starts with default config, shows a one-time toast: "Settings were reset due to a corrupted config file" |
| App launched without internet | Everything works normally (Claude Code will handle its own auth errors) |

**Toast Notifications:**
- For non-critical feedback (project added, settings saved, etc.), use a toast that appears at the bottom-right of the LEFT column (never overlapping the browser panel's WebContentsView — see Section 4.3), auto-dismisses after 3 seconds
- Toast style: dark background (`--bg-tertiary`), white text, rounded corners (8px), subtle shadow, slide-in animation from right
- Maximum 1 toast visible at a time (new toast replaces old one)

### Principle 6: Respect the User's Flow

Never interrupt, never steal focus, never do something unexpected.

- Adding a project should NOT auto-switch to it if the user is mid-work in another project. Instead, add it to the sidebar with a subtle highlight, and let the user click when ready
- **Exception:** When the user adds their VERY FIRST project (sidebar was empty), auto-switch to it immediately — the user expects to start working right away
- Git polling should NEVER cause UI jank — run in a separate thread/process if needed
- Config auto-save should be invisible — no "saving..." indicators
- Window resize must keep all panels responsive in real-time — no delays, no debounce on the visual update (only debounce the config save)
- If a terminal has a long-running process and the user tries to remove the project, show a confirmation: "This project has running processes. Remove anyway?" with Cancel / Remove buttons

---

## 2. Technical Stack

| Component | Technology | Version | Purpose |
|---|---|---|---|
| App Framework | Electron | ^40.x | Desktop app shell, WebContentsView for embedded browser (Chromium 144, Node 24) |
| UI Framework | React | ^19.2.x | Sidebar, layout, status bar — requires 19.2+ for `<Activity>` component |
| Styling | Tailwind CSS | ^4.x | Dark theme, utility-first CSS, CSS-first config via `@theme` |
| Tailwind Vite Plugin | @tailwindcss/vite | ^4.x | First-party Vite integration (replaces PostCSS plugin) |
| Bundler | electron-vite | ^4.x | Vite-based build for main + preload + renderer |
| Terminal Emulator | @xterm/xterm | ^5.x | Terminal rendering in renderer process |
| Terminal GPU Renderer | @xterm/addon-webgl | ^0.18.x | GPU-accelerated terminal rendering (with DOM fallback) |
| Terminal Fit | @xterm/addon-fit | ^0.10.x | Auto-fit terminal to container size |
| Terminal Links | @xterm/addon-web-links | ^0.11.x | Clickable URLs in terminal output |
| Terminal Backend | node-pty | ^1.x | PTY process spawning in main process |
| Git Integration | simple-git | ^3.x | Branch, status, ahead/behind info |
| State Management | zustand | ^5.x | Global app state in renderer |
| IPC | Electron IPC | built-in | Main ↔ Renderer communication |
| Build/Package | electron-builder | ^26.x | macOS DMG and .app bundle |
| Language | TypeScript | ^5.x | All code in TypeScript |

### 2.1 Why These Choices

- **Electron 40 over older versions**: Latest stable with Chromium 144 and Node 24. Supported until June 2026. Uses `WebContentsView` natively (no more deprecated `BrowserView`). New `focusOnNavigation` webPreference useful for browser panel.
- **Electron over Tauri**: We need `WebContentsView` with full Chrome DevTools and true process isolation for the embedded browser. Tauri's webview cannot do this.
- **React over Svelte/Vue**: Largest ecosystem, Claude Code knows it best, most community Electron+React examples. React 19.2's `<Activity>` component is a perfect fit for A-IDE's project switching — it preserves state and DOM while hiding components and managing effect lifecycle automatically.
- **React 19.2 `<Activity>` for project switching**: `<Activity mode="hidden">` applies `display: none`, unmounts effects, deprioritizes updates, and preserves both React state and DOM state. When set to `"visible"`, effects re-mount seamlessly. This replaces the fragile manual `display: none` + `requestAnimationFrame` + `fit()` pattern with a first-party React primitive. It is the architectural foundation for instant project switching.
- **Tailwind CSS v4 — CSS-first configuration**: No more `tailwind.config.ts` file. Configuration lives directly in CSS via `@import "tailwindcss"` and `@theme { }` blocks. Use `@tailwindcss/vite` as first-party Vite plugin (NOT the old PostCSS plugin). Zero-config content detection — Tailwind auto-finds template files via Vite's module graph. Dramatically simpler setup.
- **xterm.js over alternatives**: Industry standard (used by VS Code, Hyper, Theia). Best node-pty integration. Use `@xterm/addon-webgl` for GPU-accelerated rendering with automatic fallback to DOM renderer on WebGL context loss.
- **electron-vite over raw Vite**: Purpose-built for Electron with first-class support for main/preload/renderer builds, native module handling, and HMR. Better than manually configuring `vite-plugin-electron`.
- **Zustand over Redux**: Minimal boilerplate, perfect for Electron's simple state needs.
- **BrowserWindow over BaseWindow**: Since our app has one main React UI plus additional WebContentsViews for the browser panel, we use `BrowserWindow` (which extends `BaseWindow`) for the main window. The browser panels are managed as separate `WebContentsView` instances added via `mainWindow.contentView.addChildView()`. This is simpler than a pure `BaseWindow` approach while still supporting multi-view.
- **WebContentsView over BrowserView**: `BrowserView` was deprecated in Electron 30. `WebContentsView` is the official replacement, aligned with Chromium's Views API. Key differences: no `setAutoResize()` — must handle resize manually via window `resize` event; webContents are NOT auto-destroyed on window close — must explicitly call `view.webContents.close()` to prevent memory leaks.
- **node-pty**: Requires native compilation for Electron's Node version (Node 24 in Electron 40). Use `npx @electron/rebuild` (NOT the old `electron-rebuild`) to rebuild native modules after Electron install.

---

## 3. Project Structure

```
a-ide/
├── package.json
├── tsconfig.json
├── electron.vite.config.ts          # Vite config for main + renderer + preload
├── resources/
│   └── icon.icns                    # macOS app icon
├── src/
│   ├── main/                        # Electron Main Process
│   │   ├── index.ts                 # App entry point, window creation
│   │   ├── ipc/                     # IPC handlers
│   │   │   ├── index.ts             # Register all IPC handlers
│   │   │   ├── terminal.ts          # Terminal (node-pty) management
│   │   │   ├── project.ts           # Project CRUD, config loading
│   │   │   ├── git.ts               # Git status polling
│   │   │   └── browser.ts           # WebContentsView management
│   │   ├── services/
│   │   │   ├── SessionManager.ts    # Core: manages per-project sessions
│   │   │   ├── TerminalManager.ts   # Creates/manages node-pty instances
│   │   │   ├── BrowserManager.ts    # Creates/manages WebContentsViews
│   │   │   ├── GitWatcher.ts        # Polls git status for all projects
│   │   │   ├── ConfigManager.ts     # Reads/writes global + project config
│   │   │   └── ProcessManager.ts    # Lifecycle management, cleanup
│   │   └── utils/
│   │       └── paths.ts             # Config paths, defaults
│   ├── preload/
│   │   └── index.ts                 # contextBridge exposing IPC to renderer
│   └── renderer/                    # Electron Renderer Process (React)
│       ├── index.html
│       ├── main.tsx                 # React entry point
│       ├── App.tsx                  # Root component with layout
│       ├── styles/
│       │   └── globals.css          # Tailwind imports + xterm overrides
│       ├── stores/
│       │   └── appStore.ts          # Zustand store
│       ├── components/
│       │   ├── Sidebar/
│       │   │   ├── Sidebar.tsx
│       │   │   ├── ProjectCard.tsx
│       │   │   ├── AddProjectButton.tsx
│       │   │   └── WelcomeScreen.tsx       # Empty state when no projects
│       │   ├── Panels/
│       │   │   ├── PanelContainer.tsx     # Resizable panel layout
│       │   │   ├── PanelHeader.tsx        # Icon + label + focus indicator
│       │   │   ├── ClaudeCodePanel.tsx    # xterm.js for claude CLI
│       │   │   ├── TerminalPanel.tsx      # xterm.js for shell
│       │   │   ├── BrowserPanel.tsx       # Controls for WebContentsView
│       │   │   ├── BrowserUrlBar.tsx      # URL input + nav buttons + favicon
│       │   │   ├── PanelLoading.tsx       # Loading spinner for first activation
│       │   │   └── PanelExited.tsx        # "Process exited" state with restart
│       │   ├── StatusBar/
│       │   │   └── StatusBar.tsx
│       │   ├── Layout/
│       │   │   ├── ResizeHandle.tsx
│       │   │   └── PanelLayout.tsx
│       │   └── Shared/
│       │       ├── Toast.tsx              # Toast notification component
│       │       └── ConfirmDialog.tsx      # Native-style confirmation dialog
│       ├── hooks/
│       │   ├── useTerminal.ts       # xterm.js lifecycle hook
│       │   ├── useProjectSwitch.ts  # Project switching logic
│       │   └── useGitStatus.ts      # Subscribe to git status updates
│       └── types/
│           └── index.ts             # Shared TypeScript types
├── build/
│   └── entitlements.mac.plist       # macOS signing entitlements
└── electron-builder.yml             # Build configuration
```

---

## 4. Architecture

### 4.1 Process Model

```
┌──────────────────────────────────────────────────────────────┐
│                    MAIN PROCESS (Node.js)                      │
│                                                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │ SessionManager   │  │ TerminalManager  │  │ BrowserManager│  │
│  │                  │  │                  │  │              │  │
│  │ - sessions[]     │  │ - ptyProcesses[] │  │ - views[]    │  │
│  │ - activeProject  │  │ - create()       │  │ - create()   │  │
│  │ - switch()       │  │ - write()        │  │ - navigate() │  │
│  │ - freeze()       │  │ - resize()       │  │ - show/hide()│  │
│  │ - thaw()         │  │ - kill()         │  │ - devtools() │  │
│  └─────────────────┘  └─────────────────┘  └──────────────┘  │
│                                                                │
│  ┌─────────────────┐  ┌─────────────────┐                     │
│  │ GitWatcher       │  │ ConfigManager    │                     │
│  │ - poll()         │  │ - loadGlobal()   │                     │
│  │ - getStatus()    │  │ - loadProject()  │                     │
│  └─────────────────┘  └─────────────────┘                     │
│            ↕ IPC (contextBridge)                               │
├──────────────────────────────────────────────────────────────┤
│                  RENDERER PROCESS (React)                      │
│                                                                │
│  ┌──────────┐ ┌────────────────────────────────────────────┐  │
│  │ Sidebar  │ │  Panel Container                            │  │
│  │          │ │  ┌───────────────────┬──────────────────┐   │  │
│  │ Project  │ │  │ Claude Code Panel │                  │   │  │
│  │ Cards    │ │  │ (xterm.js #1)     │  Browser Panel   │   │  │
│  │          │ │  ├───────────────────┤  (WebContentsView    │   │  │
│  │          │ │  │ Terminal Panel    │   controls)       │   │  │
│  │          │ │  │ (xterm.js #2)     │                  │   │  │
│  │          │ │  └───────────────────┴──────────────────┘   │  │
│  └──────────┘ └────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Status Bar                                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

SEPARATE PROCESSES (one set per project):
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ node-pty #1  │  │ node-pty #2  │  │ WebContentsView  │
  │ (claude CLI) │  │ (zsh shell)  │  │ (Chromium)   │
  └──────────────┘  └──────────────┘  └──────────────┘
```

### 4.2 Session Management — The Core Concept

Each project gets a **Session** object in the main process:

```typescript
interface Session {
  projectId: string;
  claudePty: IPty | null;       // node-pty process for claude CLI
  shellPty: IPty | null;        // node-pty process for user shell
  webContentsView: WebContentsView | null;
  state: 'active' | 'background' | 'hibernated';
  createdAt: number;
  lastActiveAt: number;
}
```

**Switching Logic:**

1. When user clicks Project B while Project A is active:
   - `SessionManager.freeze('project-a')` → sets state to 'background', hides WebContentsView
   - `SessionManager.thaw('project-b')` → sets state to 'active', shows WebContentsView
   - Renderer receives `session-switched` event, React `<Activity>` handles panel visibility

2. **Use React 19.2 `<Activity>` for terminal panel switching** (instead of manual `display: none`):

```tsx
import { Activity } from 'react';

// Each project's terminal panels are wrapped in Activity boundaries
{projects.map(project => (
  <Activity key={project.id} mode={project.id === activeProjectId ? 'visible' : 'hidden'}>
    <ClaudeCodePanel projectId={project.id} />
    <TerminalPanel projectId={project.id} />
  </Activity>
))}
```

`<Activity mode="hidden">` automatically applies `display: none`, unmounts effects (timers, subscriptions), deprioritizes hidden updates, and preserves both React state AND DOM state (xterm.js scrollback, cursor position). When made `"visible"` again, effects re-mount and the component restores seamlessly. This replaces the manual `display: none` + `requestAnimationFrame` + `fit()` + `refresh()` pattern with a first-party React primitive.

**Important `<Activity>` + xterm.js interaction:** When `<Activity>` transitions from `"hidden"` to `"visible"`, effects re-mount. Use this lifecycle to call `fitAddon.fit()` and `terminal.refresh(0, terminal.rows - 1)` inside a `useEffect` that depends on the visibility state.

3. WebContentsViews are shown/hidden via `webContentsView.setBounds()` — setting bounds to 0,0,0,0 hides them, setting to panel bounds shows them. (WebContentsViews are native Electron views outside React's tree, so `<Activity>` does not manage them.)

### 4.3 WebContentsView Layering — CRITICAL

Electron `WebContentsView` renders in a SEPARATE layer that sits ABOVE the renderer's DOM. This means any React-rendered UI (toasts, resize handles, menus, dropdowns) will be HIDDEN BEHIND the WebContentsView if they overlap its bounds.

**Mitigations (all are required):**

1. **Toast notifications:** Position in the bottom-right of the LEFT column (Claude Code / Terminal area), NOT the full window. Toasts must never overlap the WebContentsView bounds.
2. **Resize handles:** The vertical resize handle between left column and browser must work despite being adjacent to the WebContentsView. Solution: during drag, temporarily shrink the WebContentsView bounds by 20px on its left edge to reveal the handle area. Restore after drag ends.
3. **Context menus:** Use Electron native menus (`Menu.popup()`), which render at the OS level above everything. Never use custom HTML dropdown menus near the browser panel.
4. **Panel maximize animation:** When maximizing the Claude Code or Terminal panel (Option+F), first hide the WebContentsView (`setBounds(0,0,0,0)`), then animate the panel expansion, then show WebContentsView at new bounds if it's the one being maximized.
5. **DevTools panel:** When DevTools are docked at the bottom of the WebContentsView, the WebContentsView itself handles the split. No extra layout logic needed in the renderer.
6. **Sidebar drag-over:** When dragging a folder over the sidebar to add a project, the WebContentsView must not intercept the drag events. Temporarily set `webContentsView.webContents.setIgnoreMenuShortcuts(true)` or shrink bounds during drag-over state.

### 4.4 WebContentsView Resize Performance

Updating WebContentsView bounds via IPC on every animation frame during panel resize causes visible lag and flicker.

**Solution: Two-phase resize**
1. **During drag:** Hide the WebContentsView content temporarily — replace it with a lightweight placeholder div (same background color as browser panel). This div lives in the renderer and resizes in real-time with zero lag. The user sees the browser area moving smoothly but with a blank placeholder.
2. **On drag end (mouseup):** Calculate final bounds, set WebContentsView bounds once, then fade it back in (opacity 0→1 over 100ms). The user sees a smooth resize followed by a near-instant content reappear.
3. This is the same pattern VS Code uses for its webview panels.

Alternative for small resizes: debounce WebContentsView bound updates to every 100ms during drag. Only use the placeholder approach for the vertical handle (which resizes the browser).

### 4.5 Terminal ↔ xterm.js Data Flow

```
[node-pty in Main] --IPC 'terminal:data'--> [xterm.js in Renderer]
[xterm.js in Renderer] --IPC 'terminal:input'--> [node-pty in Main]
[xterm.js in Renderer] --IPC 'terminal:resize'--> [node-pty in Main]
```

Each terminal (claude + shell) has a unique `terminalId` to route data correctly.

### 4.6 xterm.js GPU Rendering and Hidden Terminal Handling

**GPU-Accelerated Rendering:**
Use `@xterm/addon-webgl` for GPU-accelerated terminal rendering. This provides significantly better performance for fast-scrolling output (build logs, etc.). Set up with automatic fallback:

```typescript
import { WebglAddon } from '@xterm/addon-webgl';

const webglAddon = new WebglAddon();
webglAddon.onContextLoss(() => {
  // WebGL context lost (OOM, system suspend, etc.) — fall back to DOM renderer
  webglAddon.dispose();
});
terminal.loadAddon(webglAddon);
```

**Hidden Terminal State Preservation (via React `<Activity>`):**
When terminals are hidden during project switch, React's `<Activity mode="hidden">` automatically handles `display: none` and effect cleanup. Critical rules still apply:

1. **Never call `fitAddon.fit()` on a hidden terminal** — it will calculate 0×0 dimensions and corrupt the terminal state. `<Activity>` unmounts effects when hidden, so a `useEffect` that calls `fit()` will naturally not run.
2. **On project switch (Activity transitions from "hidden" → "visible"):**
   - `<Activity>` automatically sets container back to visible and re-mounts effects
   - In a `useEffect` triggered by the visibility change, wait one frame (`requestAnimationFrame`) for layout to settle
   - Call `fitAddon.fit()` to recalculate dimensions
   - Call `terminal.refresh(0, terminal.rows - 1)` to fix any rendering artifacts
   - Send new cols/rows to main process via `terminal:resize` IPC
   ```tsx
   useEffect(() => {
     // This effect runs when Activity transitions to "visible"
     requestAnimationFrame(() => {
       fitAddon.fit();
       terminal.refresh(0, terminal.rows - 1);
       ipc.send('terminal:resize', { terminalId, cols: terminal.cols, rows: terminal.rows });
     });
   }, []); // Effect re-mounts on Activity visible
   ```
3. **WebGL context may be lost** on hidden terminals after system sleep. The `onContextLoss` handler above will handle this automatically by falling back to DOM rendering.

### 4.7 PTY Output Flow Control

Fast PTY output (e.g., `cat` of a large file, verbose build logs) can overwhelm xterm.js rendering and freeze the UI. Implement basic backpressure:

1. In the main process, buffer PTY `onData` output and send to renderer in batches (every 16ms ≈ 60fps).
2. If the buffer exceeds a threshold (e.g., 100KB), pause the PTY write stream (`pty.pause()`) and set a flag.
3. After the renderer confirms it has processed the batch (via IPC acknowledgment), resume the PTY (`pty.resume()`).
4. For MVP, a simpler approach is acceptable: just batch `onData` into 16ms chunks using `setInterval` or `requestAnimationFrame` timing on the main process side. This prevents sending thousands of tiny IPC messages per second.

---

## 5. Data Models

### 5.1 Global Config (`~/.a-ide/config.json`)

```typescript
interface GlobalConfig {
  projects: ProjectEntry[];
  settings: AppSettings;
}

interface ProjectEntry {
  id: string;               // UUID v4
  path: string;             // Absolute path to project directory
  addedAt: string;          // ISO 8601 timestamp
  sortOrder: number;        // Position in sidebar
  lastBrowserUrl?: string;  // Persisted browser URL for restore on app restart
}

interface AppSettings {
  fontSize: number;          // Terminal font size, default: 14
  fontFamily: string;        // Terminal font, default: "Menlo, Monaco, monospace"
  defaultShell: string;      // Default: process.env.SHELL || '/bin/zsh'
  sidebarWidth: number;      // Default: 240 (pixels)
  sidebarCollapsed: boolean; // Default: false
  horizontalSplit: number;   // Default: 50 (% width for left column, rest = browser)
  verticalSplit: number;     // Default: 50 (% height for Claude Code in left column, rest = terminal)
  windowBounds: {            // Persisted window position and size
    x?: number;
    y?: number;
    width: number;           // Default: 1400
    height: number;          // Default: 900
    isMaximized?: boolean;
  };
  lastActiveProjectId?: string; // Restore this project on app restart
}
```

### 5.1.1 App Restart Behavior

When A-IDE launches, it must restore the user's previous workspace state:

1. **Window position/size:** Restore from `windowBounds`. If the saved position is off-screen (e.g., external monitor disconnected), reset to centered on primary display.
2. **Active project:** Restore `lastActiveProjectId`. If that project no longer exists, activate the first project in the list.
3. **Terminal sessions:** NOT restored. All terminals start fresh (spawning new PTY processes). This is intentional — resuming orphaned terminal sessions is fragile and confusing.
4. **Browser URLs:** Restored. Each project's last browser URL is saved per-project in the global config and reloaded on activation.
5. **Panel sizes, sidebar width:** Restored from config.
6. **Sidebar collapsed state:** Restored.

The user should feel like they "pick up where they left off" — same project active, same layout — but with fresh terminal sessions. This is the same mental model as restarting VS Code.

### 5.1.2 App Quit Behavior

When the user quits A-IDE (Cmd+Q):

1. **Save all state first:** window bounds, sidebar state, active project, panel sizes, per-project browser URLs — write to config synchronously before quitting.
2. **Kill all PTY processes gracefully:** Send SIGTERM to all node-pty processes, wait up to 2 seconds, then SIGKILL any remaining. Do NOT prompt the user about running processes — this is a developer tool, the user expects fast quit.
3. **Close all WebContentsViews:** Explicitly call `view.webContents.close()` on each WebContentsView to prevent memory leaks (WebContentsView does NOT auto-destroy with the window).
4. **macOS "close window" vs "quit":** On macOS, closing the window (red traffic light) should hide the app (`app.hide()`), NOT quit it. The app stays in the Dock and reopens instantly. Only Cmd+Q actually quits. This matches macOS convention for productivity apps.

### 5.2 Project Config (`.a-ide.json` in project root — optional)

```typescript
interface ProjectConfig {
  name?: string;             // Display name (default: directory name)
  browser?: boolean;         // Enable browser panel (default: true)
  browserUrl?: string;       // URL to load (default: none)
  startCommand?: string;     // Auto-run on project activation (default: none)
  port?: number;             // Expected dev server port
  env?: Record<string, string>; // Extra environment variables
  claudeArgs?: string[];     // Extra arguments for claude CLI
}
```

### 5.3 Git Status

```typescript
interface GitStatus {
  isRepo: boolean;
  branch: string;            // Current branch name
  ahead: number;             // Commits ahead of remote
  behind: number;            // Commits behind remote
  modified: number;          // Number of modified files
  staged: number;            // Number of staged files
  untracked: number;         // Number of untracked files
  isClean: boolean;          // No changes at all
}
```

### 5.4 App State (Zustand Store)

```typescript
interface AppState {
  // Projects
  projects: Project[];
  activeProjectId: string | null;

  // Git
  gitStatuses: Record<string, GitStatus>;  // projectId -> status

  // UI
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  horizontalSplit: number;   // % width for left column (claude+terminal)
  verticalSplit: number;     // % height for Claude Code within left column
  focusedPanel: 'claude' | 'terminal' | 'browser';
  maximizedPanel: 'claude' | 'terminal' | 'browser' | null;
  toast: { message: string; type: 'success' | 'warning' | 'error' } | null;

  // Actions
  setActiveProject: (id: string) => void;
  addProject: (path: string) => void;
  removeProject: (id: string) => void;
  setHorizontalSplit: (pct: number) => void;
  setVerticalSplit: (pct: number) => void;
  setFocusedPanel: (panel: string) => void;
  toggleSidebar: () => void;
  toggleMaximizePanel: (panel: string) => void;
  showToast: (message: string, type: 'success' | 'warning' | 'error') => void;
  dismissToast: () => void;
  updateGitStatus: (id: string, status: GitStatus) => void;
}
```

---

## 6. Feature Specifications

### 6.1 Sidebar — Project List

**Description:** Left sidebar showing all registered projects with git status. This is the user's primary navigation — it must feel fast, clear, and satisfying.

**Acceptance Criteria:**
- [ ] Sidebar displays list of projects in configured sort order
- [ ] Each project card shows: name, git branch, git status indicator
- [ ] Clicking a project card switches all panels to that project
- [ ] Active project is visually highlighted (bright left border + lighter background + bright text)
- [ ] "+" button at bottom opens native macOS folder picker dialog
- [ ] Right-click on project card shows native macOS context menu: "Remove Project", "Open in Finder", "Copy Path"
- [ ] Removing a project shows an undo toast: "Project removed — Undo" (with clickable "Undo" link). The project is only permanently removed from config after the toast auto-dismisses (5 seconds). Clicking Undo restores it instantly to its original position. This prevents accidental data loss.
- [ ] Sidebar width is resizable via drag handle on right edge
- [ ] Sidebar has a minimum width of 180px and maximum of 400px
- [ ] Sidebar is scrollable with native macOS overlay scrollbar when projects overflow
- [ ] Drag & drop: user can drag a folder from Finder into the sidebar to add it
- [ ] Drag & drop: visual drop zone indicator appears when hovering a folder over the sidebar (dashed border, "Drop to add project" text)
- [ ] Drag to reorder: user can drag project cards within the sidebar to change order. Show a blue insertion line at the drop position. Persist new order to config
- [ ] Sidebar can be collapsed by dragging its edge to the left (below minimum width → collapse to 0 with just a 4px hover-trigger edge to expand)
- [ ] Cmd+B toggles sidebar collapsed/expanded
- [ ] When sidebar is collapsed, a thin vertical strip remains visible on hover to allow expanding

**Git Status Indicators:**
- Green dot + "✓" = clean (isClean: true)
- Yellow dot + number = uncommitted changes (modified + staged + untracked)
- Blue "↑ N" = ahead of remote
- Orange "↓ N" = behind remote
- No dot, no git info = not a git repository (just show project name)
- ⚠ icon + red text = project folder not found

**Empty State:**
When no projects are added, the entire panel area (sidebar + panels) shows a centered welcome screen:
- A-IDE icon/logo (subtle, 48px)
- "Welcome to A-IDE" heading
- "Add a project to get started" subtext
- Large "Add Project" button (primary style, blue background)
- Small text: "or drag a folder here • Cmd+N"

**Implementation Notes:**
- Git status is polled every 5 seconds per project via `GitWatcher` service
- Only poll for projects whose directory exists (handle deleted directories gracefully)
- Use `simple-git` in main process, send results via IPC
- Drag & drop uses Electron's native drag events on the renderer side
- Sidebar collapse state is saved to config

### 6.2 Claude Code Panel

**Description:** Terminal panel running the `claude` CLI process.

**Acceptance Criteria:**
- [ ] On project activation, spawns `claude` in the project directory via node-pty
- [ ] Full terminal emulation: colors, cursor movement, interactive prompts
- [ ] Scrollback buffer of at least 10,000 lines
- [ ] Copy/paste works (Cmd+C to copy selection, Cmd+V to paste)
- [ ] Font size matches global setting
- [ ] Terminal resizes when panel is resized (sends SIGWINCH via node-pty)
- [ ] If `claude` process exits, show message with "Restart" button
- [ ] Cmd+Shift+R restarts the claude process in the same project directory
- [ ] Process keeps running when project is in background (not killed on switch)

**Implementation Notes:**
- Spawn: `node-pty.spawn(shell, ['-c', 'claude', ...claudeArgs], { cwd: projectPath, env: mergedEnv })`
- Actually: spawn claude directly, not through shell: `node-pty.spawn('claude', claudeArgs, { cwd: projectPath, env: { ...process.env, ...projectEnv } })`
- Each project gets a unique xterm.Terminal instance in the renderer
- On project switch, `<Activity>` handles visibility automatically (see Section 4.2)
- Terminal data flow: `pty.onData -> ipc -> xterm.write()` and `xterm.onData -> ipc -> pty.write()`

**Exit State Overlay:**
When the claude process exits, an overlay appears OVER the terminal content (which remains visible behind it, dimmed to 30% opacity):
```
┌──────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│          ┌─────────────────────────┐              │
│          │  Session ended          │              │
│          │                         │              │
│          │  ┌─────────────────┐    │              │
│          │  │  ↻ New Session  │    │              │
│          │  └─────────────────┘    │              │
│          │  Cmd+Shift+R            │              │
│          └─────────────────────────┘              │
└──────────────────────────────────────────────────┘
  Overlay: rgba(30, 30, 30, 0.85)
  Card: --bg-tertiary, border-radius 8px, padding 24px
  "Session ended": --text-bright, 14px, font-weight 500
  Button: --accent-blue bg, white text, border-radius 6px
  Shortcut hint: --text-secondary, 11px
  If exit code != 0: show "Session ended (exit code: N)" in --accent-yellow
```

**Claude Code Auth Flow:**
When Claude Code is launched and the user is not authenticated, Claude's CLI displays its own interactive authentication flow in the terminal. A-IDE must NOT interfere with this — the terminal is fully interactive and the user can complete auth directly. No special handling needed beyond ensuring the terminal emulation supports the auth flow's formatting (links, QR codes if applicable).

### 6.3 Terminal Panel

**Description:** Regular shell terminal for manual commands (git, npm, etc.).

**Acceptance Criteria:**
- [ ] On project activation, spawns user's default shell in project directory
- [ ] Full terminal emulation including oh-my-zsh, starship, powerlevel10k themes
- [ ] All features from Claude Code Panel (scrollback, copy/paste, resize, font)
- [ ] Cmd+T creates a new terminal tab within the panel (future: v0.2, skip for MVP)
- [ ] Process keeps running when project is in background
- [ ] If shell exits, show same exit overlay as Claude Code panel but with "Terminal session ended" and "↻ Restart" button
- [ ] Exit overlay preserves terminal scrollback visible (dimmed) behind it, so the user can see what happened before the exit

**Implementation Notes:**
- Spawn: `node-pty.spawn(settings.defaultShell, [], { cwd: projectPath, env: mergedEnv })`
- Same xterm.js lifecycle as Claude Code Panel
- For MVP: single terminal per project (no tabs)
- **`startCommand` support:** If the project config has a `startCommand` (e.g., `"npm run dev"`), automatically write it to the terminal's PTY on first activation (followed by `\r` to execute). Only on FIRST activation — not on subsequent project switches. This starts the dev server automatically when the project is opened for the first time in a session.

### 6.4 Browser Panel

**Description:** Embedded Chromium browser for localhost preview with DevTools access. Should feel like a lightweight Chrome — familiar and reliable.

**Acceptance Criteria:**
- [ ] Displays a URL bar at the top of the panel with current URL
- [ ] Back, Forward, Reload buttons next to URL bar with proper disabled states (e.g., Back is dimmed when there's no history)
- [ ] URL bar is editable — pressing Enter navigates to entered URL. Pressing Escape reverts to current URL and blurs the input
- [ ] URL bar auto-selects all text on focus (click or Tab into it) — so the user can immediately type a new URL without manually selecting
- [ ] URL bar shows favicon of the loaded page (if available) to the left of the URL
- [ ] URL bar auto-prepends `http://` if the user types a bare `localhost:PORT` without protocol
- [ ] URL bar shows a loading spinner (replacing favicon) while a page is loading
- [ ] A thin progress bar (2px, `--accent-blue`) animates across the top of the browser content area during page load (like Chrome)
- [ ] DevTools toggle button opens Chrome DevTools docked below the browser content
- [ ] DevTools button visually indicates when DevTools are open (highlighted/active state)
- [ ] Keyboard shortcut Cmd+Option+I toggles DevTools
- [ ] Browser content loads the project's configured `browserUrl` on first activation
- [ ] Browser preserves full state (URL, scroll, form inputs, JS state) on project switch
- [ ] If no `browserUrl` is configured, shows a styled placeholder page (dark theme matching app) with:
  - A subtle globe icon (48px, dimmed)
  - "No preview URL" heading
  - "Enter a URL above or add a `browserUrl` to your `.a-ide.json`" subtext
  - The placeholder must be a local HTML file, not just text in the panel
- [ ] If `browser: false` in project config, the browser panel is hidden and Claude Code + Terminal expand to fill the full width. The vertical resize handle disappears. Layout smoothly transitions
- [ ] Right-click in browser content shows standard Chromium context menu (Copy, Paste, Inspect, etc.)
- [ ] Cmd+R while browser is focused reloads the page (standard browser behavior)

**Implementation Notes:**
- Use `WebContentsView` (not `<webview>` tag and not deprecated `BrowserView`) for performance and security
- Create via `new WebContentsView({ webPreferences: { ... } })` then add to window via `mainWindow.contentView.addChildView(view)`
- Position via `view.setBounds({ x, y, width, height })` relative to the window's content area
- On project switch: hide with `view.setBounds({ x: 0, y: 0, width: 0, height: 0 })`, show with correct bounds on new view
- To bring a view to front: `mainWindow.contentView.addChildView(view)` (re-adding moves it to top of z-order)
- DevTools: `view.webContents.openDevTools({ mode: 'bottom' })`
- The URL bar and navigation buttons are React components in the renderer — they communicate with WebContentsView via IPC
- WebContentsView `webContents` emits `did-navigate`, `did-navigate-in-page`, `did-start-loading`, `did-stop-loading`, `did-fail-load`, and `page-favicon-updated` — forward these to renderer to update URL bar state
- Security: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `focusOnNavigation: false` on all WebContentsViews. The `focusOnNavigation: false` (new in Electron 40) prevents the browser panel from stealing focus when navigating — critical for UX so the user can keep typing in the terminal while a page loads
- Loading progress: use `did-start-loading` → show progress bar, `did-stop-loading` → hide progress bar. Use a CSS animation that fills to 90% over 2s, then jumps to 100% on load complete

### 6.5 Project Switching

**Description:** The core feature — clicking a project in the sidebar switches all panels instantly with full state preservation. This must feel magical — like the project was always right there.

**Acceptance Criteria:**
- [ ] Clicking a project in sidebar switches active project within <100ms (perceived)
- [ ] Claude Code terminal shows exact state from last interaction (scrollback, running process)
- [ ] Shell terminal shows exact state from last interaction
- [ ] Browser shows same URL, scroll position, form inputs
- [ ] No flicker or white flash during switch — use a 120ms crossfade (opacity transition)
- [ ] First-time project activation shows a brief loading state in panels (~1-2s):
  - Panel headers show a subtle pulse/shimmer animation
  - Panel content shows centered spinner with "Starting Claude Code..." / "Starting terminal..."
  - Once ready, content fades in (opacity 0→1 over 200ms)
- [ ] Sidebar active indicator updates immediately (before panels finish switching)
- [ ] Focus behavior: the same panel type that was focused before the switch remains focused after (e.g., if Terminal was focused in Project A, Terminal gets focus in Project B)
- [ ] Rapid switching: clicking 5 projects in quick succession must not crash, queue up, or show wrong state — only the last-clicked project should end up active

**Implementation Notes:**
- Renderer wraps ALL project terminal panels in React `<Activity>` boundaries:
  ```tsx
  {projects.map(p => (
    <Activity key={p.id} mode={p.id === activeId ? 'visible' : 'hidden'}>
      <ProjectPanels projectId={p.id} />
    </Activity>
  ))}
  ```
- `<Activity mode="hidden">` handles `display: none`, effect cleanup, and deprioritized rendering automatically
- Switch animation: `<Activity>` transitions are instant, but add a 120ms CSS opacity crossfade on the container for visual smoothness
- After Activity transitions to "visible", a `useEffect` fires → call `xterm.refresh(0, xterm.rows - 1)` to fix rendering artifacts
- WebContentsView switch is handled in main process via IPC (outside React's tree)
- Sequence: `renderer sends 'project:switch' -> main freezes old session -> main thaws new session -> main sends 'session:switched' -> renderer updates activeProjectId state -> Activity boundaries automatically show/hide`
- Debounce rapid switches: if a new switch comes in before the previous one completes, cancel the previous and switch to the newest target

### 6.6 Resizable Panels

**Description:** The layout uses a two-axis split: a vertical divider separating the left column (Claude Code + Terminal) from the Browser, and a horizontal divider within the left column separating Claude Code from Terminal.

**Acceptance Criteria:**
- [ ] Vertical drag handle between left column and browser is draggable (left/right resize)
- [ ] Horizontal drag handle between Claude Code and Terminal is draggable (up/down resize)
- [ ] Drag handles have a 6px VISUAL size but a 16px INVISIBLE hit target (5px padding on each side of the 6px visual line). This ensures the handle is easy to grab while looking minimal. The cursor changes to resize cursor when entering the hit target, not just the visual line
- [ ] Left column has minimum width of 300px
- [ ] Browser has minimum width of 300px
- [ ] Claude Code and Terminal each have minimum height of 100px
- [ ] Panel sizes persist across project switches (global setting, not per-project)
- [ ] Panel sizes persist across app restarts (saved to config)
- [ ] Double-click a divider to reset to 50/50 split

**Implementation Notes:**
- Store splits as two percentages in Zustand: `horizontalSplit: 50` (left column width %) and `verticalSplit: 50` (Claude Code height within left column %)
- Vertical drag handle: recalculates `horizontalSplit`, also triggers WebContentsView repositioning
- Horizontal drag handle: recalculates `verticalSplit`
- After any resize, send new dimensions to main process for WebContentsView repositioning
- Use `requestAnimationFrame` for smooth resize rendering
- Debounce config save (write to disk only after 500ms of no resize activity)

### 6.7 Keyboard Shortcuts

**Acceptance Criteria:**
- [ ] All shortcuts work regardless of which panel has focus
- [ ] Shortcuts don't conflict with terminal input (use Cmd modifier)

**Shortcut Table:**

| Shortcut | Action | Scope |
|---|---|---|
| `Cmd+1` through `Cmd+9` | Switch to project 1–9 | Global |
| `Cmd+↓` | Next project | Global |
| `Cmd+↑` | Previous project | Global |
| `Option+1` | Focus Claude Code panel | Global |
| `Option+2` | Focus Terminal panel | Global |
| `Option+3` | Focus Browser panel | Global |
| `Option+F` | Maximize/restore focused panel | Global |
| `Cmd+B` | Toggle sidebar collapsed/expanded | Global |
| `Cmd+Option+I` | Toggle browser DevTools | Global |
| `Cmd+Shift+R` | Restart Claude Code session | Global |
| `Cmd++` / `Cmd+=` | Increase terminal font size | Global |
| `Cmd+-` | Decrease terminal font size | Global |
| `Cmd+0` | Reset terminal font size to default | Global |
| `Cmd+R` | Reload browser (when browser focused) | Browser |
| `Cmd+,` | Open settings (future) | Global |
| `Cmd+N` | Add new project | Global |
| `Cmd+/` | Show keyboard shortcuts overlay | Global |

**Keyboard Shortcut Overlay (`Cmd+/`):**
When triggered, shows a centered semi-transparent overlay (like GitHub's `?` shortcut) listing all shortcuts grouped by category. Press Escape or `Cmd+/` again to dismiss. Overlay appears/disappears with a 150ms fade. Does not steal focus from the active panel — purely visual.

**Implementation Notes:**
- **DO NOT use `globalShortcut`** — it captures keys even when the app is NOT focused, which will steal shortcuts from other apps. This is a common Electron mistake.
- **Primary approach: Menu accelerators** — Register most shortcuts as hidden menu items with `accelerator` properties. These only fire when the app is focused. Create an invisible "Shortcuts" submenu with all custom shortcuts.
- **Terminal shortcut interception:** xterm.js captures most keyboard input, so Cmd+shortcuts must be intercepted BEFORE they reach the renderer. Use `webContents.on('before-input-event')` in the main process to catch Cmd+1-9, Option+1-3, etc., call `event.preventDefault()`, and execute the action via IPC.
- **Panel focus management:** Focusing a panel means its xterm gets `.focus()` or WebContentsView gets `webContents.focus()`. When switching focus to browser, use `webContentsView.webContents.focus()`.
- **WebContentsView keyboard capture:** When the browser panel's WebContentsView is focused, keyboard events go to its webContents, not the main renderer. To intercept shortcuts while browser is focused, also listen to `before-input-event` on each WebContentsView's webContents.

### 6.8 Status Bar

**Description:** Bottom bar showing current project info and quick reference.

**Acceptance Criteria:**
- [ ] Shows: Active project name, git branch, panel shortcut hints, browser URL + status
- [ ] Browser status: green dot if `browserUrl` is reachable, red dot if not
- [ ] Updates in real-time when switching projects
- [ ] Fixed height: 28px
- [ ] Does not steal focus when clicked

**Layout:**
```
│ ● App A │ main ✓ │ ⌥1 Claude  ⌥2 Terminal  ⌥3 Browser │ localhost:3000 ● │
```

---

## 7. IPC API Reference

All IPC communication uses Electron's `ipcMain.handle` / `ipcRenderer.invoke` pattern (async) or `ipcMain.on` / `webContents.send` for events (streaming).

### 7.1 Request-Response Channels (invoke/handle)

```typescript
// === PROJECT MANAGEMENT ===

'project:add'
  Args: { path: string }
  Returns: { project: Project } | { error: string }
  // Validates path exists, creates ProjectEntry, saves config

'project:remove'
  Args: { id: string }
  Returns: { success: boolean }
  // Removes from config, kills associated sessions

'project:list'
  Args: none
  Returns: { projects: Project[] }
  // Returns all projects with current git status

'project:get-config'
  Args: { id: string }
  Returns: { config: ProjectConfig }
  // Reads .a-ide.json from project directory

// === SESSION MANAGEMENT ===

'session:switch'
  Args: { projectId: string }
  Returns: { success: boolean, isNew: boolean }
  // Freezes current, thaws target. isNew=true if first activation.

'session:get-active'
  Args: none
  Returns: { projectId: string | null }

// === TERMINAL MANAGEMENT ===

'terminal:create'
  Args: { projectId: string, type: 'claude' | 'shell' }
  Returns: { terminalId: string }
  // Spawns node-pty process, returns unique ID

'terminal:input'
  Args: { terminalId: string, data: string }
  Returns: void
  // Sends keystrokes to PTY

'terminal:resize'
  Args: { terminalId: string, cols: number, rows: number }
  Returns: void
  // Resizes PTY

'terminal:restart'
  Args: { terminalId: string }
  Returns: { success: boolean }
  // Kills and respawns the PTY process

'terminal:kill'
  Args: { terminalId: string }
  Returns: void

// === BROWSER MANAGEMENT ===

'browser:navigate'
  Args: { projectId: string, url: string }
  Returns: { success: boolean }

'browser:go-back'
  Args: { projectId: string }
  Returns: void

'browser:go-forward'
  Args: { projectId: string }
  Returns: void

'browser:reload'
  Args: { projectId: string }
  Returns: void

'browser:toggle-devtools'
  Args: { projectId: string }
  Returns: void

'browser:set-bounds'
  Args: { projectId: string, bounds: { x: number, y: number, width: number, height: number } }
  Returns: void
  // Positions WebContentsView within the window

// === GIT ===

'git:get-status'
  Args: { projectId: string }
  Returns: { status: GitStatus }

// === CONFIG ===

'config:get-settings'
  Args: none
  Returns: { settings: AppSettings }

'config:update-settings'
  Args: { settings: Partial<AppSettings> }
  Returns: { success: boolean }

// === APP ===

'app:open-folder-dialog'
  Args: none
  Returns: { path: string | null }
  // Opens native macOS folder picker
```

### 7.2 Event Channels (send/on — streaming)

```typescript
// Main -> Renderer (events)

'terminal:data'
  Payload: { terminalId: string, data: string }
  // PTY output data, sent to xterm.write()

'terminal:exit'
  Payload: { terminalId: string, exitCode: number }
  // PTY process exited

'session:switched'
  Payload: { projectId: string, isNew: boolean }
  // Confirmation that session switch completed in main

'git:status-updated'
  Payload: { projectId: string, status: GitStatus }
  // Git status changed for a project

'browser:url-changed'
  Payload: { projectId: string, url: string }
  // WebContentsView navigated to new URL

'browser:title-changed'
  Payload: { projectId: string, title: string }
  // WebContentsView page title changed

'browser:loading-changed'
  Payload: { projectId: string, isLoading: boolean }
  // WebContentsView started/stopped loading (for progress bar)

'browser:favicon-changed'
  Payload: { projectId: string, favicons: string[] }
  // Page favicon updated (array of favicon URLs)
```

### 7.3 Preload Script (contextBridge)

```typescript
// src/preload/index.ts
const ALLOWED_INVOKE_CHANNELS = [
  'project:add', 'project:remove', 'project:list', 'project:get-config',
  'session:switch', 'session:get-active',
  'terminal:create', 'terminal:input', 'terminal:resize', 'terminal:restart', 'terminal:kill',
  'browser:navigate', 'browser:go-back', 'browser:go-forward', 'browser:reload',
  'browser:toggle-devtools', 'browser:set-bounds',
  'git:get-status',
  'config:get-settings', 'config:update-settings',
  'app:open-folder-dialog',
] as const;

const ALLOWED_EVENT_CHANNELS = [
  'terminal:data', 'terminal:exit',
  'session:switched',
  'git:status-updated',
  'browser:url-changed', 'browser:title-changed', 'browser:loading-changed', 'browser:favicon-changed',
] as const;

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: any[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel as any)) throw new Error(`IPC channel not allowed: ${channel}`);
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel: string, callback: (...args: any[]) => void) => {
    if (!ALLOWED_EVENT_CHANNELS.includes(channel as any)) throw new Error(`IPC channel not allowed: ${channel}`);
    const listener = (_event: IpcRendererEvent, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  once: (channel: string, callback: (...args: any[]) => void) => {
    if (!ALLOWED_EVENT_CHANNELS.includes(channel as any)) throw new Error(`IPC channel not allowed: ${channel}`);
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  }
});
```

---

## 8. UI Specifications

### 8.1 Color Palette (Dark Theme)

```css
:root {
  /* Backgrounds */
  --bg-primary: #1e1e1e;        /* Main panels background */
  --bg-secondary: #252526;       /* Sidebar background */
  --bg-tertiary: #2d2d2d;       /* Status bar, panel headers */
  --bg-hover: #2a2d2e;          /* Hover state */
  --bg-active: #37373d;         /* Active/selected state */

  /* Borders */
  --border-primary: #3c3c3c;    /* Panel dividers */
  --border-subtle: #2d2d2d;     /* Subtle separators */

  /* Text */
  --text-primary: #cccccc;      /* Main text */
  --text-secondary: #9d9d9d;    /* Dimmed text */
  --text-bright: #ffffff;       /* Emphasized text */

  /* Accents */
  --accent-blue: #007acc;       /* Active indicators, focus borders */
  --accent-green: #4ec9b0;      /* Clean git status */
  --accent-yellow: #cca700;     /* Uncommitted changes */
  --accent-orange: #d18616;     /* Behind remote */
  --accent-red: #f44747;        /* Errors, offline status */

  /* Sidebar */
  --sidebar-active-border: #007acc;  /* Left border on active project */
}
```

### 8.2 Typography

```css
/* UI Text */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
font-size: 13px;

/* Terminal */
font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
font-size: 14px; /* configurable */
line-height: 1.4;
```

### 8.3 Layout Dimensions

**Default Layout: Side-by-Side (Layout C — Browser Focus)**

The browser gets the full right column height for proper web previews. Claude Code and Terminal are stacked on the left.

```
┌──────────────────────────────────────────────────────────┐
│ Window: min 900x600, default 1400x900                     │
├──────────┬──────────────────┬────────────────────────────┤
│ Sidebar  │ Claude Code: 50% │                            │
│ 240px    │ (of left column) │   Browser                  │
│ (resize) │                  │   50% width (resizable)    │
│ min:180  │─── drag 6px ─────│   Full height              │
│ max:400  │ Terminal: 50%    │                            │
│          │ (of left column) │                            │
├──────────┴──────────────────┴────────────────────────────┤
│ Status Bar: 28px fixed                                    │
└──────────────────────────────────────────────────────────┘
```

**Panel split logic:**
- **Horizontal split** (left vs right): Left column 50%, Browser 50% — resizable via vertical drag handle
- **Vertical split** (within left column): Claude Code 50%, Terminal 50% — resizable via horizontal drag handle
- Left column minimum width: 300px
- Browser minimum width: 300px
- Claude Code / Terminal minimum height: 100px each

**Resize constraint priority (when window is small):**
When the window is resized smaller and panel minimums conflict, apply this priority:
1. Sidebar width is clamped first (shrinks toward 180px minimum)
2. Then the horizontal split adjusts to maintain panel minimums (300px each)
3. If the window is at its minimum (900px) and the sidebar is at 180px, that leaves 720px for panels — split evenly: 360px each (above the 300px minimum)
4. Never let a panel go below its minimum — clamp the resize handle instead

### 8.4 Component Specifications

**Panel Headers (on each panel):**
```
┌──────────────────────────────────────────────────┐
│  ⚡ Claude Code                              ⟐  │  height: 28px
└──────────────────────────────────────────────────┘
  Icon + Label: 13px, font-weight 500
  Focused: 2px bottom border in --accent-blue, label in --text-bright
  Unfocused: no bottom border, label in --text-secondary
  ⟐ = panel maximize button (appears on hover only)
  Background: --bg-tertiary
  Padding: 0 12px
  The header is also the drag target for the resize handle below it
```

Panel header labels:
- Claude Code panel: "⚡ Claude Code"
- Terminal panel: "▸ Terminal"
- Browser panel: "🌐 Browser" (changes to page title when a page is loaded)

**ProjectCard (Sidebar):**
```
┌─────────────────────────┐
│ ▌● Project Name         │  height: 52px
│ ▌  main  ✓ clean        │  padding: 8px 12px
└─────────────────────────┘
  ▌ = 3px left border (--accent-blue when active, transparent when inactive)
  ● = 8px circle (green/yellow/orange/red based on git status)
  Active: bg --bg-active, name in --text-bright
  Inactive: bg transparent, name in --text-primary
  Hover (inactive): bg --bg-hover, 150ms ease transition
  Click: scale(0.98) for 100ms, then back to 1.0
  Branch name: --text-secondary, 11px, monospace
  Git status: colored per status type, 11px
```

**Browser URL Bar:**
```
┌──────────────────────────────────────────────────┐
│  ◀  ▶  ↻  │ 🔵 http://localhost:3000       🔧  │  height: 32px
└──────────────────────────────────────────────────┘
  ◀▶↻ = navigation buttons (16px icons)
    Enabled: --text-primary, hover: --text-bright
    Disabled: --text-secondary (30% opacity), cursor: default
  🔵 = favicon or loading spinner (16px)
  🔧 = DevTools toggle button
    Active (DevTools open): --accent-blue background
    Inactive: transparent, hover: --bg-hover
  URL input: flex: 1, monospace font, 12px
    Focused: --accent-blue focus ring (box-shadow)
    Unfocused: no ring
  Background: --bg-tertiary
  Padding: 0 8px
  Border-bottom: 1px solid --border-subtle
```

**Resize Handle (Horizontal — between Claude Code and Terminal):**
```
┌──────────────────────────────────────────────────┐
│                      ⋯                            │  visual: 6px, hit target: 16px
└──────────────────────────────────────────────────┘
  Visual: 1px line centered in 6px space, color: var(--border-primary)
  Hit target: 16px tall transparent area (5px above + 6px visual + 5px below, overlapping panels)
  Hover (anywhere in hit target): line highlights to var(--accent-blue), show ⋯ grip dots, cursor: row-resize
  Active (dragging): --accent-blue at full opacity
  Transition: color 100ms ease
```

**Resize Handle (Vertical — between left column and Browser):**
```
  Visual: 6px wide, full height of panel area
  Hit target: 16px wide (5px left + 6px visual + 5px right, overlapping panels)
  Visual: 1px line centered, color: var(--border-primary)
  Hover: highlight to var(--accent-blue), show ⋮ grip dots, cursor: col-resize
  Active (dragging): --accent-blue at full opacity
  Transition: color 100ms ease
```

**Toast Notification:**
```
┌───────────────────────────────────┐
│  ✓  Project "My App" added        │  height: auto (min 40px)
└───────────────────────────────────┘
  Position: bottom-right, 16px from edges
  Background: --bg-tertiary with 1px border --border-primary
  Border-radius: 8px
  Box-shadow: 0 4px 12px rgba(0,0,0,0.3)
  Icon: ✓ (green) for success, ⚠ (yellow) for warning
  Animation: slide in from right (200ms ease-out), auto-dismiss after 3s
  Max 1 visible at a time
```

**Welcome Screen (no projects):**
```
┌──────────────────────────────────────────────────┐
│                                                    │
│                  [A-IDE icon 48px]                  │
│                                                    │
│              Welcome to A-IDE                      │
│         Add a project to get started               │
│                                                    │
│           ┌──────────────────────┐                 │
│           │  + Add Project       │   Primary button │
│           └──────────────────────┘                 │
│                                                    │
│        or drag a folder here · Cmd+N               │
│                                                    │
└──────────────────────────────────────────────────┘
  Centered in the full panel area (sidebar + panels)
  Icon: --text-secondary
  Heading: --text-bright, 20px, font-weight 600
  Subtext: --text-secondary, 13px
  Button: --accent-blue background, white text, 14px, padding 10px 24px
         Hover: slightly lighter blue, transition 150ms
  "drag a folder here" hint: --text-secondary, 12px
```

---

## 9. Implementation Plan

Build in this exact order. Each phase should be fully working before moving to the next.

### Phase 1: Electron Shell + Window (Day 1)

**Goal:** Empty Electron window with native macOS feel and dark background launches on macOS.

**Tasks:**
1. Initialize project: `npm create @quick-start/electron@latest a-ide -- --template react-ts`, then install `tailwindcss`, `@tailwindcss/vite`
2. Configure `electron.vite.config.ts`:
   - Import and add `@tailwindcss/vite` plugin to the renderer config
   - Configure main, preload, and renderer entry points
3. Set up Tailwind v4 CSS-first config in `src/renderer/assets/main.css`:
   ```css
   @import "tailwindcss";
   @theme {
     --color-bg-primary: #1e1e1e;
     --color-bg-secondary: #252526;
     --color-bg-tertiary: #2d2d30;
     --color-text-bright: #cccccc;
     --color-text-secondary: #858585;
     --color-accent-blue: #007acc;
   }
   ```
   No `tailwind.config.ts` needed — Tailwind v4 uses CSS-first configuration.
4. Create `src/main/index.ts`: create BrowserWindow with:
   - `titleBarStyle: 'hiddenInset'` (native traffic lights, no title bar chrome)
   - `backgroundColor: '#1e1e1e'` (prevent white flash on launch)
   - `trafficLightPosition: { x: 16, y: 16 }` (position in sidebar area)
   - `minWidth: 900, minHeight: 600`
   - `width: 1400, height: 900` (default size)
   - Restore previous window position/size from saved config
   - Add `win.on('closed')` handler to clean up any WebContentsViews (prevent memory leaks)
   - Handle macOS window close: `win.on('close', (e) => { e.preventDefault(); win.hide() })` — hide instead of quit on red traffic light. Only `app.on('before-quit')` should actually quit.
5. Create `src/preload/index.ts`: contextBridge with channel allowlist
6. Create `src/renderer/`: React app with dark background, verify Tailwind works
7. Save window bounds on `resize` and `move` events (debounced 500ms) to config
8. Verify: `npm run dev` opens a dark window with native traffic lights

**Acceptance Test:** Running `npm run dev` opens a macOS window with native traffic lights in the top-left, dark background (#1e1e1e), no white flash on startup. Window remembers its size and position after restarting the app.

### Phase 2: Layout + Sidebar Shell (Day 1–2)

**Goal:** Side-by-side panel layout with resizable dividers and a sidebar that shows placeholder projects.

**Tasks:**
1. Create `PanelLayout.tsx` with two-axis split: left column (Claude Code + Terminal stacked) and right column (Browser)
2. Implement `ResizeHandle.tsx` — vertical handle between left/right columns, horizontal handle between Claude Code/Terminal
3. Create `Sidebar.tsx` with hardcoded project list
4. Create `ProjectCard.tsx` with name and placeholder status
5. Create `StatusBar.tsx` with placeholder content
6. Store split percentages in Zustand (`horizontalSplit`, `verticalSplit`), persist to `~/.a-ide/config.json` via `ConfigManager`

**Acceptance Test:** Window shows sidebar with placeholder projects, left column with two stacked gray panels, right column with one tall gray panel. Both drag handles resize smoothly.

### Phase 3: Terminal Integration (Day 2–3)

**Goal:** A single working terminal (shell) in the Terminal Panel with GPU-accelerated rendering.

**Tasks:**
1. Install `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-webgl`, `node-pty`
2. Run `npx @electron/rebuild` to compile node-pty for Electron's Node version
3. Create `TerminalManager.ts` in main: spawn node-pty, handle IPC, batch PTY output into 16ms chunks
4. Create `useTerminal.ts` hook: create xterm.Terminal, load WebGL addon with DOM fallback on context loss, connect to IPC data stream
5. Wire up `TerminalPanel.tsx` with the hook
6. Handle resize: `FitAddon` → send cols/rows to main → `pty.resize()`. Use `ResizeObserver` on container (NOT `window.resize`)
7. Register IPC handlers in `src/main/ipc/terminal.ts`
8. Verify hidden terminal handling: ensure `fit()` is only called on visible terminals

**Acceptance Test:** Terminal panel shows user's shell (zsh with theme), can type commands, output displays correctly, resizing works. GPU renderer active (verify via DevTools → Rendering → "FPS meter").

### Phase 4: Claude Code Terminal (Day 3)

**Goal:** Claude Code panel runs `claude` CLI.

**Tasks:**
1. Duplicate terminal logic for Claude Code panel with separate PTY
2. Spawn `claude` instead of shell, with project cwd
3. Create `ClaudeCodePanel.tsx` using same `useTerminal` hook
4. Add restart logic (Cmd+Shift+R kills and respawns PTY)
5. Show "Process exited" message with restart button when claude exits

**Acceptance Test:** Claude Code panel starts `claude`, accepts input, shows colored output. Restart works.

### Phase 5: Project Management + Switching (Day 4–5)

**Goal:** Add/remove projects, switch between them with full state preservation.

**Tasks:**
1. Create `ConfigManager.ts`: read/write `~/.a-ide/config.json`
2. Create `SessionManager.ts`: manage per-project sessions
3. Implement `project:add` IPC (with folder picker dialog)
4. Implement `project:remove` IPC
5. Implement `session:switch` IPC:
   - Freeze: store terminal IDs, hide WebContentsView
   - Thaw: show terminals, show WebContentsView
6. Renderer: wrap each project's panels in React `<Activity>` boundaries, switch via `activeProjectId` state
7. Wire up sidebar clicks to `session:switch`
8. Implement `Cmd+1` through `Cmd+9` shortcuts

**Acceptance Test:** Can add two projects. Clicking between them in sidebar instantly switches terminals. Both terminals retain full scrollback and running processes.

### Phase 6: Browser Panel (Day 5–6)

**Goal:** Embedded browser with URL bar, navigation, DevTools, and proper WebContentsView management.

**Tasks:**
1. Create `BrowserManager.ts` in main: create/manage WebContentsView instances via `new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } })`
2. Add views to window via `mainWindow.contentView.addChildView(view)`, remove via `mainWindow.contentView.removeChildView(view)`
3. Create `BrowserPanel.tsx` with URL bar, nav buttons, DevTools toggle
4. Implement `browser:navigate`, `browser:go-back`, `browser:go-forward`, `browser:reload` IPC
5. Position WebContentsView to match panel bounds (recalculate on resize via `view.setBounds()`)
6. Handle `did-navigate`, `did-start-loading`, `did-stop-loading` events to update URL bar state and show loading progress
7. Implement DevTools toggle (`view.webContents.openDevTools({ mode: 'bottom' })`)
8. Hide/show WebContentsView on project switch (setBounds to 0,0,0,0 to hide)
9. Implement the layering mitigations from Section 4.3 (toast positioning, resize handle interaction)
10. Register `before-input-event` on each WebContentsView's webContents to intercept app shortcuts while browser is focused

**Acceptance Test:** Browser panel shows URL bar, can navigate to localhost URLs, DevTools open. Browser state preserved across project switches. Resize handles work correctly adjacent to browser panel. Toasts appear in left column, not behind browser.

### Phase 7: Git Integration (Day 6–7)

**Goal:** Sidebar shows real git branch and status per project.

**Tasks:**
1. Create `GitWatcher.ts`: polls all project directories every 5 seconds
2. Use `simple-git` to get: branch, ahead, behind, modified, staged, untracked
3. Send `git:status-updated` events to renderer
4. Update `ProjectCard.tsx` with real git data
5. Update `StatusBar.tsx` with active project's git info

**Acceptance Test:** Sidebar shows real branch names, status indicators update when making changes in terminal.

### Phase 8: UX Polish + Keyboard Shortcuts (Day 7–8)

**Goal:** All keyboard shortcuts work, all transitions are smooth, all states are handled. The app should feel like a polished product, not a prototype.

**Tasks:**
1. Register all keyboard shortcuts from shortcut table
2. Panel focus management (Option+1/2/3) with visual focus indicator (blue bottom border on panel header)
3. Maximize/restore panel (Option+F) with 200ms ease-out animation
4. Sidebar collapse (Cmd+B) with smooth width animation
5. Sidebar drag & drop for adding projects from Finder
6. Implement all transition animations:
   - Project switch crossfade (120ms)
   - Project card add/remove animations (200ms)
   - Panel maximize/restore (200ms ease-out)
   - Sidebar collapse/expand (200ms ease-out)
7. Implement toast notification system for non-critical feedback
8. Implement all empty states:
   - Welcome screen (no projects)
   - Browser placeholder (no URL)
   - Terminal/Claude exited states
9. Implement loading states:
   - First project activation spinners
   - Browser progress bar
   - Git status polling spinner
10. Handle edge cases with user-friendly messages (see UX Principle 5):
    - Project directory deleted while app is running
    - Claude CLI not installed
    - node-pty spawn failure
    - WebContentsView crash
    - Config file corruption
11. Implement confirmation dialog for removing projects with running processes
12. Proper app menu (About A-IDE, Quit, Preferences placeholder, etc.)
13. App icon (designed for macOS, with rounded rect mask)
14. Browser navigation button disabled states (Back dimmed when no history)
15. URL bar favicon + loading spinner
16. Resize handle grip dots on hover (⋮ and ⋯)
17. Verify all hover/active/focus states match the component spec

**Acceptance Test:** Open the app. Add 3 projects. Switch between them rapidly — transitions are smooth, no flicker. Maximize a panel and restore it — animated smoothly. Collapse sidebar and expand — animated. Remove a project with running processes — confirmation appears. All keyboard shortcuts work. Close app, reopen — window size, position, sidebar width, panel splits all restored.

### Phase 9: Packaging (Day 8)

**Goal:** Distributable macOS .dmg file.

**Tasks:**
1. Configure `electron-builder.yml` for macOS
2. Set up code signing (or skip for initial distribution)
3. Create DMG background image
4. Build: `npm run build`
5. Test on clean macOS install

**Acceptance Test:** DMG installs, app launches, all features work on a machine that didn't have the dev environment.

---

## 10. Testing Strategy

### 10.1 Manual Testing Checklist (MVP)

For each release, verify:

**First Launch & Empty States:**
- [ ] First launch shows welcome screen with "Add Project" button
- [ ] Drag & drop folder from Finder into sidebar adds project
- [ ] First project auto-switches to it (exception to no-auto-switch rule)
- [ ] Browser placeholder shows styled message when no URL configured
- [ ] Terminal/Claude exited state shows restart button with scrollback visible behind overlay
- [ ] Claude CLI not installed shows friendly error message with install command + copy button
- [ ] Claude Code auth flow works in embedded terminal (interactive, links clickable)

**Project Management:**
- [ ] Add project via "+" button
- [ ] Add project via Cmd+N
- [ ] Add project via drag & drop from Finder (drop zone indicator appears)
- [ ] Remove project via right-click → native macOS context menu appears
- [ ] Removing shows undo toast — clicking Undo restores project
- [ ] Removing project with running processes shows confirmation dialog
- [ ] Project persists after app restart
- [ ] Last active project is restored on app restart
- [ ] Adding a second+ project does NOT auto-switch (stays on current project)
- [ ] Toast notification appears when project is added/removed

**Terminal:**
- [ ] Shell starts in correct directory
- [ ] oh-my-zsh / starship themes render correctly
- [ ] Copy/paste works (Cmd+C/V)
- [ ] Resize doesn't break rendering
- [ ] Long-running process survives project switch
- [ ] Panel header shows "▸ Terminal" with focus indicator when focused
- [ ] Font size changes with Cmd++/Cmd+-/Cmd+0

**Claude Code:**
- [ ] `claude` starts and is interactive
- [ ] Colored output renders correctly
- [ ] Cmd+Shift+R restarts session
- [ ] Claude process survives project switch
- [ ] Panel header shows "⚡ Claude Code" with focus indicator when focused
- [ ] Font size changes sync with terminal

**Browser:**
- [ ] URL bar navigates to entered URL, Escape reverts and blurs
- [ ] URL bar auto-selects all text on focus
- [ ] Typing `localhost:3000` auto-prepends `http://`
- [ ] Back/Forward buttons are dimmed when no history
- [ ] Loading progress bar appears during page load
- [ ] Favicon shows in URL bar when page is loaded
- [ ] Loading spinner replaces favicon during load
- [ ] DevTools open and button shows active state
- [ ] State preserved across project switches
- [ ] Browser URL restored on app restart
- [ ] Hidden when `browser: false` in project config — layout adjusts smoothly
- [ ] Right-click shows standard Chromium context menu

**Project Switching:**
- [ ] Switch between 3+ projects rapidly — no crashes, only last-clicked is active
- [ ] Terminal scrollback preserved
- [ ] Claude conversation preserved
- [ ] Browser URL and scroll preserved
- [ ] Smooth crossfade transition, no flicker or white flash
- [ ] First activation shows loading state, then content fades in
- [ ] Switch takes <100ms (perceived, after first activation)
- [ ] Focus persists: if Terminal was focused before switch, Terminal is focused after

**Git:**
- [ ] Branch name shows correctly
- [ ] Status updates after `git add` / `git commit`
- [ ] Non-git directories show project name without git info (no error)
- [ ] Deleted project folder shows ⚠ icon in sidebar

**Layout & Resize:**
- [ ] Vertical drag handle resizes left column vs browser smoothly
- [ ] Horizontal drag handle resizes Claude Code vs Terminal smoothly
- [ ] Drag handles have generous hit target (16px, not just 6px visual)
- [ ] Drag handles show grip dots and blue highlight on hover
- [ ] Double-click handle resets to 50/50
- [ ] Panel sizes persist after app restart
- [ ] Option+F maximizes panel with animation, second press restores
- [ ] Sidebar resizes smoothly, Cmd+B collapses/expands with animation
- [ ] Sidebar collapsed state persists after restart
- [ ] WebContentsView doesn't obscure resize handles or toasts during interaction
- [ ] Browser panel uses placeholder during vertical resize, then snaps back

**Window & macOS Integration:**
- [ ] Native traffic lights in top-left (close, minimize, fullscreen)
- [ ] Closing window (red traffic light) hides the app — does NOT quit
- [ ] App stays in Dock after closing window, clicking Dock icon shows window again instantly
- [ ] Cmd+Q actually quits the app (kills PTYs, saves state, exits)
- [ ] Window size and position restored on restart
- [ ] Window restored on correct display (handles disconnected monitors)
- [ ] Native fullscreen works (green traffic light)
- [ ] Minimum window size enforced (900x600)
- [ ] No white flash on app startup

**Keyboard Shortcuts:**
- [ ] Cmd+1-9 switches projects
- [ ] Cmd+↑/↓ navigates projects
- [ ] Option+1/2/3 focuses panels with visual indicator
- [ ] Option+F maximizes/restores with animation
- [ ] Cmd+B toggles sidebar
- [ ] Cmd+Option+I toggles DevTools
- [ ] Cmd+Shift+R restarts Claude Code
- [ ] Cmd+N adds new project
- [ ] Cmd++/Cmd+-/Cmd+0 change font size
- [ ] Cmd+/ shows keyboard shortcut overlay, Escape dismisses

### 10.2 Automated Tests (Post-MVP)

- Unit tests for `ConfigManager`, `SessionManager` with Vitest
- Integration tests for IPC handlers with Electron test utilities
- E2E tests with Playwright for Electron

---

## Appendix A: Project Config Examples

### Web App (React/Vite)
```json
{
  "name": "My React App",
  "browserUrl": "http://localhost:5173",
  "startCommand": "npm run dev",
  "port": 5173
}
```

### API Server (Express/Fastify)
```json
{
  "name": "User API",
  "browser": false,
  "startCommand": "npm run dev",
  "env": {
    "DATABASE_URL": "postgres://localhost:5432/mydb"
  }
}
```

### CLI Tool
```json
{
  "name": "My CLI Tool",
  "browser": false
}
```

### Full Stack (Next.js)
```json
{
  "name": "My Next App",
  "browserUrl": "http://localhost:3000",
  "startCommand": "npm run dev",
  "port": 3000,
  "env": {
    "NODE_ENV": "development"
  }
}
```

---

## Appendix B: Claude Code Usage Notes

When Claude Code implements this PRD:

1. **Start with Phase 1** and verify it works before moving on. Each phase builds on the previous.
2. **Use electron-vite** (https://electron-vite.org/) as the build tool — it has the best DX for Electron + Vite + React. It handles main/preload/renderer builds, native module compilation, and HMR out of the box. Use `npm create @quick-start/electron@latest` to scaffold.
3. **Target Electron 40+** — the latest stable as of Feb 2026. Electron 33 is EOL. Electron 40 ships with Chromium 144 and Node 24. All `@electron/` npm packages now require Node 22+ and ship as ESM.
4. **Tailwind CSS v4 — CSS-first config** — NO `tailwind.config.ts` file. Use `@tailwindcss/vite` plugin and `@import "tailwindcss"` in CSS. Customize via `@theme { }` blocks in CSS. Zero-config content detection through Vite's module graph.
5. **React 19.2 `<Activity>` for project switching** — Use `<Activity mode="visible" | "hidden">` to wrap each project's terminal panels. This replaces manual `display: none` toggling, automatically manages effect lifecycle (cleanup on hide, re-mount on show), preserves DOM and state, and deprioritizes hidden content. This is the single biggest UX win for instant project switching.
6. **node-pty requires native compilation** — run `npx @electron/rebuild` (NOT the old `electron-rebuild` package) after installing dependencies. This rebuilds node-pty against Electron's Node 24. electron-vite handles this automatically if configured.
7. **Use WebContentsView, NOT BrowserView** — BrowserView was deprecated in Electron 30. Use `new WebContentsView()` and manage it via `mainWindow.contentView.addChildView(view)` / `removeChildView(view)`. CRITICAL: `view.webContents` is NOT auto-destroyed on window close — explicitly call `view.webContents.close()` in cleanup to prevent memory leaks.
8. **WebContentsView positioning** — bounds are relative to the window's content area. Use `mainWindow.getContentBounds()` to calculate offsets. Recalculate on every window resize event AND on `will-resize` for smoother updates.
9. **WebContentsView LAYERING is critical** — WebContentsView renders ABOVE the React DOM. Read Section 4.3 carefully. Toasts must be positioned in the left column area, not overlapping the browser. During resize, use the placeholder technique from Section 4.4.
10. **xterm.js setup:**
    - Use `@xterm/xterm` (NOT old `xterm` package) with `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-webgl`
    - Load WebGL addon with `onContextLoss` fallback to DOM renderer
    - `FitAddon.fit()` must ONLY be called on visible terminals — `<Activity>` handles this by unmounting effects when hidden
    - Use `ResizeObserver` on the terminal container, not `window.resize`
    - In `useEffect` (re-mounts when Activity becomes visible): wait one frame → `fit()` → `refresh(0, rows-1)` → send resize IPC
11. **Keyboard shortcuts: DO NOT use `globalShortcut`** — it captures keys even when the app is out of focus. Use Menu accelerators for standard shortcuts and `webContents.on('before-input-event')` to intercept Cmd+shortcuts before xterm.js swallows them. Also register `before-input-event` on each WebContentsView's webContents for when the browser panel is focused.
12. **PTY output batching** — don't send every `pty.onData` event individually via IPC. Buffer output and send in 16ms batches to prevent IPC flooding and UI jank during fast output (build logs, etc.).
13. **macOS window close vs quit** — closing the window (red traffic light) should `win.hide()`, NOT quit. The app stays in the Dock and reopens instantly. Only Cmd+Q (via `app.on('before-quit')`) actually quits. This is standard macOS behavior for productivity apps.
14. **Test with real projects** — don't just test with empty directories. Use projects that have oh-my-zsh themes, running dev servers, and actual Claude Code sessions.
15. **Memory management** — with 10 projects, there will be 20 PTY processes and 10 WebContentsViews. Monitor with Activity Monitor. If memory exceeds 2GB, implement hibernation for inactive sessions.
16. **UX quality is the top priority** — every empty state, error state, hover state, and transition in this PRD is deliberate. Do not skip them or leave them for "later". They ARE the product. If a panel has no content, it must show a designed empty state — never a blank dark rectangle.
17. **Test the crossfade on project switch** — `<Activity>` may re-mount xterm.js effects that need a frame to settle. Call `terminal.refresh(0, terminal.rows - 1)` in the `useEffect`. If crossfade causes flicker, use instant swap instead (no animation is better than broken animation).

---

*This PRD was generated for the A-IDE project. Version 4.1 (Consistency review), February 2026.*
