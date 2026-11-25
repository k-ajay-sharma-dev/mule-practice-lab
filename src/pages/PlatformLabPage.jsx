import { lazy, Suspense, useState } from 'react'
import WideToggle from '../components/WideToggle.jsx'
import ApiManagerScreen from './lab/ApiManagerScreen.jsx'
import ExchangeScreen from './lab/ExchangeScreen.jsx'
import GuidedLabsScreen from './lab/GuidedLabsScreen.jsx'
import PipelineScreen from './lab/PipelineScreen.jsx'
import RuntimeManagerScreen from './lab/RuntimeManagerScreen.jsx'

const OpenConsole = lazy(() => import('./anypoint/PlatformLab.jsx').then((m) => ({ default: m.OpenConsole })))
const ConsoleScreen = () => (
  <Suspense fallback={<p className="muted">Loading the console…</p>}>
    <OpenConsole />
  </Suspense>
)

const VIEWS = [
  ['console', 'Anypoint console', ConsoleScreen],
  ['guided', 'Guided Labs', GuidedLabsScreen],
  ['api', 'API Manager', ApiManagerScreen],
  ['runtime', 'Runtime Manager', RuntimeManagerScreen],
  ['exchange', 'Exchange', ExchangeScreen],
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
        Practise Anypoint Platform tasks and see their effect. The console follows the pages of the platform. The other tabs
        go deeper into one part. This is a simulator based on the MuleSoft documentation. It is not made by MuleSoft, is not
        connected to Anypoint Platform and sends nothing over the network.
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
