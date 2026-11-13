// Fetches the code of the pages people open most, one by one while the browser is idle, so the first visit to each
// opens at once instead of waiting for its file. The same import() calls as the lazy pages, so the browser keeps one
// copy. Skipped when the connection is slow or the person has asked to save data.
const PAGES = [
  () => import('./pages/ProblemPage.jsx'),
  () => import('./workspaces/DataWeaveWorkspace.jsx'),
  () => import('./workspaces/FlowWorkspace.jsx'),
  () => import('./workspaces/QuizWorkspace.jsx'),
  () => import('./workspaces/SelfAssessWorkspace.jsx'),
  () => import('./workspaces/ArchWorkspace.jsx'),
  () => import('./workspaces/RamlWorkspace.jsx'),
  () => import('./pages/LoggingPage.jsx'),
  () => import('./pages/ReviewPage.jsx'),
  () => import('./pages/TracksPage.jsx'),
  () => import('./pages/SearchPage.jsx'),
  () => import('./pages/FlashcardsPage.jsx'),
  () => import('./pages/CalmPage.jsx'),
]

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
