import { useEffect, useState } from 'react'
import index from 'virtual:problem-index'

// `problems` is the lightweight index: id, category, title, level, tags, estMinutes, exercise, cards. The search
// summaries load with the Search page (src/data/search.js).
// The full problem (description, solution, exercise data…) lives in its own chunk and is loaded on demand.
const loaders = import.meta.glob('../content/*/*.js')

export const problems = index

export const problemById = new Map(problems.map((p) => [p.id, p]))

export function problemsFor(category) {
  return problems.filter((p) => p.category === category)
}

const cache = new Map()

export function loadProblem(id) {
  const meta = problemById.get(id)
  if (!meta) return Promise.resolve(null)
  if (!cache.has(id)) {
    const load = loaders[`../content/${meta.category}/${id}.js`]
    if (!load) return Promise.reject(new Error(`No content file for ${id}`))
    const pending = load()
      .then((m) => m?.default ?? Promise.reject(new Error(`Failed to load ${id}`)))
      .catch((error) => {
        // forget the failure so a later visit (e.g. back online) tries again
        cache.delete(id)
        throw error
      })
    cache.set(id, pending)
  }
  return cache.get(id)
}

export function loadProblems(ids) {
  return Promise.all(ids.map(loadProblem))
}

// Full problem for a page: undefined while loading, null if the id does not exist.
// A failed load is thrown during render so the page's error boundary offers a reload.
export function useProblem(id) {
  const [state, setState] = useState({ id, problem: undefined })
  useEffect(() => {
    let live = true
    loadProblem(id).then(
      (problem) => live && setState({ id, problem }),
      (error) => live && setState({ id, error }),
    )
    return () => {
      live = false
    }
  }, [id])
  if (state.id !== id) return undefined
  if (state.error) throw state.error
  return state.problem
}
