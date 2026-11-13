// The last page you were on that is not a problem, so a problem's back link returns there: to the Learning Path,
// Review or Weak Areas when you came from one of them, not always to the problem's category.
// Kept per browser tab (sessionStorage), so a reload keeps it and another tab has its own.
const KEY = 'pl.origin'

const LABELS = {
  '/': 'Learning Path',
  '/tracks': 'Topic Tracks',
  '/review': 'Review',
  '/flashcards': 'Flashcards',
  '/mock': 'Mock Interview',
  '/exam': 'Practice Exam',
  '/interview': 'Interview Practice',
  '/weak-areas': 'Weak Areas',
  '/readiness': 'Readiness',
  '/projects': 'My Projects',
  '/logging': 'Logging Lab',
  '/calm': 'Calm Corner',
  '/playground': 'Playground',
  '/platform-lab': 'Platform Lab',
  '/cheatsheets': 'Cheat Sheets',
  '/search': 'Search',
  '/settings': 'Settings',
}

// pathname is the route ("/review", "/dataweave"); categoryLabel names a category page, when it is one.
export function rememberOrigin(pathname, search = '', categoryLabel = null) {
  const top = `/${pathname.split('/')[1] ?? ''}`
  const label = categoryLabel ?? LABELS[top]
  if (!label) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path: pathname + search, label }))
  } catch {
    // storage blocked: the back link falls back to the category
  }
}

export function readOrigin() {
  try {
    const found = JSON.parse(sessionStorage.getItem(KEY))
    return found && typeof found.path === 'string' && typeof found.label === 'string' && found.path.startsWith('/') ? found : null
  } catch {
    return null
  }
}
