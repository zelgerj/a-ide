import { registerTerminalIpc } from './terminal'
import { registerProjectIpc } from './project'
import { registerConfigIpc } from './config'
import { registerSessionIpc } from './session'
import { registerBrowserIpc } from './browser'
import { registerGitIpc } from './git'

export function registerAllIpc(): void {
  registerTerminalIpc()
  registerProjectIpc()
  registerConfigIpc()
  registerSessionIpc()
  registerBrowserIpc()
  registerGitIpc()
}
