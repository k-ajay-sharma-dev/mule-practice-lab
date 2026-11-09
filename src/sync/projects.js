// Your own project notes, kept only in your Google account. They are never part of the site's code, so a private
// project stays private even though the site is public. firestore.rules lets only the owner read or write them.
//
//   users/{uid}/projects/{id}  { title, summary, body (Markdown), updatedAt }
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { account } from './engine.js'

// Firestore keeps up to 1 MiB per document. This many characters fits even when every one takes 3 bytes.
export const MAX_BODY = 300000
export const MAX_TITLE = 200
export const MAX_SUMMARY = 1000

function projects() {
  const signedIn = account()
  if (!signedIn) throw new Error('signed-out')
  return collection(signedIn.db, 'users', signedIn.uid, 'projects')
}

export async function listProjects() {
  const found = await getDocs(projects())
  return found.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function saveProject({ id, title, summary, body }) {
  if (body.length > MAX_BODY) throw new Error('too-large')
  const key = id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const saved = {
    title: title.trim().slice(0, MAX_TITLE),
    summary: summary.trim().slice(0, MAX_SUMMARY),
    body,
    updatedAt: new Date().toISOString(),
  }
  await setDoc(doc(projects(), key), saved)
  return { id: key, ...saved }
}

export async function deleteProject(id) {
  await deleteDoc(doc(projects(), id))
}
