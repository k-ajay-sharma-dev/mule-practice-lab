import { categoryBySlug } from './categories.js'

// What the learner does on a problem. Problems in "self" categories get an interactive exercise when
// their content provides one, and fall back to a written, self-assessed answer otherwise.
export function exerciseOf(problem) {
  if (problem.exercise) return problem.exercise // already worked out in the problem index
  const kind = categoryBySlug.get(problem.category)?.kind
  if (kind === 'code' || kind === 'flow' || kind === 'raml') return kind
  if (problem.diagram) return 'diagram'
  if (problem.investigation) return 'investigation'
  if (problem.quiz) return 'quiz'
  return 'written'
}

export const EXERCISE_LABELS = {
  code: 'Code',
  flow: 'Flow design',
  raml: 'RAML',
  diagram: 'Architecture',
  investigation: 'Investigate',
  quiz: 'Quiz',
  written: 'Written',
}
