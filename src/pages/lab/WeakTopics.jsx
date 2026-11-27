import { useMemo, useState } from 'react'
import { readDrills } from '../../store/lab-points.js'
import { readWriteups, WRITEUP_PASS } from '../../store/lab-writeups.js'
import { readMysteries } from './mystery.js'

const pct = (r) => `${Math.round(r * 100)}%`
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

// Per group, from the stores in this browser only: solved labs (pl.lab.solved, passed in), drills (pl.lab.drills),
// write-ups (pl.lab.writeups) and mystery incidents (pl.lab.mystery).
export function groupStats(sections, solved, { drills, writeups, mysteries }) {
  return sections.map(([name, labs]) => {
    const ids = new Set(labs.map((l) => l.id))
    const runs = drills.history.filter((d) => ids.has(d.id))
    const revealed = mysteries.filter((m) => ids.has(m.id) && m.end === 'revealed')
    const bests = labs.map((l) => drills.best[l.id]).filter(Number.isFinite)
    const covers = labs.map((l) => writeups[l.id]?.best).filter(Number.isFinite)
    const done = labs.filter((l) => solved[l.id]).length
    const hints = runs.reduce((sum, d) => sum + (Number(d.hints) || 0), 0)
    const giveUps = runs.filter((d) => d.gaveUp).length + revealed.length
    const drill = avg(bests)
    const cover = avg(covers)
    // trouble on record: give ups, hints, a low drill score or a thin write-up
    const troubled = giveUps > 0 || hints > 0 || (drill !== null && drill < 70) || (cover !== null && cover < WRITEUP_PASS)
    // higher is weaker: what is left to solve, plus the signs of trouble on what was tried
    const weakness = (1 - done / Math.max(1, labs.length)) * 30 + giveUps * 12 + hints * 3 + (drill === null ? 0 : (100 - drill) * 0.3) + (cover === null ? 0 : (1 - cover) * 20)
    const struggled = new Set([...runs.filter((d) => d.gaveUp).map((d) => d.id), ...revealed.map((m) => m.id)])
    const redo = labs
      .map((l) => {
        if (struggled.has(l.id)) return [l, 'you gave it up']
        if (Number.isFinite(drills.best[l.id]) && drills.best[l.id] < 60) return [l, `drill score ${drills.best[l.id]}`]
        if (solved[l.id] && Number.isFinite(writeups[l.id]?.best) && writeups[l.id].best < WRITEUP_PASS) return [l, `write-up covered ${pct(writeups[l.id].best)}`]
        return null
      })
      .filter(Boolean)
    const fresh = labs.filter((l) => !solved[l.id]).map((l) => [l, 'not solved yet'])
    const noWriteup = labs.filter((l) => solved[l.id] && !writeups[l.id]).map((l) => [l, 'solved, no write-up yet'])
    return { name, total: labs.length, done, hints, giveUps, drill, cover, troubled, weakness, next: [...redo, ...fresh, ...noWriteup].slice(0, 2) }
  })
}

export default function WeakTopics({ sections, solved, onOpen }) {
  const [all, setAll] = useState(false)
  const stats = useMemo(() => groupStats(sections.filter(([, labs]) => labs.length > 0), solved, { drills: readDrills(), writeups: readWriteups(), mysteries: readMysteries() }), [sections, solved])
  // groups with trouble on record first, then the groups with the most left to solve
  const weakest = [...stats]
    .filter((g) => g.total > 0 && (g.done < g.total || g.weakness > 0.5))
    .sort((a, b) => Number(b.troubled) - Number(a.troubled) || b.weakness - a.weakness)
    .slice(0, 3)
  return (
    <section className="lab-weak" aria-label="Weak topics">
      <div className="lab-panel-head">
        <h2>Weak topics</h2>
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Hide the table' : 'Show all groups'}
        </button>
      </div>
      <p className="muted small">From what this browser has saved: labs solved, drill hints and scores, give ups and write-ups.</p>
      {weakest.length === 0 ? (
        <p className="small">Every group is solved with no trouble on record. Try a mystery incident to test yourself.</p>
      ) : (
        <ol className="lab-weak-top">
          {weakest.map((g) => (
            <li key={g.name}>
              <b>{g.name}</b>{' '}
              <span className="muted small">
                {g.done} of {g.total} solved
                {g.giveUps ? `, ${g.giveUps} give up${g.giveUps === 1 ? '' : 's'}` : ''}
                {g.hints ? `, ${g.hints} hint${g.hints === 1 ? '' : 's'}` : ''}
                {g.drill !== null ? `, drill average ${Math.round(g.drill)}` : ''}
                {g.cover !== null ? `, write-ups ${pct(g.cover)}` : ''}
              </span>
              {g.next.length > 0 && (
                <ul className="small">
                  {g.next.map(([lab, why]) => (
                    <li key={lab.id}>
                      <button type="button" className="link-btn" onClick={() => onOpen(lab.id)}>
                        {lab.title}
                      </button>{' '}
                      <span className="muted">({why})</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {all && (
        <div className="lab-weak-scroll">
          <table className="lab-weak-table small">
            <caption className="muted">Every group. The bar shows the share of labs solved.</caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Solved</th>
                <th scope="col">Hints</th>
                <th scope="col">Give ups</th>
                <th scope="col">Drill score</th>
                <th scope="col">Write-ups</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((g) => (
                <tr key={g.name}>
                  <th scope="row">{g.name}</th>
                  <td>
                    <span className="lab-weak-solved">
                      <span className="mono">
                        {g.done} of {g.total}
                      </span>
                      <span className="lab-weak-bar" title={`${g.done} of ${g.total} solved`} aria-hidden="true">
                        <i style={{ width: `${g.total ? (g.done / g.total) * 100 : 0}%` }} />
                      </span>
                    </span>
                  </td>
                  <td className="mono">{g.hints}</td>
                  <td className="mono">{g.giveUps}</td>
                  <td className="mono">{g.drill === null ? 'none' : Math.round(g.drill)}</td>
                  <td className="mono">{g.cover === null ? 'none' : pct(g.cover)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
