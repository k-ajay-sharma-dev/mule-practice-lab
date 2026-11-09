import { cloneElement, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CopyButton from './CopyButton.jsx'
import { formatJson } from '../study/json-format.js'

// Fenced code arrives as <pre><code>text</code></pre>; inline code never goes through here.
// A block that holds JSON is laid out one entry per line.
function FencedCode({ children }) {
  const raw = String(children?.props?.children ?? '').replace(/\n$/, '')
  const text = formatJson(raw)
  const code = text !== raw && isValidElement(children) ? cloneElement(children, {}, text) : children
  return (
    <div className="copyable">
      <pre>{code}</pre>
      <CopyButton text={text} />
    </div>
  )
}

export default function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: FencedCode }}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
