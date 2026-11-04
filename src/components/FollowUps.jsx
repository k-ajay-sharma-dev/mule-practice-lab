import Markdown from './Markdown.jsx'

// Likely interviewer follow-up questions. Answers stay folded so you can try first.
export default function FollowUps({ items }) {
  if (!items?.length) return null
  return (
    <div className="followups">
      <div className="section-title">Interview follow-ups</div>
      <p className="muted small">What an interviewer would likely ask next. Answer out loud, then open to compare.</p>
      {items.map((f, i) => (
        <details key={i} className="followup">
          <summary>{f.q}</summary>
          <Markdown>{f.a}</Markdown>
        </details>
      ))}
    </div>
  )
}
