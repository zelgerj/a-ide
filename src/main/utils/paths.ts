import { app } from 'electron'
import path from 'path'
import fs from 'fs'

const CONFIG_DIR = path.join(app.getPath('home'), '.a-ide')

export const paths = {
  configDir: CONFIG_DIR,
  globalConfig: path.join(CONFIG_DIR, 'config.json'),
  projectsConfig: path.join(CONFIG_DIR, 'projects.json'),
  windowState: path.join(CONFIG_DIR, 'window-state.json')
}

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}
