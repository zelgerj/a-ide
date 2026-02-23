import { contextBridge, ipcRenderer, webUtils } from 'electron'

const ALLOWED_INVOKE = [
  'project:add',
  'project:remove',
  'project:list',
  'project:get-config',
  'project:reorder',
  'session:switch',
  'session:get-active',
  'terminal:create',
  'terminal:input',
  'terminal:resize',
  'terminal:restart',
  'terminal:kill',
  'browser:navigate',
  'browser:go-back',
  'browser:go-forward',
  'browser:reload',
  'browser:toggle-devtools',
  'browser:set-bounds',
  'browser:hide-all',
  'browser:hide-except',
  'git:get-status',
  'git:get-changed-files',
  'git:get-file-diff',
  'config:get-settings',
  'config:update-settings',
  'app:open-folder-dialog',
  'agents:detect',
  'filesystem:read-dir',
  'filesystem:read-file'
] as const

const ALLOWED_EVENTS = [
  'terminal:data',
  'terminal:exit',
  'session:switched',
  'git:status-updated',
  'git:changed-files-updated',
  'browser:url-changed',
  'browser:title-changed',
  'browser:loading-changed',
  'browser:favicon-changed',
  'shortcut:project-switch',
  'shortcut:panel-focus',
  'shortcut:toggle-sidebar',
  'shortcut:toggle-maximize',
  'shortcut:restart-claude',
  'shortcut:open-folder',
  'shortcut:cycle-agent',
  'shortcut:toggle-file-tree',
  'filesystem:files-changed'
] as const

type InvokeChannel = (typeof ALLOWED_INVOKE)[number]
type EventChannel = (typeof ALLOWED_EVENTS)[number]

const invokeSet = new Set<string>(ALLOWED_INVOKE)
const eventSet = new Set<string>(ALLOWED_EVENTS)

const api = {
  getPathForFile: (file: File): string => {
    return webUtils.getPathForFile(file)
  },

  invoke: (channel: InvokeChannel, ...args: unknown[]): Promise<unknown> => {
    if (!invokeSet.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  send: (channel: string, ...args: unknown[]): void => {
    // Allow terminal:input as fire-and-forget for high-frequency data
    if (channel === 'terminal:input') {
      ipcRenderer.send(channel, ...args)
    }
  },

  on: (channel: EventChannel, callback: (...args: unknown[]) => void): (() => void) => {
    if (!eventSet.has(channel)) {
      console.warn(`IPC event channel not allowed: ${channel}`)
      return () => {}
    }
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      callback(...args)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
