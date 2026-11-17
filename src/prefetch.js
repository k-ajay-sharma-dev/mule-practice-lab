// Fetches the code of the pages people open most, one by one while the browser is idle, so the first visit to each
// opens at once instead of waiting for its file. The same import() calls as the lazy pages, so the browser keeps one
// copy. Skipped when the connection is slow or the person has asked to save data.
const PAGES = [
  () => import('./pages/ProblemPage.jsx'),
  // the code editor itself comes from a CDN the first time an editor opens; fetching it now saves that wait
  () => import('@monaco-editor/react').then((m) => m.loader.init()),
  () => import('./workspaces/DataWeaveWorkspace.jsx'),
  () => import('./workspaces/FlowWorkspace.jsx'),
  () => import('./workspaces/QuizWorkspace.jsx'),
  () => import('./workspaces/SelfAssessWorkspace.jsx'),
  () => import('./workspaces/ArchWorkspace.jsx'),
  () => import('./workspaces/RamlWorkspace.jsx'),
  () => import('./pages/ReviewPage.jsx'),
  () => import('./pages/TracksPage.jsx'),
  () => import('./pages/SearchPage.jsx'),
  () => import('./pages/FlashcardsPage.jsx'),
  () => import('./pages/CalmPage.jsx'),
]

// A problem's own file loads when a link to it is pointed at or focused, so it is ready by the time it is clicked.
// Any link of the form #/<category>/<id> counts, wherever it is (lists, the dashboard, tracks, review).
export function prefetchOnHover() {
  const seen = new Set()
  const onPoint = (e) => {
    const a = e.target.closest?.('a[href]')
    const m = a?.getAttribute('href')?.match(/#\/[a-z-]+\/([a-z]+-\d+)$/)
    if (!m || seen.has(m[1])) return
    seen.add(m[1])
    import('./data/problems.js').then(({ loadProblem, problemById }) => problemById.has(m[1]) && loadProblem(m[1]).catch(() => seen.delete(m[1])))
  }
  document.addEventListener('pointerover', onPoint, { passive: true })
  document.addEventListener('focusin', onPoint)
}

const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 200))

export function prefetchPages() {
  const c = navigator.connection
  if (c?.saveData || /(^|-)2g$/.test(c?.effectiveType ?? '')) return
  let next = 0
  const step = () => {
    const load = PAGES[next++]
    if (!load) return
    load()
      .catch(() => {}) // a failed prefetch is retried when the page is opened
      .finally(() => idle(step))
  }
  idle(step)
}
