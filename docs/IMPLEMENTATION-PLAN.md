# A-IDE Implementation Plan

## Status: All 9 phases implemented

## Architecture Overview

A-IDE is a macOS Electron app providing a project-centric developer workspace with three panels (Claude Code terminal, Shell terminal, Browser) and instant project switching via React 19 `<Activity>`.

### Tech Stack
- **Runtime:** Electron 35 + Node.js
- **Build:** electron-vite 3 + Vite 6
- **Frontend:** React 19.1 + TypeScript 5.8
- **Styling:** Tailwind CSS 4 (CSS-first config)
- **State:** Zustand 5
- **Terminal:** xterm.js 5.5 + node-pty 1.0
- **Browser:** WebContentsView (Electron native)
- **Git:** simple-git 3.27

## File Structure

```
src/
├── main/
│   ├── index.ts                    # BrowserWindow, menu, keyboard shortcuts, lifecycle
│   ├── utils/paths.ts              # ~/.a-ide/ config directory
│   ├── services/
│   │   ├── ConfigManager.ts        # Window state, global config, project persistence
│   │   ├── TerminalManager.ts      # node-pty spawn, 5ms output batching
│   │   ├── SessionManager.ts       # Per-project session lifecycle (freeze/thaw)
│   │   ├── ProcessManager.ts       # Graceful shutdown orchestration
│   │   ├── BrowserManager.ts       # WebContentsView create/show/hide/destroy
│   │   └── GitWatcher.ts           # 5s polling with change detection
│   └── ipc/
│       ├── index.ts                # Central IPC registration
│       ├── terminal.ts             # terminal:create/input/resize/restart/kill
│       ├── project.ts              # project:add/remove/list + folder dialog
│       ├── config.ts               # config:get-settings/update-settings
│       ├── session.ts              # session:switch/get-active
│       ├── browser.ts              # browser:navigate/back/forward/reload/devtools
│       └── git.ts                  # git:get-status
├── preload/
│   └── index.ts                    # contextBridge with channel allowlist
└── renderer/
    ├── main.tsx                    # React entry
    ├── App.tsx                     # Root: sidebar + Activity boundaries + panels
    ├── env.d.ts                    # Window.api type declaration
    ├── types/index.ts              # Shared interfaces
    ├── stores/appStore.ts          # Zustand store (projects, layout, git, exits)
    ├── styles/globals.css          # Tailwind v4 theme + xterm CSS
    ├── hooks/
    │   ├── useTerminal.ts          # Two-layer xterm.js lifecycle
    │   ├── useProjectSwitch.ts     # Session switch + terminal exit listeners
    │   ├── useGitStatus.ts         # Git status subscription
    │   └── useKeyboardShortcuts.ts # Shortcut event handlers
    └── components/
        ├── Layout/
        │   ├── PanelLayout.tsx     # Two-axis split (left panels + browser)
        │   └── ResizeHandle.tsx    # Draggable divider (1px visual, 16px hit target)
        ├── Panels/
        │   ├── PanelHeader.tsx     # Type icon + label + focus indicator
        │   ├── PanelContainer.tsx  # Panel wrapper with header
        │   ├── ClaudeCodePanel.tsx # Claude CLI terminal panel
        │   ├── TerminalPanel.tsx   # Shell terminal panel
        │   ├── BrowserPanel.tsx    # WebContentsView overlay + bounds sync
        │   ├── BrowserUrlBar.tsx   # URL input + nav buttons + DevTools toggle
        │   ├── PanelExited.tsx     # "Process exited" overlay with restart
        │   └── PanelLoading.tsx    # Loading spinner for first activation
        ├── Sidebar/
        │   ├── Sidebar.tsx         # Project list + add button
        │   ├── ProjectCard.tsx     # Name, git branch, Cmd+N badge
        │   ├── AddProjectButton.tsx
        │   └── WelcomeScreen.tsx   # Empty state CTA
        ├── StatusBar/
        │   └── StatusBar.tsx       # Project name, git info, path
        └── Shared/
            ├── Toast.tsx           # Positioned in bottom-left (avoids WebContentsView)
            └── ConfirmDialog.tsx   # Modal confirmation

```

## Key Architectural Decisions

### Terminal Two-Layer Pattern
- **Layer 1 (Persistent):** Terminal instance + IPC subscription in module-level Map, survives Activity transitions
- **Layer 2 (Transient):** WebGL addon + FitAddon + ResizeObserver in useEffect, managed by Activity lifecycle
- Solves WebGL context limit (16 max) — only 2 visible at a time

### WebContentsView Lifecycle
- Created per-project on first activation
- Positioned via `setBounds()` synced from renderer ResizeObserver
- Hidden (bounds 0,0,0,0) on project switch, shown on switch-to
- Explicitly destroyed on project removal and app quit

### Project Switching
- 50ms debounce in SessionManager prevents rapid-click issues
- First activation creates PTY processes + browser view + git watcher
- Subsequent switches only toggle visibility (Activity handles UI)
- `before-input-event` ensures Cmd+1-9 works even with terminal focused

### Keyboard Shortcuts
- **Layer 1:** `before-input-event` on main webContents — Cmd+1-9, Option+1-3, Cmd+B, Option+F, Cmd+Shift+R, Cmd+O
- **Layer 2:** Menu accelerators — Cmd+Q, standard Edit/View/Window shortcuts
- **Layer 3:** xterm.js `attachCustomKeyEventHandler` — passes Cmd+key and Alt+1-3 through

### PTY Output Batching
- 5ms interval (research-backed optimal)
- 200KB max buffer before forced flush
- Flush on PTY exit for final output

## Verification Checklist

- [x] Phase 1: Project scaffolds, builds, dev server starts
- [x] Phase 2: Layout renders with sidebar + 3-panel split + resize handles
- [x] Phase 3: xterm.js terminals with node-pty backend, batched output
- [x] Phase 4: Claude Code terminal spawns `claude` CLI
- [x] Phase 5: Activity-based project switching preserves terminal state
- [x] Phase 6: WebContentsView browser with URL bar and navigation
- [x] Phase 7: Git status polling with sidebar display
- [x] Phase 8: All keyboard shortcuts, Toast/ConfirmDialog, state persistence
- [x] Phase 9: Build configuration, entitlements, .gitignore
