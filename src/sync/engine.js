// Cloud sync: keeps this browser's progress and your Google account in step through Firestore.
//
//   users/{uid}/progress/{problemId}  { entry: JSON, updatedAt: ISO, syncedAt: server time }  — one per problem
//   users/{uid}/state/{storageKey}    { value: string|null, updatedAt: ms, syncedAt }       — the other keys
//
// The browser stays the working copy (fast, works offline). Each sync pulls only what changed since the last
// pull (by server time, so device clocks don't matter for that), merges it, then pushes what changed here.
// Conflicts: per problem the newer entry wins; activity days are combined; other keys go to the newest write.
import { initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import { onLocalChange, readMeta, SYNCED_KEYS, writeMeta } from '../store/local.js'
import { reloadFromStorage } from '../store/progress.js'
import { EMULATOR_CONFIG, firebaseConfig, useEmulator } from './config.js'
import { setStatus } from './status.js'

const PROGRESS_KEY = 'pl.progress'
const ACTIVITY_KEY = 'pl.activity'
const STATE_KEYS = SYNCED_KEYS.filter((k) => k !== PROGRESS_KEY)
// { uid, lastPull: {seconds, nanoseconds}, pushed: {problemId: updatedAt}, pushedKeys: {key: ms} }
const SYNC_STATE_KEY = 'pl.sync.state'
const BATCH_SIZE = 400 // Firestore allows 500 writes per batch
const REPAIR_VERSION = 1

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return isObject(value) ? value : fallback
  } catch {
    return fallback
  }
}

const readSyncState = () => readJson(SYNC_STATE_KEY, {})
function writeSyncState(next) {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(next))
  } catch {
    // storage blocked: the next sync starts from a full pull
  }
}

// Both devices' days, keeping the higher counts for a day practised on both.
function mergeActivity(a, b) {
  const out = { ...a }
  for (const [day, v] of Object.entries(isObject(b) ? b : {})) {
    if (!isObject(v)) continue
    const mine = isObject(out[day]) ? out[day] : { actions: 0, solved: 0 }
    out[day] = { actions: Math.max(mine.actions || 0, v.actions || 0), solved: Math.max(mine.solved || 0, v.solved || 0) }
  }
  return out
}

let auth
let db
let user = null
let timer = null
let running = false
let again = false
let lastRun = 0

export function start() {
  const app = initializeApp(useEmulator ? EMULATOR_CONFIG : firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }

  onAuthStateChanged(auth, async (u) => {
    user = u
    if (!u) return setStatus({ state: 'signed-out', user: null })
    setStatus({ user: { name: u.displayName, email: u.email, photo: u.photoURL } })

    const synced = readSyncState()
    if (synced.uid && synced.uid !== u.uid) {
      // this browser holds another account's progress: never mix two people's data
      const replace = confirm(
        `This browser has progress saved for a different Google account.\n\nReplace it with the progress of ${u.email}? (The other account's data stays safe in that account.)`,
      )
      if (!replace) return signOut(auth)
      for (const key of [...SYNCED_KEYS, 'pl.sync.meta']) localStorage.removeItem(key)
      writeSyncState({ uid: u.uid })
      reloadFromStorage()
    } else if (!synced.uid) {
      // first sign-in here: whatever this browser already has is uploaded to the account
      writeSyncState({ ...synced, uid: u.uid })
    }
    schedule(0)
  })

  onLocalChange(() => schedule(3000))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRun > 30000) schedule(0)
  })
  window.addEventListener('online', () => schedule(0))
}

function schedule(delay) {
  clearTimeout(timer)
  timer = setTimeout(run, delay)
}

async function run() {
  if (!user) return
  if (running) {
    again = true
    return
  }
  running = true
  setStatus({ state: 'syncing', error: null })
  try {
    await syncOnce(user.uid)
    setStatus({ state: 'synced', lastSync: Date.now(), error: null })
  } catch (error) {
    setStatus(navigator.onLine ? { state: 'error', error: error?.message ?? String(error) } : { state: 'offline' })
  } finally {
    running = false
    lastRun = Date.now()
    if (again) {
      again = false
      schedule(0)
    }
  }
}

