import { lazy, Suspense } from 'react'
import { exerciseOf } from '../data/exercises.js'
import { useProblem } from '../data/problems.js'

// Each workspace (code editor, flow designer, architecture designer, quiz…) is its own chunk.
const WORKSPACES = {
  code: lazy(() => import('../workspaces/DataWeaveWorkspace.jsx')),
  flow: lazy(() => import('../workspaces/FlowWorkspace.jsx')),
  raml: lazy(() => import('../workspaces/RamlWorkspace.jsx')),
  diagram: lazy(() => import('../workspaces/ArchWorkspace.jsx')),
  quiz: lazy(() => import('../workspaces/QuizWorkspace.jsx')),
  written: lazy(() => import('../workspaces/SelfAssessWorkspace.jsx')),
}
WORKSPACES.investigation = WORKSPACES.quiz

const loading = <div className="workspace-loading muted small">Loading problem…</div>

// clock: what a full screen designer shows as its clock, when it is not the problem timer (a mock interview).
// Loads a problem's full content on demand and shows the workspace for its exercise type.
export default function ProblemWorkspace({ id, guided = true, clock }) {
  const problem = useProblem(id)
  if (!problem) return loading
  const Workspace = WORKSPACES[exerciseOf(problem)]
  return (
    <Suspense fallback={loading}>
      {/* key resets editor state when moving between problems */}
      <Workspace key={problem.id} problem={problem} guided={guided} clock={clock} />
    </Suspense>
  )
}
