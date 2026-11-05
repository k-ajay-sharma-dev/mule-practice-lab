// Interview Practice answers saved to the account. Firestore rather than Cloud Storage, because Storage needs the
// paid Blaze plan and this project runs on the free Spark plan.
//
//   users/{uid}/recordings/{id}      { question, problemId, rating, seconds, type, recordedAt }
//   users/{uid}/recordingAudio/{id}  { audio: bytes }: apart, so listing answers downloads no audio
import { Bytes, collection, doc, getDoc, getDocs, orderBy, query, writeBatch } from 'firebase/firestore'
import { expired, MAX_SAVED_BYTES } from '../study/recording.js'
import { account } from './engine.js'

function places() {
  const signedIn = account()
  if (!signedIn) throw new Error('signed-out')
  const { db, uid } = signedIn
  return { db, details: collection(db, 'users', uid, 'recordings'), audio: collection(db, 'users', uid, 'recordingAudio') }
}

function remove(batch, { details, audio }, id) {
  batch.delete(doc(details, id))
  batch.delete(doc(audio, id))
}

export async function listRecordings() {
  const { details } = places()
  const found = await getDocs(query(details, orderBy('recordedAt', 'desc')))
  return found.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function saveRecording(info, blob) {
  if (blob.size > MAX_SAVED_BYTES) throw new Error('too-large')
  const where = places()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const batch = writeBatch(where.db)
  batch.set(doc(where.details, id), { ...info, type: blob.type, recordedAt: new Date().toISOString() })
  batch.set(doc(where.audio, id), { audio: Bytes.fromUint8Array(new Uint8Array(await blob.arrayBuffer())) })
  await batch.commit()

  const old = expired(await listRecordings())
  if (!old.length) return
  const cleanup = writeBatch(where.db)
  old.forEach((r) => remove(cleanup, where, r.id))
  await cleanup.commit()
}

export async function loadAudio(recording) {
  const { audio } = places()
  const found = await getDoc(doc(audio, recording.id))
  if (!found.exists()) throw new Error('missing')
  return new Blob([found.data().audio.toUint8Array()], { type: recording.type })
}

export async function deleteRecording(id) {
  const where = places()
  const batch = writeBatch(where.db)
  remove(batch, where, id)
  await batch.commit()
}
