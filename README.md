# A-IDE

A project-centric macOS developer workspace combining Claude Code terminal, shell terminal, and embedded browser with instant project switching.

## Features

- **Claude Code Terminal** — run the Claude Code CLI directly in your workspace
- **Shell Terminal** — full zsh/bash with drag-and-drop file path support from Finder
- **Embedded Browser** — preview localhost and any URL with DevTools, rendered natively via Chromium
- **Instant Project Switching** — switch projects in one click with full state preservation across all panels

## Requirements

- macOS 12 or later (Apple Silicon)
- Node.js >= 22
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
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
npm run build:mac    # Build + package macOS DMG
```

## Tech Stack

Electron 35, React 19, TypeScript 5.8, Tailwind CSS 4, Zustand 5, xterm.js 5.5, node-pty, simple-git.

## License

MIT
