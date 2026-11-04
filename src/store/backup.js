import { SYNCED_KEYS, writeLocal } from './local.js'

// A backup file you keep yourself: everything that cloud sync carries, in one JSON file.
const APP = 'mule-practice-lab'

export function exportBackup() {
  const data = {}
  for (const key of SYNCED_KEYS) {
    const value = localStorage.getItem(key)
    if (value != null) data[key] = value
  }
  const file = { app: APP, version: 1, exportedAt: new Date().toISOString(), data }
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `mule-practice-lab-backup-${new Date().toLocaleDateString('en-CA')}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const parse = (s) => {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// Restores a backup into this browser. Problems merge — for each one the newer version wins, so restoring an
// old file never throws away newer work; practice days are combined; everything else is taken from the file.
// Returns the number of problems in the file. Throws with a readable message for a wrong file.
export async function importBackup(file) {
  const backup = parse(await file.text())
  if (!isObject(backup) || backup.app !== APP || !isObject(backup.data)) {
    throw new Error("That file isn't a Mule Practice Lab backup.")
  }
  const { data } = backup

  const fromFile = parse(data['pl.progress'])
  const progress = isObject(parse(localStorage.getItem('pl.progress'))) ? parse(localStorage.getItem('pl.progress')) : {}
  let problems = 0
  if (isObject(fromFile)) {
    for (const [id, entry] of Object.entries(fromFile)) {
      if (!isObject(entry)) continue
      problems++
      if (!isObject(progress[id]) || (progress[id].updatedAt ?? '') < (entry.updatedAt ?? '')) progress[id] = entry
    }
    writeLocal('pl.progress', JSON.stringify(progress))
  }

  const days = parse(data['pl.activity'])
  if (isObject(days)) {
    const merged = isObject(parse(localStorage.getItem('pl.activity'))) ? parse(localStorage.getItem('pl.activity')) : {}
    for (const [day, v] of Object.entries(days)) {
      if (!isObject(v)) continue
      const mine = isObject(merged[day]) ? merged[day] : { actions: 0, solved: 0 }
      merged[day] = { actions: Math.max(mine.actions || 0, v.actions || 0), solved: Math.max(mine.solved || 0, v.solved || 0) }
    }
    writeLocal('pl.activity', JSON.stringify(merged))
  }

  for (const key of SYNCED_KEYS) {
    if (key === 'pl.progress' || key === 'pl.activity') continue
    if (typeof data[key] === 'string') writeLocal(key, data[key])
  }
  return problems
}
