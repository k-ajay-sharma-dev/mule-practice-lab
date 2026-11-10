import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProjectArchitecture from '../components/ProjectArchitecture.jsx'
import { NotesView, PracticeView } from '../components/ProjectNotes.jsx'
import { questionsIn } from '../study/project-notes.js'
import { signIn, useSyncStatus } from '../sync/status.js'

const TABS = [
  ['notes', 'Notes'],
  ['architecture', 'Architecture'],
  ['practice', 'Practice'],
]

// My Projects: notes about your own real projects, to study before interviews. They live only in your Google
// account (src/sync/projects.js), never in the site's code, so nobody else can read them.
const api = () => import('../sync/projects.js')

// A Markdown file's first "# " heading is its title; without one, the file name.
function fromMarkdown(name, text) {
  const heading = text.match(/^#\s+(.+)$/m)
  const title = heading ? heading[1].trim() : name.replace(/\.(md|markdown|txt)$/i, '')
  const body = heading ? text.replace(heading[0], '').replace(/^\s+/, '') : text
  return { title, summary: '', body }
}

function problemText(error) {
  if (error?.message === 'too-large') return 'Not saved: the notes are too long. Split them into two projects.'
  if (error?.message === 'signed-out') return 'Not saved: sign in first.'
  if (error?.code === 'permission-denied') return 'Not saved: the account refused it. Publish the latest firestore.rules (see DEPLOY.md).'
  return 'Something went wrong. Check your connection and try again.'
}

export default function ProjectsPage() {
  const sync = useSyncStatus()
  const signedIn = Boolean(sync.user) && sync.state !== 'signed-out'
  const email = signedIn ? sync.user.email : null
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [list, setList] = useState(null)
  const [problem, setProblem] = useState(null)
  const [draft, setDraft] = useState(null) // { id?, title, summary, body } while editing
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('notes')
  const fileInput = useRef(null)

  useEffect(() => {
    if (!email) return
    let live = true
    setProblem(null)
    api()
      .then((p) => p.listProjects())
      .then(
        (found) => live && setList(found),
        (error) => live && setProblem(problemText(error).replace('Not saved', "Couldn't load your projects")),
      )
    return () => {
      live = false
    }
  }, [email])

  // leaving a project or the editor by navigation closes the editor
  useEffect(() => {
    setDraft(null)
    setTab('notes')
  }, [projectId])

  if (sync.state === 'off') {
    return (
      <div className="projects-page">
        <Head />
        <p className="muted">My Projects needs the Google account sync, which isn't set up on this copy of the site.</p>
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="projects-page">
        <Head />
        <section className="settings-card">
          <h2>Sign in to see your projects</h2>
          <p className="muted small">
            Your project notes are saved in your Google account only. Nobody else can read them, and they are never part of
            the site itself.
          </p>
          <button className="btn btn-primary" onClick={signIn} disabled={sync.state === 'loading'}>
            Sign in with Google
          </button>
        </section>
      </div>
    )
  }

  async function importFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const read = fromMarkdown(file.name, await file.text())
    // importing while editing replaces the notes but keeps the project you are editing
    setDraft((d) => (d ? { ...d, body: read.body, title: d.title || read.title } : read))
  }

  async function save() {
    if (!draft.title.trim()) return setProblem('Give the project a title.')
    setSaving(true)
    setProblem(null)
    try {
      const saved = await (await api()).saveProject(draft)
      setList((l) => [saved, ...(l ?? []).filter((p) => p.id !== saved.id)])
      setDraft(null)
      navigate(`/projects/${saved.id}`)
    } catch (error) {
      setProblem(problemText(error))
    } finally {
      setSaving(false)
    }
  }

  async function remove(project) {
    if (!confirm(`Delete "${project.title}" from your account? This cannot be undone.`)) return
    try {
      await (await api()).deleteProject(project)
      setList((l) => l.filter((p) => p.id !== project.id))
      navigate('/projects')
    } catch (error) {
      setProblem(problemText(error).replace('Not saved', 'Not deleted'))
    }
  }

  function download(project) {
    const blob = new Blob([`# ${project.title}\n\n${project.body}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `${project.title.replace(/[^\w-]+/g, '-')}.md` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const picker = <input ref={fileInput} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={importFile} />
  const warning = problem && <p className="err-text small">{problem}</p>

  if (draft) {
    return (
      <div className="projects-page">
        <Head back />
        <h1>{draft.id ? 'Edit project' : 'New project'}</h1>
        {warning}
        <div className="project-form">
          <label className="field">
            <span className="small muted">Title</span>
            <input className="input" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="field">
            <span className="small muted">One line about it (shown in the list)</span>
            <input className="input" value={draft.summary} maxLength={1000} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          </label>
          <label className="field">
            <span className="small muted">
              Notes in Markdown ({draft.body.length.toLocaleString()} characters). Each <code>## Heading</code> becomes a section
              you can fold. A paragraph that starts with <code>**A question?**</code> becomes a practice card.
            </span>
            <textarea className="input project-body" value={draft.body} spellCheck={false} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <div className="settings-actions">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save to my account'}
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              Replace notes from a .md file…
            </button>
            <button className="btn btn-ghost" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            {picker}
          </div>
        </div>
      </div>
    )
  }

  if (projectId) {
    const project = list?.find((p) => p.id === projectId)
    return (
      <div className="projects-page">
        <Head back />
        {warning}
        {!list && !problem && <p className="muted">Loading…</p>}
        {list && !project && <p className="muted">This project isn't in your account. It may have been deleted.</p>}
        {project && (
          <>
            <h1>{project.title}</h1>
            {project.summary && <p className="muted">{project.summary}</p>}
            <div className="settings-actions project-actions">
              <button className="btn" onClick={() => setDraft({ ...project })}>
                Edit
              </button>
              <button className="btn" onClick={() => download(project)}>
                Download .md
              </button>
              <button className="btn btn-ghost danger" onClick={() => remove(project)}>
                Delete
              </button>
              <span className="muted small">Updated {new Date(project.updatedAt).toLocaleString()}</span>
            </div>
            <div className="project-tabs" role="tablist">
              {TABS.map(([key, label]) => (
                <button key={key} role="tab" aria-selected={tab === key} className={`project-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
                  {label}
                  {key === 'practice' && <span className="muted"> ({questionsIn(project.body).length})</span>}
                </button>
              ))}
            </div>
            {tab === 'notes' && <NotesView body={project.body} />}
            {tab === 'architecture' && (
              <ProjectArchitecture project={project} onChange={(p) => setList((l) => l.map((x) => (x.id === p.id ? p : x)))} />
            )}
            {tab === 'practice' && <PracticeView body={project.body} />}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="projects-page">
      <Head />
      <div className="settings-actions">
        <button className="btn btn-primary" onClick={() => setDraft({ title: '', summary: '', body: '' })}>
          New project
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()}>
          Import a .md file…
        </button>
        {picker}
      </div>
      {warning}
      {!list && !problem && <p className="muted">Loading…</p>}
      {list?.length === 0 && (
        <p className="muted">
          No projects yet. Write one here, or import a Markdown file you keep on your computer. It is saved to your account
          only when you press Save.
        </p>
      )}
      {list?.length > 0 && (
        <div className="project-grid">
          {list.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="track-card">
              <h3>{p.title}</h3>
              <p className="muted small">{p.summary || 'No summary yet.'}</p>
              <span className="muted small">
                Updated {new Date(p.updatedAt).toLocaleDateString()}
                {p.architecture && ' · architecture'}
                {` · ${questionsIn(p.body).length} questions`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Head({ back }) {
  return (
    <>
      <p className="eyebrow">
        {back ? <Link to="/projects">← my projects</Link> : '// my projects'}
      </p>
      {!back && (
        <>
          <h1>My Projects</h1>
          <p className="muted">
            Notes about the projects you worked on, to revise before an interview. Only you can see them: they are saved in
            your Google account and never in the site.
          </p>
        </>
      )}
    </>
  )
}
