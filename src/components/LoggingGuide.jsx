import { GUIDE } from '../logging/guide.js'
import Markdown from './Markdown.jsx'

// The rules for good log lines, folded at the top of the Logging Lab section.
export default function LoggingGuide() {
  return (
    <details className="logging-guide">
      <summary>The rules for good log lines (read this first)</summary>
      <Markdown>{GUIDE}</Markdown>
    </details>
  )
}
