import { useState } from 'react'
import { actionSteps, diagnoses, sentences } from '../../store/lab-writeups.js'

const end = (s) => {
  const t = String(s ?? '').trim()
  return !t ? '' : /[.!?]$/.test(t) ? t : `${t}.`
}
const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s)

// A "Tell me about a time" outline in STAR form, from the lab and the learner's own write-up. It is marked as practice
// from a lab on purpose: it never claims a real job. The learner says "in a practice lab I..." or swaps in a real case.
export function starOutline(lab, writeup = {}) {
  const fixes = actionSteps(lab).map((s) => lower(s.title))
  const cause = writeup.rootCause?.trim() || diagnoses(lab).map(lower).join(', ')
  // the scenario without its clock time, and the why without notes on how the lab differs from the platform
  const situation = sentences(lab.scenario).filter((s) => !/^It is \d/.test(s)).slice(0, 3).join(' ')
  const why = sentences(lab.why).slice(0, 2).join(' ')
  return [
    ['Situation', `In a practice lab on a simulated Anypoint Platform, I worked this incident. ${end(situation)}`],
    ['Task', `I had to find the cause from the symptoms and bring the service back${writeup.impact?.trim() ? `. The impact: ${end(writeup.impact.trim())}` : '.'}`],
    [
      'Action',
      [
        cause ? `I found the cause: ${end(cause)}` : 'I read the logs and the alerts to find the cause.',
        writeup.fix?.trim() ? `Then I fixed it: ${end(writeup.fix.trim())}` : fixes.length ? `Then I worked through the fix: ${fixes.slice(0, 4).join(', then ')}.` : end(lab.solution),
      ].join(' '),
    ],
    ['Result', `The lab checks passed, so the fix held. ${writeup.prevention?.trim() ? `To stop it coming back: ${end(writeup.prevention.trim())}` : end(why)}`],
  ]
}

export default function StarOutline({ lab, writeup }) {
  const rows = starOutline(lab, writeup)
  const [copied, setCopied] = useState('')
  const text = ['Practice lab answer. Say "In a practice lab I..." or adapt it to a real case of your own.', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Copied.')
    } catch {
      setCopied('Copy is blocked here. Select the text and copy it.')
    }
  }
  return (
    <div className="lab-star">
      <div className="lab-panel-head">
        <h3>Tell me about a time</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
          Copy the outline
        </button>
      </div>
      <p className="lab-star-note small">
        <b>Practice from a lab.</b> This is not a real job. Say "in a practice lab I..." or use it as a frame for a real case of your own. It fills in from your write-up as you type.
      </p>
      <dl className="lab-star-rows small">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <span className="muted small" role="status">
        {copied}
      </span>
    </div>
  )
}
