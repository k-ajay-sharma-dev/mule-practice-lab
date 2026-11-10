// Your own project notes, kept only in your Google account. They are never part of the site's code, so a private
// project stays private even though the site is public. firestore.rules lets only the owner read or write them.
//
//   users/{uid}/projects/{id}      { title, summary, body (Markdown), architecture (file name or ''), updatedAt }
//   users/{uid}/projectFiles/{id}  { html }: the architecture page, apart so the list never downloads it
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { account } from './engine.js'

// Firestore keeps up to 1 MiB per document. This many characters fits even when every one takes 3 bytes.
export const MAX_BODY = 300000
export const MAX_TITLE = 200
export const MAX_SUMMARY = 1000
// An architecture page is mostly plain ASCII, so it is measured in bytes against the 1 MiB document limit.
export const MAX_HTML_BYTES = 950000

function places() {
  const signedIn = account()
  if (!signedIn) throw new Error('signed-out')
  const { db, uid } = signedIn
  return { db, projects: collection(db, 'users', uid, 'projects'), files: collection(db, 'users', uid, 'projectFiles') }
}

export async function listProjects() {
  const found = await getDocs(places().projects)
  return found.docs.map((d) => ({ architecture: '', ...d.data(), id: d.id })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function saveProject({ id, title, summary, body, architecture = '' }) {
  if (body.length > MAX_BODY) throw new Error('too-large')
  const key = id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const saved = {
    title: title.trim().slice(0, MAX_TITLE),
    summary: summary.trim().slice(0, MAX_SUMMARY),
    body,
    updatedAt: new Date().toISOString(),
  }
  // A notes-only project is stored without the architecture field, so saving it works under the first rules too.
  if (architecture) saved.architecture = architecture
  await setDoc(doc(places().projects, key), saved)
  return { id: key, architecture: '', ...saved }
}

export async function loadArchitecture(id) {
  const found = await getDoc(doc(places().files, id))
  return found.exists() ? found.data().html : null
}

// The page and the project's note of it change together, so the list never points at a missing file.
export async function saveArchitecture(project, name, html) {
  if (new Blob([html]).size > MAX_HTML_BYTES) throw new Error('too-large')
  const { db, projects, files } = places()
  const updated = { ...project, architecture: name.slice(0, MAX_TITLE), updatedAt: new Date().toISOString() }
  const batch = writeBatch(db)
  batch.set(doc(files, project.id), { html })
  batch.set(doc(projects, project.id), withoutId(updated))
  await batch.commit()
  return updated
}

export async function removeArchitecture(project) {
  const { db, projects, files } = places()
  const updated = { ...project, architecture: '', updatedAt: new Date().toISOString() }
  const batch = writeBatch(db)
  batch.delete(doc(files, project.id))
  batch.set(doc(projects, project.id), withoutId(updated))
  await batch.commit()
  return updated
}

// The architecture file is only touched when the project has one, so deleting a notes-only project never depends
// on the rules for files.
export async function deleteProject({ id, architecture }) {
  const { db, projects, files } = places()
  const batch = writeBatch(db)
  batch.delete(doc(projects, id))
  if (architecture) batch.delete(doc(files, id))
  await batch.commit()
}

function withoutId({ title, summary, body, architecture, updatedAt }) {
  return architecture ? { title, summary, body, architecture, updatedAt } : { title, summary, body, updatedAt }
}
