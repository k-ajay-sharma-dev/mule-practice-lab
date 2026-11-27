import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { advance, dayText, ENVS, finishDeploys, HOUR, MINUTE, nextJob } from '../../lab/platform.js'
import { Btn } from './parts.jsx'
import './anypoint.css'
import '../lab/platform-skin.css'

// Each product page is downloaded the first time it is opened, so the console itself opens faster.
const page = (load, name = 'default') => lazy(() => load().then((m) => ({ default: m[name] })))
const ApiManager = page(() => import('./ApiManager.jsx'))
const DesignCenter = page(() => import('./DesignCenter.jsx'))
const Exchange = page(() => import('./Exchange.jsx'))
const Monitoring = page(() => import('./Monitoring.jsx'))
const RuntimeManager = page(() => import('./RuntimeManager.jsx'))
const ApiClient = page(() => import('./Tools.jsx'), 'ApiClient')
const Backends = page(() => import('./Tools.jsx'), 'Backends')
const Inbox = page(() => import('./Tools.jsx'), 'Inbox')
const Studio = page(() => import('./Tools.jsx'), 'Studio')
const AnypointMQ = page(() => import('./AnypointMQ.jsx'))
const DataCenter = page(() => import('./Servers.jsx'), 'DataCenter')
const KafkaUI = page(() => import('./KafkaUI.jsx'))
const SftpClient = page(() => import('./SftpClient.jsx'))
const BlobStorage = page(() => import('./AzurePortal.jsx'), 'BlobStorage')
const FileShares = page(() => import('./AzurePortal.jsx'), 'FileShares')
const KeyVault = page(() => import('./AzurePortal.jsx'), 'KeyVault')
const DbConsole = page(() => import('./DbConsole.jsx'))
const MailServer = page(() => import('./MailServer.jsx'))
const ServiceBus = page(() => import('./ServiceBus.jsx'))
const JmsBroker = page(() => import('./JmsBroker.jsx'))
const PrivateSpaces = page(() => import('./PrivateSpaces.jsx'))
const FlowEditor = page(() => import('./FlowEditor.jsx'))
const BatchMonitor = page(() => import('./BatchMonitor.jsx'))
const Visualizer = page(() => import('./Visualizer.jsx'))
const Salesforce = page(() => import('./Salesforce.jsx'))
const SapGui = page(() => import('./SapGui.jsx'))
const Splunk = page(() => import('./Splunk.jsx'))
const RuntimeFabric = page(() => import('./RuntimeFabric.jsx'))
const FlexGateway = page(() => import('./FlexGateway.jsx'))
const PartnerManager = page(() => import('./PartnerManager.jsx'))
const Governance = page(() => import('./Governance.jsx'))
const AccessManagement = page(() => import('./AccessManagement.jsx'))
const ReleaseBoard = page(() => import('./ReleaseBoard.jsx'))
const SecureProps = page(() => import('./SecureProps.jsx'))
const CapacityPlanner = page(() => import('./CapacityPlanner.jsx'))
const EpicFhir = page(() => import('./EpicFhir.jsx'))
const Hl7Engine = page(() => import('./Hl7Engine.jsx'))
const Workday = page(() => import('./Workday.jsx'))
const ServiceNow = page(() => import('./ServiceNow.jsx'))
const Snowflake = page(() => import('./Snowflake.jsx'))
const AwsConsole = page(() => import('./AwsConsole.jsx'))
const Dynamics = page(() => import('./Dynamics.jsx'))
const Shopify = page(() => import('./Shopify.jsx'))
const ApiManagerScreen = page(() => import('../lab/ApiManagerScreen.jsx'))
const ExchangeScreen = page(() => import('../lab/ExchangeScreen.jsx'))
const RuntimeManagerScreen = page(() => import('../lab/RuntimeManagerScreen.jsx'))

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
  Salesforce: Salesforce,
  SAP: SapGui,
  Splunk: Splunk,
  'Runtime Fabric': RuntimeFabric,
  'Flex Gateway': FlexGateway,
  'Partner Manager': PartnerManager,
  'API Governance': Governance,
  'Access Management': AccessManagement,
  'Change and release': ReleaseBoard,
  'Secure properties tool': SecureProps,
  'Capacity planner': CapacityPlanner,
  'Epic (FHIR)': EpicFhir,
  'HL7 interfaces': Hl7Engine,
  Workday: Workday,
  ServiceNow: ServiceNow,
  Snowflake: Snowflake,
  AWS: AwsConsole,
  'Dynamics and SharePoint': Dynamics,
  Shopify: Shopify,
  'Policy test bench': drill(ApiManagerScreen, 'Apply policies in order, then send requests and see which policy decides.'),
  'Deployment drill': drill(RuntimeManagerScreen, 'Deploy with properties, scale, read the logs and roll back.'),
  'Exchange versioning': drill(ExchangeScreen, 'Publish versions, change their lifecycle and see which numbers stay reserved.'),
}
const MENU = [
  ['APIs', [['Design Center', 'Design, mock and publish API specifications.'], ['Exchange', 'Discover and share assets.'], ['API Manager', 'Manage, secure and watch API instances.'], ['API Governance', 'Rulesets, profiles and API conformance.'], ['Partner Manager', 'B2B partners, AS2 and EDI message tracking.']]],
  ['Runtimes and release', [['Runtime Manager', 'Deploy and manage applications.'], ['Runtime Fabric', 'Runtime Fabric clusters: nodes, pods and events.'], ['Flex Gateway', 'Self-managed gateways in front of APIs.'], ['Private spaces', 'CloudHub 2.0 networking: static IPs, VPN, DNS and firewall.'], ['Batch jobs', 'Batch job instances, steps and failed records.'], ['Change and release', 'Change tickets, approvals and release plans.']]],
  ['Monitoring', [['Monitoring', 'Dashboards, alerts and logs.'], ['Visualizer', 'The map of your applications.'], ['Splunk', 'Search the logs that apps forward.']]],
  ['Messaging', [['MQ', 'Anypoint MQ: queues, exchanges and client apps.'], ['ActiveMQ', 'Apache ActiveMQ Classic and Artemis brokers for JMS: queues, topics, durable subscribers.'], ['Kafka', 'Apache Kafka: brokers, topics, consumer groups and schemas.'], ['Azure Service Bus', 'Queues, topics, subscriptions and sessions.'], ['Mail server', 'SMTP and IMAP mailboxes.']]],
  ['Files and data', [['SFTP and FTP', 'A file transfer client on the SFTP and FTP servers.'], ['Azure Blob Storage', 'Containers, blobs, SAS tokens and access keys.'], ['Azure Files', 'File shares of the storage account.'], ['Databases', 'SQL Server and Oracle: query, sessions, locks, plans.'], ['Snowflake', 'Warehouses, stages, loads and queries.']]],
  ['Business systems', [['Salesforce', 'Salesforce Setup, objects, API usage, Bulk jobs and events.'], ['SAP', 'SAP GUI: IDocs, BAPIs and RFC destinations.'], ['Workday', 'Workers, business processes, reports and integration users.'], ['ServiceNow', 'Incidents, the Table API, users and ACLs.'], ['Dynamics and SharePoint', 'Dataverse tables, SharePoint sites and Entra app registrations.'], ['Shopify', 'Store admin, webhooks, apps and API limits.']]],
  ['Healthcare', [['Epic (FHIR)', 'Bayview Health Epic: FHIR R4 resources and backend apps.'], ['HL7 interfaces', 'HL7 v2 over MLLP: connections, messages, ACKs.']]],
  ['Cloud and security', [['AWS', 'S3, SQS, SNS and IAM.'], ['Azure Key Vault', 'Secrets, versions and access policies.'], ['Access Management', 'Business groups, users, roles and connected apps.'], ['Secure properties tool', 'Encrypt and decrypt property values with a key.']]],
  ['Lab tools', [['API client', 'Send requests.'], ['Inbox', 'Mail that alerts send.'], ['Anypoint Studio', 'The steps that link an app to an API.'], ['Flow editor', 'The Mule configuration XML of an app.'], ['Backends', 'Stop or slow a system.'], ['Data center', 'Your Windows servers: files, PowerShell and the link to Anypoint.'], ['Capacity planner', 'Pick vCores and replicas for a load and a budget.']]],
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
  Salesforce: '#00a1e0',
  SAP: '#0a6ed1',
  Splunk: '#65a637',
  'Runtime Fabric': '#326ce5',
  'Flex Gateway': '#0b827c',
  'Partner Manager': '#7a3e9d',
  'API Governance': '#5a4fcf',
  'Access Management': '#3d4f6b',
  'Change and release': '#9b4d00',
  'Secure properties tool': '#525f7f',
  'Capacity planner': '#2e5bba',
  'Epic (FHIR)': '#c8102e',
  'HL7 interfaces': '#a4343a',
  Workday: '#f38b00',
  ServiceNow: '#62d84e',
  Snowflake: '#29b5e8',
  AWS: '#ff9900',
  'Dynamics and SharePoint': '#0078d4',
  Shopify: '#5e8e3e',
  'Exchange versioning': '#0176d3', 'Design Center': '#0b5cab', Exchange: '#0176d3', 'API Manager': '#0b827c', 'Runtime Manager': '#2e5bba', MQ: '#7f56d9', Monitoring: '#1b6fd0', Visualizer: '#0f6e84', Backends: '#8a4b08', 'Data center': '#00539b', 'Anypoint Studio': '#525f7f', 'API client': '#b86e00', Inbox: '#525f7f' }
