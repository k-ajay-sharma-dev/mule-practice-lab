import { useEffect, useState } from 'react'
import CodeEditor from '../components/CodeEditor.jsx'
import { CodeBlock } from '../components/CopyButton.jsx'
import FollowUps from '../components/FollowUps.jsx'
import Markdown from '../components/Markdown.jsx'
import RunningMessage from '../components/RunningMessage.jsx'
import { runScript } from '../runner/client.js'
import { jsonDifferences, mimeToLanguage, outputsMatch } from '../runner/grade.js'
import { scheduleReview, updateEntry, useEntry, workedStatus } from '../store/progress.js'
import NotesBox from './NotesBox.jsx'
import { useAutosave } from './useAutosave.js'

const LEFT_TABS = ['description', 'hints', 'solution', 'notes']

export default function DataWeaveWorkspace({ problem }) {
  const entry = useEntry(problem.id)
  const [code, setCode] = useState(typeof entry.code === 'string' ? entry.code : problem.starterCode)
  const [leftTab, setLeftTab] = useState('description')
  const [ioTab, setIoTab] = useState('input')
  const [inputIdx, setInputIdx] = useState(0)
  const [hintsShown, setHintsShown] = useState(0)
  const [busy, setBusy] = useState(null) // 'run' | 'submit' | null
  const [runResult, setRunResult] = useState(null)
  const [testResults, setTestResults] = useState(null)
  const [popup, setPopup] = useState(false) // Input, Output and Tests open large over the page

  useEffect(() => {
    if (!popup) return
    const close = (e) => e.key === 'Escape' && setPopup(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [popup])

  useAutosave(code, (value) => updateEntry(problem.id, { code: value, status: workedStatus(problem.id) }))

  const expectedMime = problem.expected.mime
  const testCases = [
    { name: 'Sample', inputs: problem.inputs, expected: problem.expected.content },
    ...(problem.tests || []).map((t, i) => ({ name: t.name || `Hidden test ${i + 1}`, ...t })),
  ]

  async function run() {
    setBusy('run')
    setIoTab('output')
    const result = await runScript(code, problem.inputs)
    setRunResult(result)
    setBusy(null)
  }

  async function submit() {
    setBusy('submit')
    setIoTab('tests')
    const results = []
    for (const tc of testCases) {
      const r = await runScript(code, tc.inputs)
      if (r.notConfigured) {
        setTestResults({ error: r.error })
        setBusy(null)
        return
      }
      results.push({
        name: tc.name,
        passed: r.ok && outputsMatch(r.output, tc.expected, expectedMime),
        error: r.ok ? null : r.error,
        // kept so a failed test can show what went in, what was expected and what came out
        inputs: tc.inputs,
        expected: tc.expected,
        output: r.ok ? r.output : null,
      })
    }
    const allPassed = results.every((r) => r.passed)
    setTestResults({ results, allPassed })
    if (allPassed) updateEntry(problem.id, { status: 'solved', code }, { graded: true })
    else scheduleReview(problem.id) // failed hidden tests come back for review
    setBusy(null)
  }

  function reset() {
    if (code !== problem.starterCode && !confirm('Reset the editor to the starter code?')) return
    setCode(problem.starterCode)
  }

  return (
    <div className="workspace">
      <section className="panel left-panel">
        <div className="panel-tabs">
          {LEFT_TABS.map((t) => (
            <button key={t} className={`panel-tab ${leftTab === t ? 'active' : ''}`} onClick={() => setLeftTab(t)}>
              {t === 'hints' ? `Hints (${problem.hints?.length ?? 0})` : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {leftTab === 'description' && (
            <>
              <Markdown>{problem.description}</Markdown>
              {problem.inputs.map((inp) => (
                <div key={inp.name} className="io-block">
                  <div className="io-label">
                    Input · <span className="mono">{inp.name}</span> <span className="muted">({inp.mime})</span>
                  </div>
                  <CodeBlock>{inp.content}</CodeBlock>
                </div>
              ))}
              <div className="io-block">
                <div className="io-label">
                  Expected output <span className="muted">({expectedMime})</span>
                </div>
                <CodeBlock>{problem.expected.content}</CodeBlock>
              </div>
              {problem.tests?.length > 0 && (
                <p className="muted small">
                  Submit also runs {problem.tests.length} hidden test{problem.tests.length > 1 ? 's' : ''} with different
                  input.
                </p>
              )}
            </>
          )}

          {leftTab === 'hints' && (
            <div className="stack">
              {(problem.hints || []).slice(0, hintsShown).map((h, i) => (
                <div key={i} className="hint">
                  <span className="hint-num">Hint {i + 1}</span>
                  <Markdown>{h}</Markdown>
                </div>
              ))}
              {hintsShown < (problem.hints?.length ?? 0) ? (
                <button className="btn" onClick={() => setHintsShown((n) => n + 1)}>
                  Show hint {hintsShown + 1}
                </button>
              ) : (
                <p className="muted small">{problem.hints?.length ? 'No more hints.' : 'No hints for this one.'}</p>
              )}
            </div>
          )}

          {leftTab === 'solution' &&
            (entry.revealed ? (
              <div className="stack">
                <CodeBlock>{problem.solution}</CodeBlock>
                {problem.explanation && <Markdown>{problem.explanation}</Markdown>}
                <FollowUps items={problem.followUps} />
              </div>
            ) : (
              <div className="reveal-gate">
                <p className="muted">Try it yourself first. Revealing the solution is recorded on this problem.</p>
                <button className="btn" onClick={() => updateEntry(problem.id, { revealed: true })}>
                  Reveal solution
                </button>
              </div>
            ))}

          {leftTab === 'notes' && (
            <NotesBox problemId={problem.id} />
          )}
        </div>
      </section>

      <section className="panel right-panel">
        <div className="editor-toolbar">
          <span className="mono small muted">DataWeave 2.0</span>
          <div className="toolbar-actions">
            <button className="btn btn-ghost" onClick={reset} disabled={!!busy}>
              Reset
            </button>
            <button className="btn" onClick={run} disabled={!!busy} title="Run (Ctrl+Enter)">
              {busy === 'run' ? 'Running…' : '▶ Run'}
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={!!busy}>
              {busy === 'submit' ? 'Grading…' : 'Submit'}
            </button>
          </div>
        </div>

        <div className="editor-wrap">
          <CodeEditor value={code} onChange={setCode} onRun={() => !busy && run()} />
        </div>

        {popup && <div className="io-backdrop" onClick={() => setPopup(false)} />}
        <div className={`io-panel${popup ? ' io-popup' : ''}`} role={popup ? 'dialog' : undefined} aria-label={popup ? 'Input, output and tests' : undefined}>
          <div className="panel-tabs">
            {['input', 'output', 'tests'].map((t) => (
              <button key={t} className={`panel-tab ${ioTab === t ? 'active' : ''}`} onClick={() => setIoTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
            {ioTab === 'input' && problem.inputs.length > 1 && (
              <div className="sub-tabs">
                {problem.inputs.map((inp, i) => (
                  <button
                    key={inp.name}
                    className={`chip ${inputIdx === i ? 'active' : ''}`}
                    onClick={() => setInputIdx(i)}
                  >
                    {inp.name}
                  </button>
                ))}
              </div>
            )}
            <button
              className="io-expand"
              onClick={() => setPopup(!popup)}
              title={popup ? 'Close (Esc)' : 'Open large'}
              aria-label={popup ? 'Close the large view' : 'Open input, output and tests large'}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {popup ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <>
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>
          <div className="io-body">
            {ioTab === 'input' && (
              <CodeEditor
                value={problem.inputs[inputIdx].content}
                language={mimeToLanguage(problem.inputs[inputIdx].mime)}
                readOnly
              />
            )}
            {ioTab === 'output' && <OutputView result={runResult} busy={busy === 'run'} problem={problem} />}
            {ioTab === 'tests' && <TestsView data={testResults} busy={busy === 'submit'} total={testCases.length} mime={expectedMime} />}
          </div>
        </div>
      </section>
    </div>
  )
}

function OutputView({ result, busy, problem }) {
  if (busy) return <RunningMessage />
  if (!result) return <div className="io-message muted">Click Run to execute your script against the sample input.</div>
  if (!result.ok) return <CodeBlock className={`io-message ${result.notConfigured ? 'info' : 'error'}`}>{result.error}</CodeBlock>

  const matches = outputsMatch(result.output, problem.expected.content, problem.expected.mime)
  return (
    <div className="output-view">
      <div className={`match-banner ${matches ? 'pass' : 'fail'}`}>
        {matches ? '✓ Output matches the expected output' : '✗ Output differs from the expected output'}
      </div>
      <div className="output-editor">
        <CodeEditor value={result.output} language={mimeToLanguage(result.mime || problem.expected.mime)} readOnly />
      </div>
    </div>
  )
}

// A failed test shows its input, the expected output, your output and where they differ, so you can see why.
// The first failure opens by itself.
function FailedTest({ result, mime, open }) {
  const differences = result.output != null && mime.includes('json') ? jsonDifferences(result.output, result.expected) : []
  return (
    <details className="test-detail" open={open}>
      <summary>Show why it failed</summary>
      {differences.length > 0 && (
        <div className="test-diff">
          <div className="io-label">What is different</div>
          <ul>
            {differences.map((d) => (
              <li key={d} className="mono">
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.inputs.map((inp) => (
        <div key={inp.name} className="io-block">
          <div className="io-label">
            Input · <span className="mono">{inp.name}</span> <span className="muted">({inp.mime})</span>
          </div>
          <CodeBlock>{inp.content}</CodeBlock>
        </div>
      ))}
      <div className="test-compare">
        <div className="io-block">
          <div className="io-label">Expected output</div>
          <CodeBlock>{result.expected}</CodeBlock>
        </div>
        {result.output != null && (
          <div className="io-block">
            <div className="io-label">Your output</div>
            <CodeBlock>{result.output}</CodeBlock>
          </div>
        )}
      </div>
    </details>
  )
}

function TestsView({ data, busy, total, mime }) {
  if (busy) return <RunningMessage>Running {total} tests…</RunningMessage>
  if (!data) return <div className="io-message muted">Submit runs the sample plus every hidden test.</div>
  if (data.error) return <pre className="io-message info">{data.error}</pre>
  const firstFailure = data.results.find((r) => !r.passed)

  return (
    <div className="tests-view">
      <div className={`match-banner ${data.allPassed ? 'pass' : 'fail'}`}>
        {data.results.filter((r) => r.passed).length} / {data.results.length} tests passed
        {data.allPassed && ' — solved!'}
      </div>
      <ul className="test-list">
        {data.results.map((r) => (
          <li key={r.name} className={r.passed ? 'pass' : 'fail'}>
            <span>{r.passed ? '✓' : '✗'}</span> {r.name}
            {r.error && <pre className="test-error">{r.error}</pre>}
            {!r.passed && <FailedTest result={r} mime={mime} open={r === firstFailure} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
