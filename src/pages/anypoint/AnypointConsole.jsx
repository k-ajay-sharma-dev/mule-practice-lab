import { useEffect, useRef, useState } from 'react'
import { advance, dayText, ENVS, finishDeploys, HOUR, MINUTE, nextJob } from '../../lab/platform.js'
import ApiManager from './ApiManager.jsx'
import DesignCenter from './DesignCenter.jsx'
import Exchange from './Exchange.jsx'
import Monitoring from './Monitoring.jsx'
import RuntimeManager from './RuntimeManager.jsx'
import { ApiClient, Backends, Inbox, Studio } from './Tools.jsx'
import AnypointMQ from './AnypointMQ.jsx'
import { DataCenter } from './Servers.jsx'
import KafkaUI from './KafkaUI.jsx'
import SftpClient from './SftpClient.jsx'
import { BlobStorage, FileShares, KeyVault } from './AzurePortal.jsx'
import DbConsole from './DbConsole.jsx'
import MailServer from './MailServer.jsx'
import ServiceBus from './ServiceBus.jsx'
import JmsBroker from './JmsBroker.jsx'
import PrivateSpaces from './PrivateSpaces.jsx'
import FlowEditor from './FlowEditor.jsx'
import BatchMonitor from './BatchMonitor.jsx'
import Visualizer from './Visualizer.jsx'
import { Btn } from './parts.jsx'
import ApiManagerScreen from '../lab/ApiManagerScreen.jsx'
import ExchangeScreen from '../lab/ExchangeScreen.jsx'
import RuntimeManagerScreen from '../lab/RuntimeManagerScreen.jsx'
import './anypoint.css'
import '../lab/platform-skin.css'

// Focused drills that go deeper into one product. Each keeps its own practice data, apart from the console's.
const drill = (Screen, text) =>
  function Drill({ go }) {
    return (
      <main className="pc-main pc-drill">
        <p className="pc-drill-note">
          {text} This drill has its own practice data, so nothing here changes the console's apps and APIs.{' '}
          <button type="button" className="pc-link" onClick={() => go({ product: 'Home' })}>
            Back to home
          </button>
        </p>
        <div className="lab-skin-light pc-drill-body">
          <Screen />
        </div>
      </main>
    )
  }

const PRODUCTS = {
  'Design Center': DesignCenter,
  Exchange,
  'API Manager': ApiManager,
  'Runtime Manager': RuntimeManager,
  MQ: AnypointMQ,
  Monitoring,
  Visualizer,
  'Anypoint Studio': Studio,
  'API client': ApiClient,
  Backends,
  Inbox,
  'Data center': DataCenter,
  Kafka: KafkaUI,
  'SFTP and FTP': SftpClient,
  'Azure Blob Storage': BlobStorage,
  'Azure Files': FileShares,
  'Azure Key Vault': KeyVault,
  'Databases': DbConsole,
  'Mail server': MailServer,
  'Azure Service Bus': ServiceBus,
  ActiveMQ: JmsBroker,
  'Private spaces': PrivateSpaces,
  'Flow editor': FlowEditor,
  'Batch jobs': BatchMonitor,
  'Policy test bench': drill(ApiManagerScreen, 'Apply policies in order, then send requests and see which policy decides.'),
  'Deployment drill': drill(RuntimeManagerScreen, 'Deploy with properties, scale, read the logs and roll back.'),
  'Exchange versioning': drill(ExchangeScreen, 'Publish versions, change their lifecycle and see which numbers stay reserved.'),
}
const MENU = [
  ['APIs', [['Design Center', 'Design, mock and publish API specifications.'], ['Exchange', 'Discover and share assets.'], ['API Manager', 'Manage, secure and watch API instances.']]],
  ['Runtimes', [['Runtime Manager', 'Deploy and manage applications.'], ['ActiveMQ', 'Apache ActiveMQ Classic and Artemis brokers for JMS: queues, topics, durable subscribers.'], ['MQ', 'Anypoint MQ: queues, exchanges and client apps.'], ['Batch jobs', 'Batch job instances, steps and failed records.'], ['Private spaces', 'CloudHub 2.0 networking: static IPs, VPN, DNS and firewall.'], ['Monitoring', 'Dashboards, alerts and logs.'], ['Visualizer', 'The map of your applications.']]],
  ['Systems', [['Kafka', 'Apache Kafka: brokers, topics, consumer groups and schemas.'], ['SFTP and FTP', 'A file transfer client on the SFTP and FTP servers.'], ['Azure Blob Storage', 'Containers, blobs, SAS tokens and access keys.'], ['Azure Files', 'File shares of the storage account.'], ['Azure Key Vault', 'Secrets, versions and access policies.'], ['Azure Service Bus', 'Queues, topics, subscriptions and sessions.'], ['Databases', 'SQL Server and Oracle: query, sessions, locks, plans.'], ['Mail server', 'SMTP and IMAP mailboxes.']]],
  ['Lab tools', [['Anypoint Studio', 'The steps that link an app to an API.'], ['Flow editor', 'The Mule configuration XML of an app.'], ['API client', 'Send requests.'], ['Backends', 'Stop or slow a system.'], ['Data center', 'Your Windows servers: files, PowerShell and the link to Anypoint.'], ['Inbox', 'Mail that alerts send.']]],
  ['Practice drills', [['Policy test bench', 'Policy order, quotas and the headers a request gets.'], ['Deployment drill', 'Properties, replicas, logs and rollback.'], ['Exchange versioning', 'Versions, lifecycle and reserved numbers.']]],
]
const COLOR = {
  'Policy test bench': '#0b827c',
  'Deployment drill': '#2e5bba',
  Kafka: '#231f20',
  'SFTP and FTP': '#b5332e',
  'Azure Blob Storage': '#0078d4',
  'Azure Files': '#0062ad',
  'Azure Key Vault': '#5c2d91',
  'Azure Service Bus': '#0072c6',
  ActiveMQ: '#8a3b12',
  Databases: '#a4262c',
  'Mail server': '#3a6b35',
  'Private spaces': '#1f4e79',
  'Flow editor': '#3d4f6b',
  'Batch jobs': '#6b4fa3',
  'Exchange versioning': '#0176d3', 'Design Center': '#0b5cab', Exchange: '#0176d3', 'API Manager': '#0b827c', 'Runtime Manager': '#2e5bba', MQ: '#7f56d9', Monitoring: '#1b6fd0', Visualizer: '#0f6e84', Backends: '#8a4b08', 'Data center': '#00539b', 'Anypoint Studio': '#525f7f', 'API client': '#b86e00', Inbox: '#525f7f' }
const Badge = ({ name }) => (
  <span className="pc-badge" style={{ background: COLOR[name] ?? '#0176d3' }} aria-hidden="true">
    {name.split(' ').map((w) => w[0].toUpperCase()).join('').slice(0, 2)}
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
