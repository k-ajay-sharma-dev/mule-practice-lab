// The systems a flow problem's reference design talks to: HTTP endpoints, database tables, queues, folders and so on.
// On a real project these are handed to you as API contracts and schemas, so the scenario lists them. Only the name
// of each system is shown (a path, a table, a queue), never how the reference uses it: no SQL, no settings.
import { COMPONENTS } from './catalog.js'

const OUTBOUND = new Set(['connectors', 'database', 'messaging', 'files', 'enterprise'])

// a value computed at run time is not a name you could have known
const known = (v) => typeof v === 'string' && v.trim() !== '' && !v.includes('#[') && !v.includes('${')

function tablesIn(sql = '') {
  // "call" as a word of its own: a table named RECALL is not a procedure call
  const procedure = sql.match(/(?:^|[{\s])call\s+([\w.]+)/i)
  if (procedure) return [{ kind: 'Stored procedure', name: procedure[1] }]
  // not ":from", a named parameter, and not the words after FOR UPDATE and the like
  return [...sql.matchAll(/(?<![:\w])(?:from|join|into|update)\s+([A-Za-z_][\w.]*)/gi)]
    .map((m) => m[1])
    .filter((t) => !/^(select|set|values|dual|and|or|skip|nowait|of|only|lateral|where)$/i.test(t))
    .map((name) => ({ kind: 'Database table', name }))
}

const soqlObject = (soql = '') => soql.match(/\bfrom\s+(\w+)/i)?.[1]

// what one step calls, as zero or more { kind, name }
function targetsOf(type, c = {}) {
  const def = COMPONENTS[type]
  if (!def || !OUTBOUND.has(def.group) || def.kind === 'source') return []
  const one = (kind, name) => (known(name) ? [{ kind, name }] : [])
  const [family] = type.split('-')

  if (type === 'http-request') return known(c.path) ? [{ kind: 'HTTP API', name: `${c.method || 'GET'} ${c.path}` }] : []
  if (family === 'db') return tablesIn(c.sql)
  if (family === 'sf') {
    const object = c.objectType || soqlObject(c.soql || c.query)
    if (c.platformEventName) return one('Salesforce platform event', c.platformEventName)
    return one('Salesforce object', object)
  }
  if (family === 'mq') return one('Anypoint MQ destination', c.destination)
  if (family === 'jms') return one(c.destinationType === 'TOPIC' ? 'JMS topic' : 'JMS queue', c.destination)
  if (family === 'vm') return one('VM queue', c.queueName)
  if (family === 'kafka') return one('Kafka topic', c.topic)
  if (family === 'sqs') return one('Amazon SQS queue', known(c.queueUrl) ? c.queueUrl.split('/').pop() : null)
  if (family === 's3') return one('Amazon S3 bucket', c.bucket)
  if (family === 'azure') return one('Azure Blob container', c.container || c.containerName)
  if (family === 'file' || family === 'sftp' || family === 'ftp') {
    const where = { file: 'Folder or file', sftp: 'SFTP folder or file', ftp: 'FTP folder or file' }[family]
    return [c.path, c.directoryPath, c.sourcePath, c.targetPath].filter(known).map((name) => ({ kind: where, name }))
  }
  if (type === 'email-send') return [{ kind: 'Email', name: known(c.toAddresses) ? `send to ${c.toAddresses}` : 'send (SMTP)' }]
  if (family === 'email') return one('Mailbox folder', c.mailboxFolder || c.targetFolder)
  if (type === 'wsc-consume') return one('SOAP operation', c.operation)
  if (family === 'sap') return one('SAP function or IDoc', c.key)
  if (family === 'wd') return one(`Workday ${def.label.replace(/^Workday\s*/i, '')}`, c.operation)
  return []
}

function walk(nodes, found) {
  for (const n of nodes || []) {
    found.push(...targetsOf(n.type, n.config))
    walk(n.steps, found)
    for (const r of n.routes || []) walk(r.steps, found)
    walk(n.otherwise, found)
    walk(n.errorHandlers, found)
  }
  return found
}

// Every distinct system in a design, in the order the design first uses it.
export function systemsIn(design) {
  if (!design?.flows) return []
  const found = []
  for (const f of design.flows) {
    walk(f.steps, found)
    walk(f.errorHandlers, found)
  }
  const seen = new Set()
  return found.filter((s) => {
    const key = `${s.kind}\n${s.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
