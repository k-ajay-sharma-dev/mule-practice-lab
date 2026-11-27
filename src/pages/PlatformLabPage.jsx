import { lazy, Suspense, useState } from 'react'
import WideToggle from '../components/WideToggle.jsx'
import './lab/platform-skin.css'

const Systems = lazy(() => import('./anypoint/SystemsConsole.jsx'))
const GuidedLabs = lazy(() => import('./lab/GuidedLabsScreen.jsx'))
const loading = (Screen, text) =>
  function Loading() {
    return (
      <Suspense fallback={<p className="muted">{text}</p>}>
        <Screen />
      </Suspense>
    )
  }
const GuidedLabsScreen = loading(GuidedLabs, 'Loading the guided labs…')

const SystemsScreen = () => (
  <Suspense fallback={<p className="muted">Loading the console…</p>}>
    <Systems />
  </Suspense>
)

// API Manager, Runtime Manager and Exchange live in the console. Their deeper drills are under Practice drills on
// the console's home page.
const VIEWS = [
  ['systems', 'Platform and systems', SystemsScreen],
  ['guided', 'Guided Labs', GuidedLabsScreen],
]

export default function PlatformLabPage() {
  const [view, setView] = useState('systems')

  return (
    <div className="lab-page">
      <p className="eyebrow">// platform lab</p>
      <div className="lab-head">
        <h1>Platform Lab</h1>
        <WideToggle />
      </div>
      <p className="muted">
        Practise Anypoint Platform tasks and see their effect. Platform and systems lists Anypoint Platform and every
        outside system (Salesforce, SAP, Kafka, Epic, AWS and more), all in one practice environment. Its CI/CD pipeline
        runs the release as a GitHub Actions workflow. Guided Labs walk you through a task step by step. This is a simulator based
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
