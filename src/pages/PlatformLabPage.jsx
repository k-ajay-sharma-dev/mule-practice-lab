import { useState } from 'react'
import ApiManagerScreen from './lab/ApiManagerScreen.jsx'
import GuidedLabsScreen from './lab/GuidedLabsScreen.jsx'
import RuntimeManagerScreen from './lab/RuntimeManagerScreen.jsx'

const VIEWS = [
  ['api', 'API Manager', ApiManagerScreen],
  ['runtime', 'Runtime Manager', RuntimeManagerScreen],
  ['guided', 'Guided Labs', GuidedLabsScreen],
]

export default function PlatformLabPage() {
  const [view, setView] = useState('api')

  return (
    <div className="lab-page">
      <p className="eyebrow">// platform lab</p>
      <h1>Platform Lab</h1>
      <p className="muted">
        Practise API Manager and Runtime Manager tasks and see their effect. This is a simulator based on the Mule Gateway
        and CloudHub 2.0 documentation. It is not connected to Anypoint Platform and sends nothing over the network.
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
