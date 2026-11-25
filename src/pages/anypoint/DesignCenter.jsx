import { useEffect, useMemo, useState } from 'react'
import CodeEditor from '../../components/CodeEditor.jsx'
import { createProject, dayText, mark, mockCall, publish, ramlErrors, saveProject, slug } from '../../lab/platform.js'
import { parseRaml } from '../../raml/parse.js'
import { Btn, Errors, Field, Input, Link, Modal, Radios, Select, SideNav, Table } from './parts.jsx'

export default function DesignCenter({ state, update, place, go }) {
  const project = state.projects.find((p) => p.id === place.project)
  if (project) return <Designer key={project.id} project={project} state={state} update={update} go={go} />
  return (
    <>
      <SideNav items={[['All projects', 'All projects'], ['Shared with me', 'Shared with me', true]]} value="All projects" onPick={() => {}} />
      <main className="pc-main">
        <Projects state={state} update={update} go={go} />
      </main>
    </>
  )
}

function Projects({ state, update, go }) {
  const [menu, setMenu] = useState(false)
  const [name, setName] = useState(null)
  const taken = state.projects.some((p) => p.name.toLowerCase() === name?.trim().toLowerCase())
  return (
    <>
      <div className="pc-bar">
        <div className="pc-drop">
          <Btn kind="primary" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            Create new ▾
          </Btn>
          {menu && (
            <div className="pc-menu">
              <button type="button" onClick={() => { setMenu(false); setName('') }}>
                <b>New API Specification</b>
                <small>Design a REST API in RAML.</small>
              </button>
              <button type="button" disabled title="Not part of the lab">
                <b>New Fragment</b>
                <small>Build a reusable RAML fragment.</small>
              </button>
            </div>
          )}
        </div>
      </div>
      <h2>API Projects</h2>
      <Table
        heads={['Name', 'Project Type', 'Updated', 'Published']}
        empty="No projects yet."
        rows={state.projects.map((p) => (
          <tr key={p.id}>
            <td>
              <Link onClick={() => go({ project: p.id })}>{p.name}</Link>
            </td>
            <td>API Specification</td>
            <td>{dayText(p.updated)}</td>
            <td>{p.published ?? 'Not yet'}</td>
          </tr>
        ))}
      />
      {name !== null && (
        <Modal
          title="New API Specification"
          onClose={() => setName(null)}
          foot={
            <>
              <Btn onClick={() => setName(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={!name.trim() || taken} onClick={() => { update((s) => createProject(s, name.trim())); setName(null) }}>
                Create API
              </Btn>
            </>
          }
        >
          <Field label="Project Name" required>
            <Input value={name} onChange={setName} placeholder="Orders System API" />
          </Field>
          <Radios name="how" value="own" onChange={() => {}} options={[['own', "I'm comfortable designing it on my own", 'Write the specification in the text editor.'], ['guide', 'Guide me through it', 'Use the visual editor.', true]]} />
          <Field label="Specification Language">
            <Select value="RAML 1.0" onChange={() => {}} options={['RAML 1.0']} />
          </Field>
          <Errors list={taken ? ['A project with this name exists.'] : []} />
        </Modal>
      )}
    </>
  )
}

const SHELF = [['Root', ['title', 'version', 'baseUri', 'mediaType', 'types', 'traits', 'securitySchemes']], ['Methods', ['get', 'post', 'put', 'patch', 'delete']], ['Parameters', ['queryParameters', 'headers', 'uriParameters']], ['Responses', ['responses', 'body', 'description', 'example']], ['Types', ['type', 'properties', 'required', 'enum']]]

function Designer({ project, state, update, go }) {
  const [raml, setRaml] = useState(project.raml)
  const [publishing, setPublishing] = useState(false)
  useEffect(() => {
    if (raml === project.raml) return undefined
    const timer = setTimeout(() => update((s) => saveProject(s, project.id, raml)), 400)
    return () => clearTimeout(timer)
  }, [raml, project.id, project.raml, update])
  // a save that is still waiting must not be lost when the page changes
  const keep = () => update((s) => (s.projects.find((p) => p.id === project.id)?.raml === raml ? s : saveProject(s, project.id, raml)))
  const errors = useMemo(() => ramlErrors(raml), [raml])
  const model = useMemo(() => (errors.length ? null : parseRaml(raml).model), [raml, errors])

  return (
    <div className="pc-designer">
      <div className="pc-design-bar">
        <Link onClick={() => { keep(); go({}) }}>← Projects</Link>
        <b className="pc-grow">{project.name}</b>
        <span className="pc-dim">master</span>
        <Btn kind="primary" onClick={() => { keep(); setPublishing(true) }}>
          Publish
        </Btn>
      </div>
      <aside className="pc-files">
        <b>Files</b>
        <button type="button" className="on">
          {slug(project.name)}.raml <small>Root</small>
        </button>
        <button type="button" disabled>
          exchange.json
        </button>
      </aside>
      <section className="pc-editor" aria-label="RAML editor">
        <div className="pc-editor-box">
          <CodeEditor light language="yaml" value={raml} onChange={setRaml} />
        </div>
        <div className={`pc-problems${errors.length ? ' bad' : ''}`} role="status">
          {errors.length === 0 ? 'No problems' : `${errors.length} problem${errors.length === 1 ? '' : 's'}. Line ${errors[0].line}: ${errors[0].message}`}
        </div>
        <div className="pc-shelf">
          {SHELF.map(([name, words]) => (
            <div key={name}>
              <b>{name}</b>
              {words.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
          ))}
        </div>
      </section>
      <Console raml={raml} model={model} project={project} update={update} />
      {publishing && <Publish project={{ ...project, raml }} state={state} update={update} model={model} onClose={() => setPublishing(false)} go={go} />}
    </div>
  )
}

function Console({ raml, model, project, update }) {
  const [on, setOn] = useState(false)
  const [open, setOpen] = useState(null)
  return (
    <aside className="pc-console" aria-label="Documentation">
      <div className="pc-console-head">
        <b className="pc-grow">Documentation</b>
        <label className="pc-switch">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Mocking service
        </label>
      </div>
      {on && <p className="pc-mono pc-url">https://mocks.lab.example/{slug(project.name)}</p>}
      {!model && <p className="pc-dim">Fix the problems to see the documentation.</p>}
      {model && (
        <>
          <p>
            <b>API title: {String(model.root.title ?? '')}</b>
            <br />
            Version: {String(model.root.version ?? 'none')}
          </p>
          <b>API endpoints</b>
          {model.resources.length === 0 && <p className="pc-dim">No resources yet.</p>}
          {model.resources.map((r) => (
            <div key={r.path} className="pc-res">
              <span className="pc-mono">{r.path}</span>
              <div>
                {Object.keys(r.methods).map((m) => (
                  <button key={m} type="button" className={`pc-method pc-m-${m}`} onClick={() => setOpen({ path: r.path, method: m, op: r.methods[m] })}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      {open && model && <TryIt key={`${open.method}${open.path}`} raml={raml} open={open} on={on} update={update} onClose={() => setOpen(null)} />}
    </aside>
  )
}

function TryIt({ raml, open, on, update, onClose }) {
  const [path, setPath] = useState(open.path.replace(/\{(\w+)\}/g, 'O-1001'))
  const [result, setResult] = useState(null)
  return (
    <div className="pc-try">
      <div className="pc-console-head">
        <span className={`pc-method pc-m-${open.method}`}>{open.method.toUpperCase()}</span>
        <span className="pc-grow pc-mono">{open.path}</span>
        <button type="button" className="pc-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="pc-dim">{open.op?.description}</p>
      <p>Responses: {Object.keys(open.op?.responses ?? {}).join(', ') || 'none declared'}</p>
      <b>Try it</b>
      <Input aria-label="Path" value={path} onChange={setPath} />
      <Btn kind="primary" disabled={!on} onClick={() => { setResult(mockCall(raml, open.method.toUpperCase(), path)); update((s) => mark(s, 'mock')) }}>
        Send
      </Btn>
      {!on && <p className="pc-dim">Turn on the mocking service to send a request.</p>}
      {result && (
        <>
          <p>
            <b className={result.status < 300 ? 'pc-good' : 'pc-bad'}>{result.status}</b>
          </p>
          <pre className="pc-pre">{result.body || '(no example in the specification)'}</pre>
        </>
      )}
    </div>
  )
}

function Publish({ project, state, update, model, onClose, go }) {
  const id = slug(project.name)
  const last = state.assets.findLast((a) => a.assetId === id)
  const next = last ? last.version.replace(/(\d+)\.(\d+)\.\d+/, (_, a, b) => `${a}.${Number(b) + 1}.0`) : '1.0.0'
  const [f, setF] = useState({ version: next, apiVersion: String(model?.root.version ?? 'v1'), lifecycle: 'stable', assetId: id, name: project.name })
  const [errors, setErrors] = useState([])
  const [more, setMore] = useState(false)
  const [done, setDone] = useState(false)
  function send() {
    const result = publish(state, project.id, f)
    setErrors(result.errors)
    if (result.errors.length) return
    update(() => result.state)
    setDone(true)
  }
  if (done)
    return (
      <Modal
        title="Publishing to Exchange"
        onClose={onClose}
        foot={
          <>
            <Btn onClick={onClose}>Close</Btn>
            <Btn kind="primary" onClick={() => go({ product: 'Exchange', asset: f.assetId })}>
              View in Exchange
            </Btn>
          </>
        }
      >
        <p>
          <b className="pc-good">Your asset {f.name} {f.version} was published.</b>
        </p>
      </Modal>
    )
  return (
    <Modal
      wide
      title="Publishing to Exchange"
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={send}>
            Publish to Exchange
          </Btn>
        </>
      }
    >
      <div className="pc-two">
        <div>
          <Field label="Asset version (required)">
            <Input value={f.version} onChange={(version) => setF({ ...f, version })} />
          </Field>
          <Field label="API version (required)">
            <Input value={f.apiVersion} onChange={(apiVersion) => setF({ ...f, apiVersion })} />
          </Field>
          <div className="pc-field">
            <span className="pc-label">LifeCycle State</span>
            <Radios name="life" value={f.lifecycle} onChange={(lifecycle) => setF({ ...f, lifecycle })} options={[['stable', 'Stable', 'State of release, ready to consume'], ['development', 'Development', 'In Process of Design and Development']]} />
          </div>
          <Link onClick={() => setMore(!more)}>{more ? 'Hide' : 'Show'} advanced options</Link>
          {more && (
            <>
              <Field label="Business group ID">
                <Input value="lab-org-id" onChange={() => {}} readOnly />
              </Field>
              <Field label="Asset name">
                <Input value={f.name} onChange={(name) => setF({ ...f, name })} />
              </Field>
              <Field label="Asset ID">
                <Input value={f.assetId} onChange={(assetId) => setF({ ...f, assetId: slug(assetId) })} />
              </Field>
            </>
          )}
        </div>
        <div className="pc-dim">
          <b>About asset versioning</b>
          <p>To publish to Exchange, use Semantic Versioning. Examples of good versions are 1.0.0 or 4.3.1.</p>
          <b>API version</b>
          <p>The version that the consumers see. It stays the same for changes that break nothing.</p>
        </div>
      </div>
      <Errors list={errors} />
    </Modal>
  )
}
