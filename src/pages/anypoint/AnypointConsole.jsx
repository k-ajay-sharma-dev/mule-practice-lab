import { useEffect, useRef, useState } from 'react'
import { advance, dayText, ENVS, finishDeploys, HOUR, MINUTE, nextJob } from '../../lab/platform.js'
import ApiManager from './ApiManager.jsx'
import DesignCenter from './DesignCenter.jsx'
import Exchange from './Exchange.jsx'
import Monitoring from './Monitoring.jsx'
import RuntimeManager from './RuntimeManager.jsx'
import { ApiClient, Backends, Inbox, Mq, Studio } from './Tools.jsx'
import Visualizer from './Visualizer.jsx'
import { Btn } from './parts.jsx'
import './anypoint.css'

const PRODUCTS = {
  'Design Center': DesignCenter,
  Exchange,
  'API Manager': ApiManager,
  'Runtime Manager': RuntimeManager,
  MQ: Mq,
  Monitoring,
  Visualizer,
  'Anypoint Studio': Studio,
  'API client': ApiClient,
  Backends,
  Inbox,
}
const MENU = [
  ['APIs', [['Design Center', 'Design, mock and publish API specifications.'], ['Exchange', 'Discover and share assets.'], ['API Manager', 'Manage, secure and watch API instances.']]],
  ['Runtimes', [['Runtime Manager', 'Deploy and manage applications.'], ['MQ', 'Queues and messages.'], ['Monitoring', 'Dashboards, alerts and logs.'], ['Visualizer', 'The map of your applications.']]],
  ['Lab tools', [['Anypoint Studio', 'The steps that link an app to an API.'], ['API client', 'Send requests.'], ['Backends', 'Stop or slow a system.'], ['Inbox', 'Mail that alerts send.']]],
]
const COLOR = { 'Design Center': '#0b5cab', Exchange: '#0176d3', 'API Manager': '#0b827c', 'Runtime Manager': '#2e5bba', MQ: '#7f56d9', Monitoring: '#1b6fd0', Visualizer: '#0f6e84', Backends: '#8a4b08', 'Anypoint Studio': '#525f7f', 'API client': '#b86e00', Inbox: '#525f7f' }
const Badge = ({ name }) => (
  <span className="pc-badge" style={{ background: COLOR[name] ?? '#0176d3' }} aria-hidden="true">
    {name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
  </span>
)

const STARTING_MS = 1400

// `onChange` takes an updater. `guide` is drawn beside the pages, for a lab.
export default function AnypointConsole({ state, onChange: update, guide, title }) {
  const [place, setPlace] = useState({ product: 'Home' })
  const [menu, setMenu] = useState(false)
  const [full, setFull] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [envs, setEnvs] = useState(false)
  const root = useRef(null)
  const starting = state.apps.some((a) => a.status === 'Starting')

  useEffect(() => {
    if (!starting) return undefined
    const timer = setTimeout(() => update(finishDeploys), STARTING_MS)
    return () => clearTimeout(timer)
  }, [starting, update])

  useEffect(() => {
    if (!full) return undefined
    const key = (e) => e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.pc-modal') && setFull(false)
    document.addEventListener('keydown', key)
    document.documentElement.classList.add('pc-locked')
    return () => {
      document.removeEventListener('keydown', key)
      document.documentElement.classList.remove('pc-locked')
    }
  }, [full])

  useEffect(() => {
    root.current?.querySelector('.pc-main')?.scrollTo(0, 0)
  }, [place])

  function go(next) {
    setMenu(false)
    setEnvs(false)
    if (next.env && next.env !== state.env) update((s) => ({ ...s, env: next.env }))
    // the ID of a new API instance is known only after the state has changed
    setPlace((p) => ({ product: p.product, ...next }))
  }
  const setEnv = (env) => {
    update((s) => ({ ...s, env }))
    setEnvs(false)
    setPlace((p) => ({ product: p.product }))
  }
  const Page = PRODUCTS[place.product]
  const shown = place.lastApi ? { product: place.product, api: state.lastApi } : place
  const job = nextJob(state)
  const move = (ms) => update((s) => advance(s, ms))
  const unread = state.mail.filter((m) => m.t > (state.seen.inbox ?? -1)).length

  return (
    <div ref={root} className={`pc-skin pc-shell${full ? ' pc-full' : ''}`}>
      <div className="pc-clock" aria-label="Lab clock">
        <b>{dayText(state.clock)}</b>
        <span>Move the lab clock:</span>
        <Btn onClick={() => move(MINUTE)}>+1 min</Btn>
        <Btn onClick={() => move(5 * MINUTE)}>+5 min</Btn>
        <Btn onClick={() => move(15 * MINUTE)}>+15 min</Btn>
        <Btn onClick={() => move(HOUR)}>+1 hour</Btn>
        <Btn disabled={job === null} title={job === null ? 'No schedule is enabled' : dayText(job)} onClick={() => move(job - state.clock)}>
          Next job
        </Btn>
        <span className="pc-grow" />
        {guide && <Btn onClick={() => setShowGuide(!showGuide)}>{showGuide ? 'Hide steps' : 'Show steps'}</Btn>}
        <Btn onClick={() => setFull(!full)}>{full ? 'Exit full screen' : 'Full screen'}</Btn>
      </div>
      <header className="pc-top">
        <button type="button" className="pc-burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          ☰
        </button>
        {place.product !== 'Home' && <Badge name={place.product} />}
        <b className="pc-grow">{place.product === 'Home' ? 'Anypoint Platform' : place.product}</b>
        <button type="button" className="pc-top-btn" onClick={() => go({ product: 'Inbox' })}>
          Inbox{unread > 0 && <i>{unread}</i>}
        </button>
        <span className="pc-org">Harbor Lab</span>
        <span className="pc-avatar" aria-hidden="true">
          YO
        </span>
      </header>
      <div className={`pc-body${guide && showGuide ? ' with-guide' : ''}`}>
        <div className="pc-page">
          {menu && (
            <nav className="pc-drawer" aria-label="Products">
              <button type="button" onClick={() => { setMenu(false); setPlace({ product: 'Home' }) }}>
                Anypoint Platform home
              </button>
              {MENU.map(([name, list]) => (
                <div key={name}>
                  <b>{name}</b>
                  {list.map(([p]) => (
                    <button key={p} type="button" className={p === place.product ? 'on' : ''} onClick={() => { setMenu(false); setPlace({ product: p }) }}>
                      <Badge name={p} /> {p}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          )}
          {envs && (
            <div className="pc-envs" role="dialog" aria-label="Environments">
              <b>Select an environment</b>
              {ENVS.map((e) => (
                <button key={e} type="button" className={e === state.env ? 'on' : ''} onClick={() => setEnv(e)}>
                  {e}
                </button>
              ))}
              <Btn onClick={() => setEnvs(false)}>Cancel</Btn>
            </div>
          )}
          {Page ? <Page state={state} update={update} place={shown} go={go} openEnv={() => setEnvs(!envs)} /> : <Home go={setPlace} title={title} />}
        </div>
        {guide && showGuide && <aside className="pc-guide">{guide}</aside>}
      </div>
    </div>
  )
}

function Home({ go, title }) {
  return (
    <main className="pc-main pc-home">
      <div className="pc-hello">
        <h2>{title ?? 'Welcome'}</h2>
        <p>Choose a product to start. Every page works on the same practice environment.</p>
      </div>
      <div className="pc-home-grid">
        {MENU.map(([name, list]) => (
          <section key={name}>
            <h3>{name}</h3>
            {list.map(([p, text]) => (
              <button key={p} type="button" onClick={() => go({ product: p })}>
                <Badge name={p} />
                <span>
                  <b>{p}</b>
                  <small>{text}</small>
                </span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </main>
  )
}
