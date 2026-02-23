import { useMemo } from 'react'
import hljs from 'highlight.js/lib/core'

// Register commonly used languages
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import shell from 'highlight.js/lib/languages/shell'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import ruby from 'highlight.js/lib/languages/ruby'
import swift from 'highlight.js/lib/languages/swift'
import kotlin from 'highlight.js/lib/languages/kotlin'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('svg', xml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('toml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('java', java)
hljs.registerLanguage('c', cpp)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)

interface CodePreviewProps {
  content: string
  language: string
}

export default function CodePreview({ content, language }: CodePreviewProps): JSX.Element {
  const highlighted = useMemo(() => {
    try {
      if (hljs.getLanguage(language)) {
        return hljs.highlight(content, { language }).value
      }
      return hljs.highlightAuto(content).value
    } catch {
      return escapeHtml(content)
    }
  }, [content, language])

  const lineCount = content.split('\n').length

  return (
    <div className="h-full overflow-auto font-mono text-[12px] leading-[18px]">
      <table className="border-collapse w-full">
        <tbody>
          {content.split('\n').map((_, i) => (
            <tr key={i} className="hover:bg-bg-hover/30">
              <td className="text-right pr-3 pl-3 select-none text-text-secondary/50 w-[1%] whitespace-nowrap align-top">
                {i + 1}
              </td>
              <td
                className="pr-4 whitespace-pre text-text-primary"
                dangerouslySetInnerHTML={{
                  __html: getHighlightedLine(highlighted, i, lineCount)
                }}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function getHighlightedLine(fullHtml: string, lineIndex: number, _total: number): string {
  // Split highlighted HTML by newlines (highlight.js preserves line structure)
  const lines = fullHtml.split('\n')
  return lines[lineIndex] ?? ''
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
