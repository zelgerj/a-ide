import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'

interface MarkdownPreviewProps {
  content: string
}

// Lazy-load mermaid only when needed
let mermaidPromise: Promise<typeof import('mermaid')> | null = null

function getMermaid(): Promise<typeof import('mermaid')> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          darkMode: true,
          background: '#1e1e1e',
          primaryColor: '#007acc',
          primaryTextColor: '#cccccc',
          lineColor: '#3c3c3c'
        }
      })
      return mod
    })
  }
  return mermaidPromise
}

function MermaidBlock({ code }: { code: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`

    getMermaid()
      .then(async (mod) => {
        if (cancelled) return
        try {
          const { svg: renderedSvg } = await mod.default.render(id, code)
          if (!cancelled) setSvg(renderedSvg)
        } catch (err) {
          if (!cancelled) setError((err as Error).message || 'Failed to render diagram')
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div className="p-3 bg-bg-tertiary rounded text-accent-red text-xs">
        Mermaid error: {error}
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="p-3 bg-bg-tertiary rounded text-text-secondary text-xs">
        Rendering diagram...
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="p-3 bg-bg-tertiary rounded overflow-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const lang = match ? match[1] : ''
    const codeStr = String(children).replace(/\n$/, '')

    // Detect inline code (no language class and short)
    const isInline = !className && !codeStr.includes('\n')

    if (isInline) {
      return (
        <code className="bg-bg-tertiary px-1 py-0.5 rounded text-accent-green text-[0.9em]" {...props}>
          {children}
        </code>
      )
    }

    // Mermaid diagrams
    if (lang === 'mermaid') {
      return <MermaidBlock code={codeStr} />
    }

    // Regular code blocks — rehype-highlight handles syntax highlighting
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },

  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        className="text-accent-blue hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    )
  },

  table({ children, ...props }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="border-collapse w-full text-sm" {...props}>
          {children}
        </table>
      </div>
    )
  },

  th({ children, ...props }) {
    return (
      <th className="border border-border-primary px-3 py-1.5 bg-bg-tertiary text-left text-text-bright font-semibold" {...props}>
        {children}
      </th>
    )
  },

  td({ children, ...props }) {
    return (
      <td className="border border-border-primary px-3 py-1.5" {...props}>
        {children}
      </td>
    )
  },

  img({ src, alt, ...props }) {
    return (
      <img
        src={src}
        alt={alt || ''}
        className="max-w-full h-auto rounded"
        {...props}
      />
    )
  }
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps): JSX.Element {
  return (
    <div className="h-full overflow-auto px-6 py-4 markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
