import { useSyncExternalStore } from 'react'
import { cleanStories, newStoryId, withPractice } from '../study/stories.js'
import { onLocalChange, writeLocal } from './local.js'

// My Stories, kept in this browser and, when you are signed in, in your Google account through the usual sync.
// They are never part of the site's code.
export const STORIES_KEY = 'pl.stories'

let raw = null
let cache = []
// Sync writes storage directly when it pulls, so the copy is checked against storage on every read.
function read() {
  let now = null
  try {
    now = localStorage.getItem(STORIES_KEY)
  } catch {
    return cache
  }
  if (now !== raw) {
    raw = now
    try {
      cache = cleanStories(JSON.parse(now))
    } catch {
      cache = []
    }
  }
  return cache
}

function subscribe(listener) {
  const off = onLocalChange((key) => key === STORIES_KEY && listener())
  // a pull from the account lands while the page is open, or another tab changes the stories
  const onStorage = (e) => (e.key === null || e.key === STORIES_KEY) && listener()
  const onFocus = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', onFocus)
  return () => {
    off()
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', onFocus)
  }
}

export const useStories = () => useSyncExternalStore(subscribe, read)

const write = (list) => writeLocal(STORIES_KEY, list.length ? JSON.stringify(list) : null)

export function saveStory(story) {
  const saved = { ...story, id: story.id || newStoryId(), updatedAt: new Date().toISOString(), practice: story.practice ?? [] }
  write([saved, ...read().filter((s) => s.id !== saved.id)])
  return saved.id
}

export function deleteStory(id) {
  write(read().filter((s) => s.id !== id))
}

export function recordPractice(id, result) {
  write(read().map((s) => (s.id === id ? withPractice(s, result) : s)))
}
