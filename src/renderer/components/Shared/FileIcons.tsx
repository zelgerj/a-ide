import {
  File,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Braces,
  Image,
  Settings,
  Globe,
  Package,
  ChevronRight,
  ChevronDown
} from 'lucide-react'
import type { JSX } from 'react'

const ICON_SIZE = 15
const ICON_STROKE = 1.5
const CHEVRON_SIZE = 12
const FOLDER_COLOR = '#c4a46c'

const EXT_ICON_MAP: Record<string, typeof File> = {
  '.ts': FileCode,
  '.tsx': FileCode,
  '.js': FileCode,
  '.jsx': FileCode,
  '.py': FileCode,
  '.rb': FileCode,
  '.go': FileCode,
  '.rs': FileCode,
  '.java': FileCode,
  '.c': FileCode,
  '.cpp': FileCode,
  '.h': FileCode,
  '.swift': FileCode,
  '.kt': FileCode,
  '.vue': FileCode,
  '.svelte': FileCode,
  '.sh': FileCode,
  '.bash': FileCode,
  '.zsh': FileCode,
  '.json': Braces,
  '.md': FileText,
  '.mdx': FileText,
  '.txt': FileText,
  '.png': Image,
  '.jpg': Image,
  '.jpeg': Image,
  '.gif': Image,
  '.webp': Image,
  '.svg': Image,
  '.ico': Image,
  '.yml': Settings,
  '.yaml': Settings,
  '.toml': Settings,
  '.ini': Settings,
  '.env': Settings,
  '.html': Globe,
  '.css': Globe,
  '.scss': Globe
}

const NAME_ICON_MAP: Record<string, typeof File> = {
  'package.json': Package,
  'package-lock.json': Package,
  'Cargo.toml': Package,
  'Cargo.lock': Package,
  'go.mod': Package,
  'go.sum': Package,
  'Gemfile': Package,
  'Gemfile.lock': Package,
  'requirements.txt': Package,
  'pyproject.toml': Package,
  'pom.xml': Package
}

export function getFileIcon(name: string, isDirectory: boolean, isOpen: boolean): JSX.Element {
  if (isDirectory) {
    const Icon = isOpen ? FolderOpen : Folder
    return <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} color={FOLDER_COLOR} />
  }

  // Check exact name first (package.json, Cargo.toml, etc.)
  const NameIcon = NAME_ICON_MAP[name]
  if (NameIcon) {
    return <NameIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
  }

  // Check extension
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : ''
  const ExtIcon = EXT_ICON_MAP[ext] || File
  return <ExtIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
}

export function getChevronIcon(isOpen: boolean): JSX.Element {
  const Icon = isOpen ? ChevronDown : ChevronRight
  return <Icon size={CHEVRON_SIZE} strokeWidth={ICON_STROKE} />
}
