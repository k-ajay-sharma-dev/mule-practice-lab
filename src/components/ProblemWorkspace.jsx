import { lazy, Suspense } from 'react'
import { exerciseOf } from '../data/exercises.js'
import { useProblem } from '../data/problems.js'

// Each workspace (code editor, flow designer, architecture designer, quiz…) is its own chunk.
const WORKSPACES = {
  code: lazy(() => import('../workspaces/DataWeaveWorkspace.jsx')),
  flow: lazy(() => import('../workspaces/FlowWorkspace.jsx')),
  diagram: lazy(() => import('../workspaces/ArchWorkspace.jsx')),
  quiz: lazy(() => import('../workspaces/QuizWorkspace.jsx')),
  written: lazy(() => import('../workspaces/SelfAssessWorkspace.jsx')),
}
WORKSPACES.investigation = WORKSPACES.quiz

const loading = <div className="workspace-loading muted small">Loading problem…</div>

// Loads a problem's full content on demand and shows the workspace for its exercise type.
export default function ProblemWorkspace({ id }) {
  const problem = useProblem(id)
  if (!problem) return loading
  const Workspace = WORKSPACES[exerciseOf(problem)]
  return (
    <Suspense fallback={loading}>
      {/* key resets editor state when moving between problems */}
      <Workspace key={problem.id} problem={problem} />
    </Suspense>
  )
}
