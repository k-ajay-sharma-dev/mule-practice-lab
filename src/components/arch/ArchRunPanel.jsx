import { useMemo } from 'react'
import { asList, incidentText, n1, pct, trafficText } from '../../arch/run-text.js'
import { runArchTest } from '../../arch/tests.js'

// The Run tab of an architecture problem: sends each test's traffic through the learner's diagram, with the incidents
// the test plays, and shows what the users saw, how busy each box was, and what the queues held.

// What each box did in a run, for the boxes on the canvas.
export function runOverlay(result) {
  if (!result) return null
  const out = {}
  for (const [id, n] of Object.entries(result.nodes)) {
    const q = result.queues[id]
    if (n.down) out[id] = { text: 'down in this run', level: 'bad' }
    else if (q && (q.peak > 0 || q.dlq > 0 || q.lost > 0)) {
      const extra = q.lost ? `, ${n1(q.lost)} lost` : q.dlq ? `, ${n1(q.dlq)} to DLQ` : ''
      out[id] = { text: `up to ${n1(q.peak)} waiting${extra}`, level: q.lost ? 'bad' : q.end > 0 ? 'warn' : 'ok' }
    } else if (n.peakRps > 0) {
      const util = n.peakUtil ? ` · ${Math.round(n.peakUtil * 100)}% busy` : ''
      out[id] = { text: `${n1(n.peakRps)}/s${util}`, level: n.peakUtil > 1 ? 'bad' : n.peakUtil > 0.7 ? 'warn' : 'ok' }
    }
  }
  return out
}

export default function ArchRunPanel({ diagram, simulation, picked, onPick }) {
  const tests = simulation?.tests ?? []
  const outcomes = useMemo(() => tests.map((t) => runArchTest(diagram, simulation, t)), [diagram, simulation, tests])
  if (!tests.length) return <p className="muted">This problem has no test runs yet. Its diagram is checked against the requirements only.</p>

  const test = tests[picked] ?? tests[0]
  const { result, lines } = outcomes[picked] ?? outcomes[0]
  const passed = outcomes.filter((o) => o.pass).length
  const busy = Object.entries(result.nodes)
    .filter(([id, n]) => n.peakRps > 0 && !result.queues[id])
    .sort((a, b) => b[1].peakUtil - a[1].peakUtil || b[1].peakRps - a[1].peakRps)
  const queues = Object.values(result.queues).filter((q) => q.peak > 0 || q.delivered > 0 || q.dlq > 0 || q.lost > 0)

  return (
    <div className="run-panel arch-run">
      <p className="muted small">
        Each test sends traffic through your diagram for a few minutes, and plays the incidents it names. The settings on each box (select a box, then Settings) decide how much it can carry and what it does when a call fails. The boxes on the canvas show how busy they were.
      </p>
      <div className={`match-banner ${passed === tests.length ? 'pass' : 'fail'}`}>
        {passed} / {tests.length} test runs pass
      </div>
      <ul className="sim-tests">
        {tests.map((t, i) => (
          <li key={i}>
            <button className={`sim-test ${i === picked ? 'active' : ''} ${outcomes[i].pass ? 'pass' : 'fail'}`} onClick={() => onPick(i)}>
              <span className="mark">{outcomes[i].pass ? '✓' : '✗'}</span>
              <span>{t.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sim-trigger">
        <div className="section-title">What this test does</div>
        {test.about && <p className="small">{test.about}</p>}
        <ul className="arch-run-list small">
          {asList(test.traffic).map((t, i) => (
            <li key={`t${i}`}>{trafficText(t)}</li>
          ))}
          {asList(test.incidents).map((inc, i) => (
            <li key={`i${i}`} className="warn-text">
              {incidentText(inc)}
            </li>
          ))}
          <li className="muted">The run lasts {result.duration} minutes.</li>
        </ul>
      </div>

      <ul className="check-list">
        {lines.map((l, i) => (
          <li key={i} className={l.ok ? 'pass' : 'fail'}>
            <span className="mark">{l.ok ? '✓' : '✗'}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
      {result.notes.map((n, i) => (
        <p key={i} className="sim-limit">
          {n}
        </p>
      ))}

      <div className="section-title">What the users saw</div>
      <div className="arch-run-table">
        <table>
          <thead>
            <tr>
              <th>Traffic</th>
              <th>Requests</th>
              <th>Answered</th>
              <th>Refused</th>
              <th>429</th>
              <th>Failed</th>
              <th>Partial</th>
              <th>Avg time</th>
            </tr>
          </thead>
          <tbody>
            {result.flows.map((f) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>{Math.round(f.offered)}</td>
                <td className={f.success < 0.99 ? 'bad' : 'good'}>{pct(f.success)}</td>
                <td>{pct(f.refused)}</td>
                <td>{pct(f.limited)}</td>
                <td className={f.failed > 0.001 ? 'bad' : ''}>{pct(f.failed)}</td>
                <td>{pct(f.degraded)}</td>
                <td>{f.avgMs == null ? 'none' : `${Math.round(f.avgMs)} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.flows.some((f) => f.reasons.length) && (
        <ul className="arch-run-list small">
          {result.flows.flatMap((f) =>
            f.reasons.map((r) => (
              <li key={`${f.name}${r.text}`}>
                <b>{f.name}</b>: {pct(r.share)} {r.text}
              </li>
            )),
          )}
        </ul>
      )}

      <div className="section-title">How busy each box was</div>
      {busy.length ? (
        <div className="arch-run-table">
          <table>
            <thead>
              <tr>
                <th>Box</th>
                <th>Busiest minute</th>
                <th>Average</th>
                <th>Busy</th>
              </tr>
            </thead>
            <tbody>
              {busy.map(([id, n]) => (
                <tr key={id}>
                  <td>
                    {n.label}
                    {n.down && <span className="warn-text"> (down)</span>}
                  </td>
                  <td>{n1(n.peakRps)}/s</td>
                  <td>{n1(n.avgRps)}/s</td>
                  <td className={n.peakUtil > 1 ? 'bad' : n.peakUtil > 0.7 ? 'warn' : ''}>{n.peakUtil ? `${Math.round(n.peakUtil * 100)}%` : 'no limit'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">No requests reached any box.</p>
      )}

      {queues.length > 0 && (
        <>
          <div className="section-title">Queues and topics</div>
          <div className="arch-run-table">
            <table>
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Delivered</th>
                  <th>Most waiting</th>
                  <th>At the end</th>
                  <th>To DLQ</th>
                  <th>Lost</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.label}>
                    <td>{q.label}</td>
                    <td>{Math.round(q.delivered)}</td>
                    <td>{Math.round(q.peak)}</td>
                    <td className={q.end > 0 ? 'warn' : ''}>{Math.round(q.end)}</td>
                    <td>{Math.round(q.dlq)}</td>
                    <td className={q.lost > 0 ? 'bad' : ''}>{Math.round(q.lost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="muted small">The APIs in this design use {n1(result.vCores)} vCores.</p>
    </div>
  )
}