export const Badge = ({ name }) => (
  <span className="pc-badge" style={{ background: COLOR[name] ?? '#0176d3' }} aria-hidden="true">
    {name.split(' ').map((w) => w[0].toUpperCase()).join('').slice(0, 2)}
  </span>
)

const STARTING_MS = 1400

// `onChange` takes an updater. `guide` is drawn beside the pages, for a lab.
// start opens a product instead of the home page; bare leaves out the Anypoint header and menu (the Systems tab)
export default function AnypointConsole({ state, onChange: update, guide, title, start, bare }) {
  const [place, setPlace] = useState({ product: start ?? 'Home' })
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
      {!bare && (
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
      )}
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
          {Page ? (
            <Suspense fallback={<main className="pc-main"><p className="pc-empty">Opening {place.product}.</p></main>}>
              <Page state={state} update={update} place={shown} go={go} openEnv={() => setEnvs(!envs)} />
            </Suspense>
          ) : (
            <Home go={setPlace} title={title} />
          )}
        </div>
        {guide && showGuide && <aside className="pc-guide">{guide}</aside>}
      </div>
    </div>
  )
}

function Home({ go, title }) {
  const [find, setFind] = useState('')
  const q = find.trim().toLowerCase()
  const groups = MENU.map(([name, list]) => [name, q ? list.filter(([p, text]) => `${name} ${p} ${text}`.toLowerCase().includes(q)) : list]).filter(([, list]) => list.length)
  const first = groups[0]?.[1][0]?.[0]
  return (
    <main className="pc-main pc-home">
      <div className="pc-hello">
        <div>
          <h2>{title ?? 'Welcome'}</h2>
          <p>Choose a product to start. Every page works on the same practice environment.</p>
        </div>
        <input
          type="search"
          className="pc-home-find"
          placeholder="Find a product, for example Kafka or SAP"
          aria-label="Find a product"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && first && go({ product: first })}
        />
      </div>
      <div className="pc-home-grid">
        {groups.map(([name, list]) => (
          <section key={name}>
            <h3>{name}</h3>
            {list.map(([p, text]) => (
              <button key={p} type="button" title={text} onClick={() => go({ product: p })}>
                <Badge name={p} />
                <span>
                  <b>{p}</b>
                  <small>{text}</small>
                </span>
              </button>
            ))}
          </section>
        ))}
        {!groups.length && <p className="pc-empty">No product matches "{find}".</p>}
      </div>
    </main>
  )
}
