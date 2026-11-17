import { useEffect, useState } from 'react'

// Where you were inside each problem (the open tab and how far down the left panel was scrolled), so coming back
// to a problem opens it the way you left it. Kept in this browser only, for the 60 problems opened last.
const KEY = 'pl.view'
const MAX = 60

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function readView(id) {
  return readAll()[id] ?? {}
}

export function saveView(id, patch) {
  try {
    const all = readAll()
    all[id] = { ...all[id], ...patch, at: Date.now() }
    const ids = Object.keys(all)
    if (ids.length > MAX) {
      ids.sort((a, b) => (all[a].at ?? 0) - (all[b].at ?? 0))
      for (const old of ids.slice(0, ids.length - MAX)) delete all[old]
    }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage blocked: the problem opens at its first tab next time
  }
}

// useState for a workspace tab that comes back on the next visit. allowed lists the tabs that may be restored.
export function useProblemTab(id, initial, allowed) {
  const [tab, setTab] = useState(() => {
    const saved = readView(id).tab
    return saved && (!allowed || allowed.includes(saved)) ? saved : initial
  })
  useEffect(() => saveView(id, { tab }), [id, tab])
  return [tab, setTab]
}

// Puts the left panel back where it was scrolled, once the workspace has drawn, and keeps the place as you scroll.
export function useScrollMemory(id) {
  useEffect(() => {
    let body = null
    let tries = 0
    let timer = null
    let saveTimer = null
    const onScroll = () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => saveView(id, { scroll: Math.round(body.scrollTop) }), 250)
    }
    const attach = () => {
      body = document.querySelector('.problem-page .left-panel .panel-body')
      if (!body) {
        if (tries++ < 20) timer = setTimeout(attach, 100)
        return
      }
      const top = readView(id).scroll
      // the text may still be drawing, so the panel can be too short at first: keep trying for a moment
      let left = 15
      const restore = () => {
        body.scrollTop = top
        if (Math.abs(body.scrollTop - top) > 2 && left-- > 0) timer = setTimeout(restore, 100)
        else body.addEventListener('scroll', onScroll, { passive: true })
      }
      if (top > 0) restore()
      else body.addEventListener('scroll', onScroll, { passive: true })
    }
    attach()
    return () => {
      clearTimeout(timer)
      clearTimeout(saveTimer)
      body?.removeEventListener('scroll', onScroll)
    }
  }, [id])
}
