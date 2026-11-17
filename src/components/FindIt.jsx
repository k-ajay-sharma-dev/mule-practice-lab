// "Find it" for one failing check: what is wrong, the components on your canvas it is about (outlined there), and
// how they differ from the same components in the reference, field by field. Only this check's parts are shown,
// so the rest of the reference stays yours to work out.
const show = (v) => {
  const s = String(v ?? '').trim()
  return s === '' ? '(empty)' : s
}

export default function FindIt({ label, info, onClose }) {
  const extraClues = info.clues.filter((c) => !info.hint.includes(c.text))
  const lines = info.lines ?? { missing: [], wrongKind: [], extra: [] }
  const nothing = !info.pairs.length && !info.extra.length && !info.unused.length && !lines.missing.length && !lines.wrongKind.length && !lines.extra.length
  return (
    <div className="find-it" role="region" aria-label={`Find it: ${label}`}>
      <div className="find-it-head">
        <b className="small">🔎 {label}</b>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="small">{info.hint}</p>
      {extraClues.map((c) => (
        <p key={c.text} className="small">
          {c.text}
        </p>
      ))}
      {info.mine.length > 0 && (
        <p className="small muted">
          Outlined on your canvas: {info.mine.map((m) => (m.flow ? `${m.label} in ${m.flow}` : m.label)).join(', ')}.
        </p>
      )}

      {info.pairs.map((p) => (
        <div key={p.id} className="find-it-pair">
          <div className="small">
            <b>{p.label}</b> {p.flow && <span className="muted">in {p.flow}</span>}
            {p.refFlow && p.refFlow !== p.flow && <span className="muted"> (the reference has it in {p.refFlow})</span>}
          </div>
          {p.place && (
            <p className="small">
              Sits inside: <span className="bad">{p.place.mine}</span>. In the reference: <span className="good">{p.place.ref}</span>.
            </p>
          )}
          {p.diffs.length > 0 && <table className="find-it-diff small">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Yours</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {p.diffs.map((d) => (
                <tr key={d.field}>
                  <td>{d.field}</td>
                  <td className="mono bad">{show(d.mine)}</td>
                  <td className="mono good">{show(d.ref)}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      ))}

      {info.extra.length > 0 && (
        <div className="find-it-pair small">
          <b>The reference has these, and your design does not:</b>
          <ul>
            {info.extra.map((x, i) => (
              <li key={i}>
                {x.label} <span className="muted">{x.kind ? `(${x.kind})` : `in ${x.flow}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {info.unused.length > 0 && (
        <div className="find-it-pair small">
          <b>Yours has these, and the reference does not use them here:</b>
          <ul>
            {info.unused.map((x) => (
              <li key={x.id}>
                {x.label} <span className="muted">in {x.flow}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {lines.missing.length > 0 && (
        <div className="find-it-pair small">
          <b>Lines the reference draws, and yours does not:</b>
          <ul>
            {lines.missing.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {lines.wrongKind.length > 0 && (
        <div className="find-it-pair small">
          <b>Lines of the wrong kind:</b>
          <ul>
            {lines.wrongKind.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {lines.extra.length > 0 && (
        <div className="find-it-pair small">
          <b>Your lines here that the reference does not draw:</b>
          <ul>
            {lines.extra.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {nothing && (
        <p className="small muted">
          {info.lines
            ? 'Your boxes, settings and lines here match the reference. Read the hint above, and the Run tab for a test run.'
            : 'Your settings for these components match the reference. Look at where they sit (which flow, inside which scope, and in what order) against the hint above.'}
        </p>
      )}
      <p className="muted small find-it-note">Opening this counts as the last hint for this check.</p>
    </div>
  )
}
