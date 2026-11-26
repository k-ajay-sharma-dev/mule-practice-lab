import { lazy, Suspense, useState } from 'react'
import WideToggle from '../components/WideToggle.jsx'
import ApiManagerScreen from './lab/ApiManagerScreen.jsx'
import ExchangeScreen from './lab/ExchangeScreen.jsx'
import GuidedLabsScreen from './lab/GuidedLabsScreen.jsx'
import PipelineScreen from './lab/PipelineScreen.jsx'
import RuntimeManagerScreen from './lab/RuntimeManagerScreen.jsx'
import './lab/platform-skin.css'

const OpenConsole = lazy(() => import('./anypoint/PlatformLab.jsx').then((m) => ({ default: m.OpenConsole })))
const ConsoleScreen = () => (
  <Suspense fallback={<p className="muted">Loading the console…</p>}>
    <OpenConsole />
  </Suspense>
)

// A product page of the console look: Anypoint's light top bar with the product name, the screen below it.
const product = (Screen, name, short, colour) =>
  function ProductScreen() {
    return (
      <div className="apx lab-skin-light">
        <div className="apx-top">
          <span className="apx-burger" aria-hidden="true">
            ☰
          </span>
          <span className="apx-brand">Anypoint Platform</span>
          <span className="apx-sep" aria-hidden="true">
            ›
          </span>
          <span className="apx-product">
            <span className="apx-dot" style={{ background: colour }} aria-hidden="true">
              {short}
            </span>
            {name}
          </span>
          <span className="apx-env">
            Business group <b>Harbor Lab</b>
          </span>
        </div>
        <div className="apx-body">
          <Screen />
        </div>
      </div>
    )
  }

const VIEWS = [
  ['console', 'Anypoint console', ConsoleScreen],
  ['guided', 'Guided Labs', GuidedLabsScreen],
  ['api', 'API Manager', product(ApiManagerScreen, 'API Manager', 'AM', '#0f7b6c')],
  ['runtime', 'Runtime Manager', product(RuntimeManagerScreen, 'Runtime Manager', 'RM', '#2a5bb8')],
  ['exchange', 'Exchange', product(ExchangeScreen, 'Exchange', 'E', '#0176d3')],
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
        go deeper into one part, and CI/CD runs the release pipeline as a GitHub Actions workflow. This is a simulator based
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
