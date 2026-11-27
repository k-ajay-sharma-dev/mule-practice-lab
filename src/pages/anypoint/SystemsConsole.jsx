// The Platform and systems tab of the Platform Lab: Anypoint Platform and every outside system, each on its own,
// all in one practice environment. A change made on one shows on the others.
import { lazy, Suspense, useState } from 'react'
import AnypointConsole, { Badge } from './AnypointConsole.jsx'
import OpenConsole, { useOpenConsole, useSaveConsole } from './OpenConsole.jsx'

const Pipeline = lazy(() => import('../lab/PipelineScreen.jsx'))

// [group, [[product name in the console, label here, what you can do]]]
const ANYPOINT = 'Anypoint Platform'
const CICD = 'CI/CD'
const SYSTEMS = [
  ['Anypoint', [[ANYPOINT, ANYPOINT, 'Design Center, API Manager, Runtime Manager and more']]],
  ['Deployments', [[CICD, 'CI/CD pipeline', 'The release workflow in GitHub Actions']]],
  ['Messaging', [['Kafka', 'Kafka', 'Topics, consumer groups, lag and schemas'], ['ActiveMQ', 'ActiveMQ', 'Classic and Artemis brokers, queues and DLQs'], ['MQ', 'Anypoint MQ', 'Queues, exchanges and client apps'], ['Azure Service Bus', 'Azure Service Bus', 'Queues, topics, sessions and dead letters'], ['Mail server', 'Mail server', 'SMTP and IMAP mailboxes']]],
  ['Files and data', [['SFTP and FTP', 'SFTP and FTP', 'Users, folders and file transfers'], ['Azure Blob Storage', 'Azure Blob Storage', 'Containers, blobs and SAS tokens'], ['Azure Files', 'Azure Files', 'File shares and directories'], ['Databases', 'SQL Server and Oracle', 'Queries, logins, grants, locks and plans'], ['Snowflake', 'Snowflake', 'Warehouses, stages, COPY and MERGE']]],
  ['Business systems', [['Salesforce', 'Salesforce', 'Setup, objects, API limits, Bulk and events'], ['SAP', 'SAP', 'IDocs, BAPIs and RFC destinations'], ['Workday', 'Workday', 'Workers, reports and integration users'], ['ServiceNow', 'ServiceNow', 'Incidents, Table API and ACLs'], ['Dynamics and SharePoint', 'Dynamics and SharePoint', 'Dataverse, SharePoint and Entra apps'], ['Shopify', 'Shopify', 'Orders, apps, webhooks and API limits']]],
  ['Healthcare', [['Epic (FHIR)', 'Epic (FHIR)', 'FHIR R4 resources and backend apps'], ['HL7 interfaces', 'HL7 interfaces', 'MLLP interfaces, messages and ACKs']]],
  ['Cloud and security', [['AWS', 'AWS', 'S3, SQS, SNS, IAM and CloudTrail'], ['Azure Key Vault', 'Azure Key Vault', 'Secrets, versions and access policies'], ['Data center', 'Data center', 'Your Windows servers and PowerShell']]],
  ['Logs', [['Splunk', 'Splunk', 'Search forwarded logs and alerts']]],
  ['Tools', [['API client', 'API client', 'Send requests to the apps'], ['Inbox', 'Inbox', 'Mail that alerts and people send']]],
]
const ALL = SYSTEMS.flatMap(([, list]) => list)

export default function SystemsConsole() {
  const [state, setState] = useOpenConsole()
  const [pick, setPick] = useState(ANYPOINT)
  const [pipelineOpened, setPipelineOpened] = useState(false)
  const [find, setFind] = useState('')
  useSaveConsole(state)
  const q = find.trim().toLowerCase()
  const groups = SYSTEMS.map(([g, list]) => [g, q ? list.filter((x) => `${g} ${x[1]} ${x[2]}`.toLowerCase().includes(q)) : list]).filter(([, list]) => list.length)
  const choose = (product) => {
    if (product === CICD) setPipelineOpened(true)
    setPick(product)
  }
  const label = ALL.find((x) => x[0] === pick)?.[1] ?? pick
  return (
    <div className="pc-wrap pc-skin sys-wrap">
      <nav className="sys-nav" aria-label="Systems">
        <input type="search" className="sys-find" placeholder="Find a system" aria-label="Find a system" value={find} onChange={(e) => setFind(e.target.value)} />
        {groups.map(([g, list]) => (
          <div key={g} className="sys-group">
            <b>{g}</b>
            {list.map(([product, name, text]) => (
              <button key={product} type="button" title={text} aria-current={product === pick ? 'page' : undefined} className={product === pick ? 'on' : ''} onClick={() => choose(product)}>
                <Badge name={product} />
                <span>
                  <span className="sys-name">{name}</span>
                  <small>{text}</small>
                </span>
              </button>
            ))}
          </div>
        ))}
        {!groups.length && <p className="pc-empty">No system matches "{find}".</p>}
      </nav>
      <select className="sys-pick" aria-label="System" value={pick} onChange={(e) => choose(e.target.value)}>
        {SYSTEMS.map(([g, list]) => (
          <optgroup key={g} label={g}>
            {list.map(([product, name]) => (
              <option key={product} value={product}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="sys-main">
        {/* Anypoint Platform stays mounted, so its page is still open when you come back to it */}
        <div hidden={pick !== ANYPOINT}>
          <OpenConsole />
        </div>
        {/* the pipeline loads the first time it is picked, then stays mounted so its runs survive a switch */}
        {pipelineOpened && (
          <div hidden={pick !== CICD}>
            <Suspense fallback={<p className="muted">Loading the pipeline…</p>}>
              <Pipeline />
            </Suspense>
          </div>
        )}
        {pick !== ANYPOINT && pick !== CICD && <AnypointConsole key={pick} state={state} onChange={setState} title={label} start={pick} bare />}
      </div>
    </div>
  )
}