async function syncOnce(uid) {
  const synced = readSyncState()
  const ref = (name) => collection(db, 'users', uid, name)
  // One full download per browser: an old bug could drop progress from this browser while the account kept it,
  // and pulling only recent changes would never bring those entries back.
  const repaired = synced.repaired === REPAIR_VERSION
  const since = repaired && synced.lastPull ? new Timestamp(synced.lastPull.seconds, synced.lastPull.nanoseconds) : null
  const pull = (name) => getDocs(since ? query(ref(name), where('syncedAt', '>', since)) : ref(name))
  const [remoteProgress, remoteState] = await Promise.all([pull('progress'), pull('state')])

  // ---- merge what came in (no awaits from here until the writes, so nothing local changes underneath)
  let newest = since
  const seen = (d) => {
    const t = d.get('syncedAt')
    if (t && (!newest || t.valueOf() > newest.valueOf())) newest = t
  }
  const pushed = { ...synced.pushed }
  const pushedKeys = { ...synced.pushedKeys }
  const progress = readJson(PROGRESS_KEY, {})
  let changed = false

  remoteProgress.forEach((d) => {
    seen(d)
    const { entry, updatedAt = '' } = d.data()
    let remote
    try {
      remote = JSON.parse(entry)
    } catch {
      return
    }
    const local = progress[d.id]
    if (!isObject(local) || (local.updatedAt ?? '') < updatedAt) {
      progress[d.id] = remote
      changed = true
    }
    // the account already has this version; a newer local one is still pushed below
    if ((pushed[d.id] ?? '') < updatedAt) pushed[d.id] = updatedAt
  })
  if (changed) localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))

  const meta = readMeta()
  // data saved before sync existed has no change time: treat it as the oldest version, so it is uploaded
  // when the account has none, but never overrides what another device already saved
  for (const key of STATE_KEYS) if (meta[key] == null && localStorage.getItem(key) != null) meta[key] = 1
  remoteState.forEach((d) => {
    seen(d)
    const key = d.id
    if (!STATE_KEYS.includes(key)) return
    const { value = null, updatedAt = 0 } = d.data()
    if (key === ACTIVITY_KEY) {
      let remoteValue = {}
      try {
        remoteValue = JSON.parse(value) ?? {}
      } catch {
        // unreadable remote copy: keep ours and overwrite it below
      }
      const merged = JSON.stringify(mergeActivity(readJson(key, {}), remoteValue))
      if (merged !== localStorage.getItem(key)) {
        localStorage.setItem(key, merged)
        changed = true
      }
      if (merged !== value) meta[key] = Math.max(Date.now(), (pushedKeys[key] ?? 0) + 1) // push the combined days
      return
    }
    if (updatedAt > (meta[key] ?? 0)) {
      if (value == null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
      meta[key] = updatedAt
      pushedKeys[key] = updatedAt
      changed = true
    }
  })
  writeMeta(meta)
  if (changed) reloadFromStorage()

  // ---- push what changed here
  const ops = []
  for (const [id, entry] of Object.entries(readJson(PROGRESS_KEY, {}))) {
    if (!isObject(entry) || typeof entry.updatedAt !== 'string' || entry.updatedAt <= (pushed[id] ?? '')) continue
    ops.push({
      ref: doc(ref('progress'), id),
      data: { entry: JSON.stringify(entry), updatedAt: entry.updatedAt, syncedAt: serverTimestamp() },
      done: () => (pushed[id] = entry.updatedAt),
    })
  }
  for (const key of STATE_KEYS) {
    const at = meta[key] ?? 0
    if (at <= (pushedKeys[key] ?? 0)) continue
    ops.push({
      ref: doc(ref('state'), key),
      data: { value: localStorage.getItem(key), updatedAt: at, syncedAt: serverTimestamp() },
      done: () => (pushedKeys[key] = at),
    })
  }
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)
    chunk.forEach((op) => batch.set(op.ref, op.data))
    await batch.commit()
    chunk.forEach((op) => op.done())
    // record progress after each batch, so an interrupted sync doesn't upload the same things again
    writeSyncState({ ...readSyncState(), uid, pushed, pushedKeys })
  }

  writeSyncState({
    ...readSyncState(),
    uid,
    pushed,
    pushedKeys,
    lastPull: newest ? { seconds: newest.seconds, nanoseconds: newest.nanoseconds } : synced.lastPull,
    repaired: REPAIR_VERSION,
  })
}

const SIGN_IN_ERRORS = {
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/unauthorized-domain': `This address (${location.hostname}) isn't allowed to sign in yet. Add it in Firebase → Authentication → Settings → Authorized domains.`,
  'auth/network-request-failed': "Couldn't reach Google. Check your connection and try again.",
  'auth/operation-not-allowed': 'Google sign-in is not enabled. Turn it on in Firebase → Authentication → Sign-in method.',
}

export async function signIn() {
  setStatus({ error: null })
  try {
    await signInWithPopup(auth, new GoogleAuthProvider())
  } catch (error) {
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code)) return
    setStatus({ error: SIGN_IN_ERRORS[error?.code] ?? error?.message ?? String(error) })
  }
}

// Progress stays in this browser after signing out; signing in again (same account) carries on syncing.
export async function signOutUser() {
  clearTimeout(timer)
  await signOut(auth)
}

export function syncNow() {
  schedule(0)
}
