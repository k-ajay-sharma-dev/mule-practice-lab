import { useEffect, useState } from 'react'
import CodeEditor from '../components/CodeEditor.jsx'
import RunningMessage from '../components/RunningMessage.jsx'
import { runScript } from '../runner/client.js'
import { mimeToLanguage } from '../runner/grade.js'
import { writeLocal } from '../store/local.js'

const STORAGE_KEY = 'pl.playground'

const MIME_TYPES = [
  'application/json',
  'application/xml',
  'application/csv',
  'application/x-www-form-urlencoded',
  'application/yaml',
  'text/plain',
]

const DEFAULT_STATE = {
  script: `%dw 2.0
output application/json
---
payload map (item) -> {
  name: upper(item.name),
  adult: item.age >= 18
}
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "name": "asha", "age": 31 },
  { "name": "ben", "age": 16 }
]`,
    },
  ],
}

const isInput = (i) => i && typeof i.name === 'string' && typeof i.mime === 'string' && typeof i.content === 'string'

// A saved state of any other shape (older version, corrupt) falls back to the example.
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    const valid =
      saved && typeof saved.script === 'string' && Array.isArray(saved.inputs) && saved.inputs.length && saved.inputs.every(isInput)
    return valid ? saved : DEFAULT_STATE
  } catch {
    return DEFAULT_STATE
  }
}

export default function PlaygroundPage() {
  const [state, setState] = useState(loadState)
  const [active, setActive] = useState(0)
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      writeLocal(STORAGE_KEY, JSON.stringify(state))
    }, 400)
    return () => clearTimeout(t)
  }, [state])

  const input = state.inputs[active] ?? state.inputs[0]

  function updateInput(patch) {
    setState((s) => ({ ...s, inputs: s.inputs.map((inp, i) => (i === active ? { ...inp, ...patch } : inp)) }))
  }

  function addInput() {
    const taken = new Set(state.inputs.map((i) => i.name))
    let n = state.inputs.length
    while (taken.has(`input${n}`)) n++
    setState((s) => ({ ...s, inputs: [...s.inputs, { name: `input${n}`, mime: 'application/json', content: '{}' }] }))
    setActive(state.inputs.length)
  }

  function removeInput() {
    if (state.inputs.length <= 1) return
    setState((s) => ({ ...s, inputs: s.inputs.filter((_, i) => i !== active) }))
    setActive(0)
  }

  function reset() {
    if (!confirm('Reset the playground to the example script and input?')) return
    setState(DEFAULT_STATE)
    setActive(0)
    setResult(null)
  }

  async function run() {
    setRunning(true)
    setResult(await runScript(state.script, state.inputs))
    setRunning(false)
  }

  const validName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(input.name)

  return (
    <div className="playground">
      <header className="problem-head">
        <div className="problem-head-main">
          <p className="eyebrow">// free practice</p>
          <h1>DataWeave Playground</h1>
          <p className="muted small">
            Write any script against your own inputs. Each input is available in the script by its name. Ctrl+Enter
            runs.
          </p>
        </div>
        <div className="prev-next">
          <button className="btn btn-ghost" onClick={reset}>
            Reset
          </button>
          <button className="btn btn-primary" onClick={run} disabled={running || !validName}>
            {running ? 'Running…' : '▶ Run'}
          </button>
        </div>
      </header>

      <div className="workspace">
        <section className="panel left-panel playground-inputs">
          <div className="panel-tabs">
            {state.inputs.map((inp, i) => (
              <button key={i} className={`panel-tab ${i === active ? 'active' : ''}`} onClick={() => setActive(i)}>
                {inp.name || '(unnamed)'}
              </button>
            ))}
            <button className="panel-tab" onClick={addInput} title="Add input">
              + Input
            </button>
          </div>
          <div className="input-config">
            <input
              className={`input mono ${validName ? '' : 'invalid'}`}
              value={input.name}
              onChange={(e) => updateInput({ name: e.target.value.trim() })}
              aria-label="Input name"
              title="Name used in the script"
            />
            <select className="input" value={input.mime} onChange={(e) => updateInput({ mime: e.target.value })}>
              {MIME_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost" onClick={removeInput} disabled={state.inputs.length <= 1}>
              Remove
            </button>
          </div>
          <div className="editor-wrap">
            <CodeEditor
              value={input.content}
              language={mimeToLanguage(input.mime)}
              onChange={(v) => updateInput({ content: v })}
              onRun={run}
            />
          </div>
        </section>

        <section className="panel right-panel">
          <div className="editor-toolbar">
            <span className="mono small muted">Script · DataWeave 2.0</span>
          </div>
          <div className="editor-wrap">
            <CodeEditor value={state.script} onChange={(v) => setState((s) => ({ ...s, script: v }))} onRun={run} />
          </div>
          <div className="io-panel">
            <div className="panel-tabs">
              <span className="panel-tab active">Output</span>
              {result?.ok && (
                <span className="panel-tab-note muted small mono">
                  {result.mime} · {result.durationMs} ms
                </span>
              )}
            </div>
            <div className="io-body">
              {running ? (
                <RunningMessage />
              ) : !result ? (
                <div className="io-message muted">Run the script to see the output here.</div>
              ) : result.ok ? (
                <CodeEditor value={result.output} language={mimeToLanguage(result.mime)} readOnly />
              ) : (
                <pre className={`io-message ${result.notConfigured ? 'info' : 'error'}`}>{result.error}</pre>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
