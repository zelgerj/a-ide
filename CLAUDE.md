# A-IDE

macOS Electron app — project-centric developer workspace combining Claude Code (terminal), a shell terminal, and an embedded browser with instant project switching.

## Tech Stack

- **Runtime:** Electron 35 + Node.js
- **Build:** electron-vite 3 + Vite 6
- **Frontend:** React 19 + TypeScript 5.8
- **Styling:** Tailwind CSS 4 (CSS-first config, no tailwind.config.ts)
- **State:** Zustand 5
- **Terminal:** xterm.js 5.5 + node-pty 1.0
- **Browser:** WebContentsView (Electron native)
- **Git:** simple-git 3.27

## Commands

```bash
npm run dev          # Start dev server (Electron + Vite HMR)
npm run build        # Production build
npm run build:mac    # Build + package macOS DMG
npm run start        # Preview production build
```

## Project Structure

```
src/
├── main/                          # Electron main process
│   ├── index.ts                   # BrowserWindow, menu, keyboard shortcuts, lifecycle
│   ├── utils/paths.ts             # ~/.a-ide/ config directory
│   ├── services/
│   │   ├── ConfigManager.ts       # Window state, project persistence
│   │   ├── TerminalManager.ts     # node-pty spawn, 5ms output batching
│   │   ├── SessionManager.ts      # Per-project session lifecycle
│   │   ├── ProcessManager.ts      # Graceful shutdown orchestration
│   │   ├── BrowserManager.ts      # WebContentsView create/show/hide/destroy
│   │   └── GitWatcher.ts          # 5s polling with change detection
│   └── ipc/                       # IPC handlers (terminal, project, config, session, browser, git)
├── preload/
│   └── index.ts                   # contextBridge with channel allowlist + webUtils
└── renderer/
    ├── App.tsx                    # Root: sidebar + Activity boundaries + panels
    ├── stores/appStore.ts         # Zustand store
    ├── styles/globals.css         # Tailwind v4 theme + xterm CSS
    ├── hooks/
    │   ├── useTerminal.ts         # Two-layer xterm.js lifecycle (see below)
    │   ├── useProjectSwitch.ts    # Session switch + terminal exit listeners
    │   ├── useGitStatus.ts        # Git status subscription
    │   └── useKeyboardShortcuts.ts
    └── components/
        ├── Layout/                # PanelLayout (two-axis split), ResizeHandle
        ├── Panels/                # ClaudeCodePanel, TerminalPanel, BrowserPanel, etc.
        ├── Sidebar/               # Sidebar, ProjectCard, WelcomeScreen
        ├── StatusBar/             # StatusBar
        └── Shared/                # Toast, ConfirmDialog
```

## Architecture — Critical Patterns

### Terminal Two-Layer Pattern (`useTerminal.ts`)

The most complex piece. xterm.js terminals must survive React Activity transitions while respecting WebGL context limits.

**Layer 1 (Persistent — callback ref):** Terminal instance, IPC subscription, PTY creation, drag-drop listeners. Created once when DOM mounts. Uses React 19 ref cleanup (return function from callback ref) for disposal on actual unmount only. NOT affected by StrictMode effect double-invocation.

**Layer 2 (Transient — useEffect):** WebGL addon, FitAddon, ResizeObserver. Re-created on every Activity show/hide. Solves WebGL context limit (~16 max) since only 2 terminals are visible at a time.

**PTY creation lives in the callback ref**, not in SessionManager. This ensures the IPC data listener is set up before the PTY starts producing output (no data loss race).

### WebContentsView Lifecycle (`BrowserManager.ts`)

- Created per-project on first navigation (on-demand in `navigate()`)
- Positioned via `setBounds()` synced from renderer ResizeObserver
- Hidden (bounds 0,0,0,0) on project switch, shown on switch-to
- Renders ABOVE React DOM — toasts/overlays positioned to avoid it

### Project Switching (React 19 `<Activity>`)

- `<Activity mode="visible|hidden">` preserves DOM but tears down/re-runs effects
- SessionManager handles session lifecycle (browser, git watcher, activation flag)
- 50ms debounce prevents rapid-click issues
- Terminal instances survive transitions (Layer 1 in callback ref, not in effects)

### Keyboard Shortcuts (Three Layers)

1. `before-input-event` on BrowserWindow webContents — Cmd+1-9, Option+1-3, Cmd+B (intercepted before xterm.js)
2. Menu accelerators — Cmd+Q, Cmd+N, standard Edit/View/Window
3. xterm.js `attachCustomKeyEventHandler` — passes Cmd+key through

### PTY Output Batching (`TerminalManager.ts`)

- 5ms interval, 200KB max buffer before forced flush
- `onExit`/`onData` disposables stored and disposed in `kill()` to prevent stale events when PTY is replaced

### File Drag-and-Drop

Files dragged from Finder paste shell-escaped paths (backslash before all shell metacharacters). Uses `webUtils.getPathForFile()` via preload bridge, `terminal.paste()` for bracketed paste mode support. Multi-file supported (space-separated).

## IPC Channel Convention

- `ipcRenderer.invoke` for request/response (terminal:create, browser:navigate, etc.)
- `ipcRenderer.send` for fire-and-forget (terminal:input — high frequency)
- `ipcRenderer.on` for main→renderer events (terminal:data, terminal:exit, session:switched, etc.)
- All channels allowlisted in preload — unauthorized channels are rejected

## Common Pitfalls

- **StrictMode + refs:** StrictMode double-invokes effects but also re-invokes callback refs with cleanup (React 19). Terminal lifecycle is designed around this — don't move PTY creation or IPC subscriptions into useEffect.
- **node-pty packaging:** `asarUnpack` must include entire `node_modules/node-pty` dir (has spawn-helper binary), not just `*.node` files.
- **WebContentsView layering:** Renders above DOM. Context menus must use native `Menu.popup()`. Toasts are in the left column only.
- **Electron PATH:** Apps launched from Dock don't inherit shell PATH. `resolveLoginShellPath()` runs `zsh -ilc 'echo $PATH'` at startup.
- **Claude binary:** Resolved at startup via `resolveClaudePath()` checking common locations + PATH dirs.
