# A-IDE

A project-centric macOS developer workspace combining AI agent terminals, a shell terminal, and an embedded browser — with instant project switching that preserves your entire workspace state.

## Features

### Multi-Agent Terminal

Run Claude Code, Codex, Gemini, or OpenCode directly in your workspace. A-IDE auto-detects installed agent CLIs and shows them as switchable tabs. Each agent session is remembered per project and resumes automatically (`--continue`) on next launch.

### Shell Terminal

Full zsh/bash terminal powered by node-pty. Drag files from Finder to paste shell-escaped paths. Supports an optional start command per project (e.g. `npm run dev`) that runs automatically on project load.

### Embedded Browser

Native Chromium browser rendered via Electron's WebContentsView. Preview localhost or any URL alongside your terminals, toggle DevTools in a detached window, and navigate with back/forward/reload controls. Includes a Chrome DevTools Protocol (CDP) proxy for Playwright MCP integration — agent tools can interact with the browser programmatically.

### Instant Project Switching

Switch between projects with one click (or Cmd+1–9). Terminal sessions, browser state, scroll positions, and agent tabs are fully preserved using React 19 Activity boundaries. No reload, no lost state.

### Git Integration

Live git status per project with 5-second polling: branch name, ahead/behind counts, modified/staged/untracked file counts. Displayed on project cards, title bar, and status bar.

### Per-Project Configuration

Drop an `.a-ide.json` in your project root to configure:

```json
{
  "browserUrl": "http://localhost:3000",
  "startCommand": "npm run dev",
  "claudeArgs": "--model opus"
}
```

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+1–9 | Switch to project by index |
| Opt+1 / Opt+2 / Opt+3 | Focus Agent / Terminal / Browser panel |
| Opt+F | Maximize focused panel |
| Cmd+B | Toggle sidebar |
| Cmd+Shift+R | Restart active agent session |
| Cmd+O | Open folder dialog |
| Ctrl+Tab / Ctrl+Shift+Tab | Cycle agent tabs |

All shortcuts work even when the embedded browser is focused.

### Resizable Layout

Three-panel layout with draggable splitters: agent terminal and shell terminal stacked on the left, browser on the right. Split ratios persist across sessions.

## Requirements

- macOS 12 or later (Apple Silicon)
- Node.js >= 22
- At least one agent CLI installed: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Codex, Gemini CLI, or OpenCode
- Git

## Installation

### Download

Grab the latest `.dmg` from [Releases](https://github.com/zelgerj/a-ide/releases/latest). Open the DMG, drag A-IDE to Applications, then right-click the app and choose **Open** (required on first launch for unsigned apps).

### Build from Source

```bash
git clone https://github.com/zelgerj/a-ide.git
cd a-ide
npm ci
npm run dev
```

## Development

```bash
npm run dev          # Start dev server (Electron + Vite HMR)
npm run build        # Production build
npm run start        # Preview production build
npm run build:mac    # Build + package macOS DMG (arm64)
```

### App Icon

To regenerate the app icon from a 1024x1024 source PNG:

```bash
./scripts/generate-icon.sh path/to/icon.png
```

Without arguments, it generates a placeholder icon.

## Architecture

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # BrowserWindow, menu, keyboard shortcuts, lifecycle
│   ├── services/          # TerminalManager, SessionManager, BrowserManager,
│   │                      # BrowserCDPProxy, GitWatcher, ConfigManager, ProcessManager
│   └── ipc/               # IPC handlers (terminal, project, session, browser, git, config)
├── preload/               # contextBridge with channel allowlist
└── renderer/              # React 19 + Zustand + Tailwind CSS 4
    ├── components/
    │   ├── Panels/        # AgentPanel, TerminalPanel, BrowserPanel
    │   ├── Sidebar/       # ProjectCard, WelcomeScreen
    │   └── Layout/        # PanelLayout, ResizeHandle
    ├── hooks/             # useTerminal, useProjectSwitch, useGitStatus, useKeyboardShortcuts
    └── stores/            # Zustand store (projects, agents, layout, git)
```

**Key design decisions:**

- **Terminal two-layer pattern** — xterm.js instances persist in a module-level registry (survives React Activity transitions), while WebGL/FitAddon are transient effects re-created on show/hide to stay within the ~16 WebGL context limit.
- **PTY in callback ref** — Terminal creation and IPC listeners are set up in a React 19 callback ref (not useEffect) to prevent data loss race conditions.
- **WebContentsView** — Browser renders above the React DOM via Electron's native view API. Bounds synced via ResizeObserver.
- **CDP proxy** — Filters Chrome DevTools Protocol connections per-project so Playwright MCP tools only see their project's browser.

## Tech Stack

Electron 35, React 19, TypeScript 5.8, Tailwind CSS 4, Zustand 5, xterm.js 5.5, node-pty 1.0, simple-git, electron-vite 3, Vite 6.

## License

MIT
