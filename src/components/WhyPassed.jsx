// After a design passes every check: each check with the parts of your design that met it, so you can say out loud
// why it works, as an interviewer would ask. metBy(check) → { run, parts: [names] }.
export default function WhyPassed({ checks, metBy }) {
  return (
    <details className="why-passed" open>
      <summary className="small">
        <b>Why it passed</b> <span className="muted">· say each one out loud, as you would to an interviewer</span>
      </summary>
      <ul>
        {checks.map((c, i) => {
          const m = metBy(c)
          return (
            <li key={i} className="small">
              <span className="ok-text">✓</span>
              <span>
                {c.label}
                <span className="muted why-passed-by">
                  {m.run
                    ? 'The test run behaves as the scenario asks.'
                    : m.parts.length
                      ? `Met by ${m.parts.join(', ')}.`
                      : 'Met by the design as a whole.'}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
