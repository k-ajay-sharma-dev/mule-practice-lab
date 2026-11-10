import { useEffect, useRef, useState } from 'react'
import { architectureDoc } from '../study/project-notes.js'

const api = () => import('../sync/projects.js')

// Scripts may run so diagrams can draw, but without allow-same-origin the page gets a blank origin of its own:
// it cannot read this site, your sign-in or your notes. Links may open in a new tab.
const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox'

function problemText(error) {
  if (error?.message === 'too-large') return 'Not saved: the file is over about 900 KB. Link large images from the web instead of embedding them.'
  if (error?.code === 'permission-denied') return 'Not saved: the account refused it. Publish the latest firestore.rules (see DEPLOY.md).'
  return 'Something went wrong. Check your connection and try again.'
}

export default function ProjectArchitecture({ project, onChange }) {
  const [html, setHtml] = useState(null)
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)
  const [full, setFull] = useState(false)
  const [height, setHeight] = useState(600)
  const frame = useRef(null)
  const fileInput = useRef(null)
  const has = Boolean(project.architecture)

  useEffect(() => {
    if (!has) return setHtml(null)
    let live = true
    setHtml(null)
    setProblem(null)
    api()
      .then((p) => p.loadArchitecture(project.id))
      .then(
        (found) => live && (found == null ? setProblem("The architecture file is missing. Add it again.") : setHtml(found)),
        () => live && setProblem("Couldn't load the architecture. Check your connection and try again."),
      )
    return () => {
      live = false
    }
  }, [project.id, project.updatedAt, has])

  // only the frame we made may resize itself, and only within sane limits
  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== frame.current?.contentWindow) return
      const h = Number(e.data?.plArchHeight)
      if (Number.isFinite(h)) setHeight(Math.min(Math.max(h, 200), 20000))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!full) return
    const onKey = (e) => e.key === 'Escape' && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (has && !confirm(`Replace ${project.architecture} with ${file.name}?`)) return
    setBusy(true)
    setProblem(null)
    try {
      const text = await file.text()
      onChange(await (await api()).saveArchitecture(project, file.name, text))
    } catch (error) {
      setProblem(problemText(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Remove ${project.architecture} from this project? This cannot be undone.`)) return
    setBusy(true)
    try {
      onChange(await (await api()).removeArchitecture(project))
    } catch (error) {
      setProblem(problemText(error).replace('Not saved', 'Not removed'))
    } finally {
      setBusy(false)
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    Object.assign(document.createElement('a'), { href: url, download: project.architecture || 'architecture.html' }).click()
    URL.revokeObjectURL(url)
  }

  const picker = <input ref={fileInput} type="file" accept=".html,.htm,text/html" hidden onChange={upload} />

  if (!has) {
    return (
      <div className="arch-empty">
        <p>No architecture page yet.</p>
        <p className="muted small">
          Add one HTML file, such as a diagram you drew or exported. It opens in a locked box: it cannot reach your account,
          this site or the network. Keep it to one self-contained file under about 900 KB.
        </p>
        <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy}>
          {busy ? 'Saving…' : 'Add architecture (.html)…'}
        </button>
        {picker}
        {problem && <p className="err-text small">{problem}</p>}
      </div>
    )
  }

  return (
    <div className="arch-view">
      <div className="arch-bar">
        <span className="mono small muted">{project.architecture}</span>
        <span className="arch-actions">
          <button className="btn btn-sm" onClick={() => setFull(true)} disabled={!html}>
            Full screen
          </button>
          <button className="btn btn-sm" onClick={download} disabled={!html}>
            Download
          </button>
          <button className="btn btn-sm" onClick={() => fileInput.current?.click()} disabled={busy}>
            Replace…
          </button>
          <button className="btn btn-ghost btn-sm danger" onClick={remove} disabled={busy}>
            Remove
          </button>
        </span>
        {picker}
      </div>
      {problem && <p className="err-text small">{problem}</p>}
      {!html && !problem && <p className="muted small">Loading…</p>}
      {html && (
        <iframe
          ref={frame}
          className="arch-frame"
          title={`Architecture: ${project.title}`}
          sandbox={SANDBOX}
          referrerPolicy="no-referrer"
          srcDoc={architectureDoc(html)}
          style={{ height }}
        />
      )}
      {full && html && (
        <>
          <div className="io-backdrop" onClick={() => setFull(false)} aria-hidden="true" />
          <div className="arch-popup" role="dialog" aria-label={`Architecture: ${project.title}`}>
            <div className="arch-bar">
              <span className="mono small muted">{project.architecture}</span>
              <button className="btn btn-sm" onClick={() => setFull(false)}>
                Close (Esc)
              </button>
            </div>
            <iframe
              className="arch-frame arch-frame-full"
              title={`Architecture full screen: ${project.title}`}
              sandbox={SANDBOX}
              referrerPolicy="no-referrer"
              srcDoc={architectureDoc(html, { fitHeight: false })}
            />
          </div>
        </>
      )}
    </div>
  )
}
