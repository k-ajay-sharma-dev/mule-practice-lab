import { lazy, Suspense, useState } from 'react'
import WideToggle from '../components/WideToggle.jsx'
import './lab/platform-skin.css'

const OpenConsole = lazy(() => import('./anypoint/OpenConsole.jsx'))
const GuidedLabs = lazy(() => import('./lab/GuidedLabsScreen.jsx'))
const Pipeline = lazy(() => import('./lab/PipelineScreen.jsx'))
const loading = (Screen, text) =>
  function Loading() {
    return (
      <Suspense fallback={<p className="muted">{text}</p>}>
        <Screen />
      </Suspense>
    )
  }
const GuidedLabsScreen = loading(GuidedLabs, 'Loading the guided labs…')
const PipelineScreen = loading(Pipeline, 'Loading the pipeline…')
const ConsoleScreen = () => (
  <Suspense fallback={<p className="muted">Loading the console…</p>}>
    <OpenConsole />
  </Suspense>
)

// API Manager, Runtime Manager and Exchange live in the console. Their deeper drills are under Practice drills on
// the console's home page.
const VIEWS = [
  ['console', 'Anypoint console', ConsoleScreen],
  ['guided', 'Guided Labs', GuidedLabsScreen],
  ['pipeline', 'CI/CD', PipelineScreen],
]

export default function PlatformLabPage() {
  const [view, setView] = useState('console')

  return (
    <div className="lab-page">
      <p className="eyebrow">// platform lab</p>
      <div className="lab-head">
        <h1>Platform Lab</h1>
        <WideToggle />
      </div>
      <p className="muted">
        Practise Anypoint Platform tasks and see their effect. The console follows the pages of the platform, with deeper
        practice drills on its home page. Guided Labs walk you through a task step by step, and CI/CD runs the release
        pipeline as a GitHub Actions workflow. This is a simulator based
        on the MuleSoft documentation. It is not made by MuleSoft, is not connected to Anypoint Platform or GitHub and sends
        nothing over the network.
      </p>

      <div className="lab-tabs lab-views" role="tablist" aria-label="Platform Lab sections">
        {VIEWS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={view === key} className={`lab-tab${view === key ? ' active' : ''}`} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* every screen stays mounted so its clock and results survive a tab change */}
      {VIEWS.map(([key, , Screen]) => (
        <div key={key} role="tabpanel" hidden={view !== key}>
          <Screen />
        </div>
      ))}
    </div>
  )
}
