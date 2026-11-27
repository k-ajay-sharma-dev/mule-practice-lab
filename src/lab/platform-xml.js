// The Mule configuration XML of the Platform Lab. An application can carry `app.xml`, the text of its mule-config.xml.
// This module has a small tolerant XML parser, a model of a practical subset of Mule 4, the checks that Anypoint Studio and
// the runtime make when the app deploys, and questions a lab package can ask about a flow: errorHandlerOf, outcomeOf,
// retryOf, txOf, batchOf. Pure and import free. Lab simplifications are marked "lab:".
//
// ctx.xml in a package handler is parseMule(app.xml), or null when the app has no XML. Every helper takes the parse or the
// text. The parse is cached by text, so a package must not change it.

export const XML_FILE = 'mule-config.xml'

// ---------- XML ----------

class XmlError extends Error {
  constructor(message, at) {
    super(message)
    this.at = at
  }
}
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
const NAME = /[A-Za-z_][\w.:-]*/y
const SPACE = /\s*/y

function lineIndex(src) {
  const starts = [0]
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1)
  return (at) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= at) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

// The messages are the ones of the Xerces parser that Mule and Studio use
function decode(raw, at) {
  if (!raw.includes('&')) return raw
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '&') {
      out += raw[i]
      continue
    }
    const m = /^&(#x[0-9a-fA-F]+|#\d+|[A-Za-z_][\w.-]*)(;?)/.exec(raw.slice(i))
    if (!m) throw new XmlError("The entity name must immediately follow the '&' in the entity reference.", at + i)
    if (!m[2]) throw new XmlError(`The reference to entity "${m[1]}" must end with the ';' delimiter.`, at + i)
    if (m[1][0] === '#') out += String.fromCodePoint(m[1][1] === 'x' ? parseInt(m[1].slice(2), 16) : Number(m[1].slice(1)))
    else if (ENTITIES[m[1]]) out += ENTITIES[m[1]]
    else throw new XmlError(`The entity "${m[1]}" was referenced, but not declared.`, at + i)
    i += m[0].length - 1
  }
  return out
}

// A node is { name, attrs, lines (line of each attribute), line, end, children, text }. One fatal error stops the parse,
// as with a SAX parser.
export function parseXml(text) {
  const src = String(text ?? '')
  const lineAt = lineIndex(src)
  const doc = { name: '#document', children: [], text: '' }
  const stack = [doc]
  let i = 0
  const top = () => stack.at(-1)
  const fail = (message, at = i) => {
    throw new XmlError(message, at)
  }
  const skip = () => {
    SPACE.lastIndex = i
    SPACE.exec(src)
    const moved = SPACE.lastIndex > i
    i = SPACE.lastIndex
    return moved
  }
  const addText = (raw, at) => {
    if (stack.length === 1) {
      if (raw.trim()) fail(doc.children.length ? 'Content is not allowed in trailing section.' : 'Content is not allowed in prolog.', at + raw.search(/\S/))
      return
    }
    top().text += decode(raw, at)
  }
  try {
    while (i < src.length) {
      const lt = src.indexOf('<', i)
      if (lt < 0) {
        addText(src.slice(i), i)
        break
      }
      if (lt > i) addText(src.slice(i, lt), i)
      i = lt
      if (src.startsWith('<!--', i)) {
        const end = src.indexOf('-->', i + 4)
        if (end < 0) fail('XML document structures must start and end within the same entity.', src.length)
        i = end + 3
        continue
      }
      if (src.startsWith('<![CDATA[', i)) {
        const end = src.indexOf(']]>', i)
        if (end < 0) fail('The CDATA section must end with "]]>".', src.length)
        if (stack.length === 1) fail('Content is not allowed in prolog.')
        top().text += src.slice(i + 9, end)
        top().cdata = true
        i = end + 3
        continue
      }
      if (src.startsWith('<?', i)) {
        const end = src.indexOf('?>', i)
        if (end < 0) fail('XML document structures must start and end within the same entity.', src.length)
        if (/^<\?xml[\s?]/i.test(src.slice(i, i + 6)) && src.slice(0, i).trim()) fail('The processing instruction target matching "[xX][mM][lL]" is not allowed.')
        i = end + 2
        continue
      }
      if (src.startsWith('<!', i)) {
        const end = src.indexOf('>', i)
        if (end < 0) fail('XML document structures must start and end within the same entity.', src.length)
        i = end + 1
        continue
      }
      if (src[i + 1] === '/') {
        const at = i
        i += 2
        NAME.lastIndex = i
        const m = NAME.exec(src)
        if (!m) fail('The end-tag must have a name.', at)
        i = NAME.lastIndex
        skip()
        if (src[i] !== '>') fail(`The end-tag for element type "${m[0]}" must end with a '>' delimiter.`)
        if (stack.length === 1) fail('The markup in the document following the root element must be well-formed.', at)
        const open = top()
        if (open.name !== m[0]) fail(`The element type "${open.name}" must be terminated by the matching end-tag "</${open.name}>".`, at)
        open.end = lineAt(at)
        stack.pop()
        i += 1
        continue
      }
      // a start tag
      const at = i
      NAME.lastIndex = i + 1
      const m = NAME.exec(src)
      if (!m || NAME.lastIndex !== i + 1 + m[0].length) fail('The content of elements must consist of well-formed character data or markup.')
      if (stack.length === 1 && doc.children.length) fail('The markup in the document following the root element must be well-formed.')
      const node = { name: m[0], attrs: {}, lines: {}, line: lineAt(at), end: lineAt(at), children: [], text: '' }
      i = NAME.lastIndex
      let closed = false
      for (;;) {
        const spaced = skip()
        if (i >= src.length) fail('XML document structures must start and end within the same entity.', src.length)
        if (src[i] === '>') {
          i += 1
          break
        }
        if (src.startsWith('/>', i)) {
          i += 2
          closed = true
          break
        }
        NAME.lastIndex = i
        const a = NAME.exec(src)
        if (!spaced || !a) fail(`Element type "${node.name}" must be followed by either attribute specifications, ">" or "/>".`)
        i = NAME.lastIndex
        skip()
        if (src[i] !== '=') fail(`Attribute name "${a[0]}" associated with an element type "${node.name}" must be followed by the ' = ' character.`)
        i += 1
        skip()
        const q = src[i]
        if (q !== '"' && q !== "'") fail(`Open quote is expected for attribute "${a[0]}" associated with an  element type  "${node.name}".`)
        const end = src.indexOf(q, i + 1)
        if (end < 0) fail('XML document structures must start and end within the same entity.', src.length)
        const raw = src.slice(i + 1, end)
        if (raw.includes('<')) fail(`The value of attribute "${a[0]}" associated with an element type "${node.name}" must not contain the '<' character.`, i + 1 + raw.indexOf('<'))
        if (a[0] in node.attrs) fail(`Attribute "${a[0]}" was already specified for element "${node.name}".`, i)
        node.attrs[a[0]] = decode(raw, i + 1)
        node.lines[a[0]] = lineAt(i)
        i = end + 1
      }
      top().children.push(node)
      if (!closed) stack.push(node)
    }
    if (stack.length > 1) fail('XML document structures must start and end within the same entity.', src.length)
    if (!doc.children.length) fail('Premature end of file.', src.length)
  } catch (e) {
    if (e instanceof XmlError) return { root: null, error: { line: lineAt(Math.min(e.at, Math.max(0, src.length - 1))), message: e.message } }
    throw e
  }
  return { root: doc.children[0], error: null }
}

// ---------- the Mule 4 elements the lab knows ----------

const G = 'global'
const S = 'source'
const P = 'processor'
const X = 'part'
const COMMON = ['doc:name', 'doc:id', 'doc:description']
const OP = ['config-ref', 'target', 'targetValue']
const OP_TX = ['ALWAYS_JOIN', 'JOIN_IF_POSSIBLE', 'NOT_SUPPORTED']
const BOOL = ['true', 'false']
const DB_OPS = ['db:select', 'db:insert', 'db:update', 'db:delete', 'db:bulk-insert', 'db:stored-procedure']
const DB_CONNECTIONS = ['db:mssql-connection', 'db:oracle-connection', 'db:my-sql-connection', 'db:generic-connection']
const MAPPED = ['http:request', 'jms:publish', 'jms:consume', ...DB_OPS]
const on = { kind: 'handler', attrs: ['type', 'when', 'enableNotifications', 'logException'], enums: { enableNotifications: BOOL, logException: BOOL }, scope: true }
const db = (extra = []) => ({ kind: P, attrs: [...OP, 'transactionalAction', 'queryTimeout', 'queryTimeoutUnit', 'maxRows', 'fetchSize', ...extra], req: ['config-ref'], config: 'db:config', enums: { transactionalAction: OP_TX }, ints: ['queryTimeout', 'maxRows', 'fetchSize'], needs: ['db:sql'] })
const part = (parents, attrs = [], extra = {}) => ({ kind: X, attrs, in: parents, ...extra })

export const ELEMENTS = {
  mule: { kind: 'root', attrs: [] },
  'configuration-properties': { kind: G, attrs: ['file', 'encoding'], req: ['file'] },
  'global-property': { kind: G, attrs: ['name', 'value'], req: ['name', 'value'] },
  configuration: { kind: G, attrs: ['defaultErrorHandler-ref', 'correlationIdGeneratorExpression', 'defaultResponseTimeout', 'defaultTransactionTimeout', 'shutdownTimeout'], ints: ['defaultResponseTimeout', 'defaultTransactionTimeout', 'shutdownTimeout'] },
  'http:listener-config': { kind: G, attrs: ['name', 'basePath'], req: ['name'], needs: ['http:listener-connection'], stereotype: 'HTTP:LISTENER_CONFIG' },
  'http:listener-connection': part(['http:listener-config'], ['host', 'port', 'protocol', 'readTimeout', 'connectionIdleTimeout', 'tlsContext'], { req: ['host', 'port'], enums: { protocol: ['HTTP', 'HTTPS'] }, ints: ['port', 'readTimeout', 'connectionIdleTimeout'] }),
  'http:request-config': { kind: G, attrs: ['name', 'basePath', 'responseTimeout'], req: ['name'], ints: ['responseTimeout'], stereotype: 'HTTP:REQUEST_CONFIG' },
  'http:request-connection': part(['http:request-config'], ['host', 'port', 'protocol', 'connectionIdleTimeout', 'maxConnections', 'tlsContext'], { enums: { protocol: ['HTTP', 'HTTPS'] }, ints: ['port', 'connectionIdleTimeout', 'maxConnections'] }),
  'db:config': { kind: G, attrs: ['name'], req: ['name'], stereotype: 'DB:CONFIG' },
  'db:mssql-connection': part(['db:config'], ['host', 'port', 'databaseName', 'instanceName', 'user', 'password', 'transactionIsolation'], { ints: ['port'] }),
  'db:oracle-connection': part(['db:config'], ['host', 'port', 'serviceName', 'instance', 'user', 'password', 'transactionIsolation'], { ints: ['port'] }),
  'db:my-sql-connection': part(['db:config'], ['host', 'port', 'database', 'user', 'password', 'transactionIsolation'], { ints: ['port'] }),
  'db:generic-connection': part(['db:config'], ['url', 'driverClassName', 'user', 'password', 'transactionIsolation'], { req: ['url', 'driverClassName'] }),
  'db:pooling-profile': part(DB_CONNECTIONS, ['maxPoolSize', 'minPoolSize', 'acquireIncrement', 'maxWait', 'maxWaitUnit', 'preparedStatementCacheSize'], { ints: ['maxPoolSize', 'minPoolSize', 'acquireIncrement', 'maxWait', 'preparedStatementCacheSize'] }),
  'jms:config': { kind: G, attrs: ['name'], req: ['name'], stereotype: 'JMS:CONFIG' },
  'jms:active-mq-connection': part(['jms:config'], ['username', 'password', 'specification']),
  'jms:factory-configuration': part(['jms:active-mq-connection'], ['brokerUrl', 'maxRedelivery'], { ints: ['maxRedelivery'] }),
  'error-handler': { kind: 'error-handler', attrs: ['name', 'ref'] },
  'on-error-continue': on,
  'on-error-propagate': on,
  flow: { kind: 'flow', attrs: ['name', 'initialState', 'maxConcurrency'], req: ['name'], enums: { initialState: ['started', 'stopped'] }, ints: ['maxConcurrency'] },
  'sub-flow': { kind: 'flow', attrs: ['name'], req: ['name'] },
  'http:listener': { kind: S, attrs: ['config-ref', 'path', 'allowedMethods', 'outputMimeType', 'primaryNodeOnly'], req: ['config-ref', 'path'], config: 'http:listener-config' },
  'http:response': part(['http:listener'], ['statusCode', 'reasonPhrase']),
  'http:error-response': part(['http:listener'], ['statusCode', 'reasonPhrase']),
  'http:body': part(['http:response', 'http:error-response', 'http:request'], [], { text: true }),
  'http:headers': part(['http:response', 'http:error-response', 'http:request'], [], { text: true }),
  'http:query-params': part(['http:request'], [], { text: true }),
  'http:uri-params': part(['http:request'], [], { text: true }),
  scheduler: { kind: S, attrs: ['disallowConcurrentExecution', 'primaryNodeOnly'], enums: { disallowConcurrentExecution: BOOL, primaryNodeOnly: BOOL }, needs: ['scheduling-strategy'] },
  'scheduling-strategy': part(['scheduler']),
  'fixed-frequency': part(['scheduling-strategy'], ['frequency', 'startDelay', 'timeUnit'], { enums: { timeUnit: ['MILLISECONDS', 'SECONDS', 'MINUTES', 'HOURS', 'DAYS'] }, ints: ['frequency', 'startDelay'] }),
  cron: part(['scheduling-strategy'], ['expression', 'timeZone'], { req: ['expression'] }),
  'db:select': db(),
  'db:insert': db(['autoGenerateKeys', 'autoGeneratedKeysColumnNames']),
  'db:update': db(),
  'db:delete': db(),
  'db:bulk-insert': db(),
  'db:stored-procedure': db(),
  'db:sql': part(DB_OPS, [], { text: true }),
  'db:input-parameters': part(DB_OPS, [], { text: true }),
  'http:request': { kind: P, attrs: [...OP, 'method', 'path', 'url', 'responseTimeout', 'followRedirects', 'sendCorrelationId'], config: 'http:request-config', ints: ['responseTimeout'] },
  'error-mapping': part(MAPPED, ['sourceType', 'targetType'], { req: ['targetType'] }),
  'jms:listener': { kind: S, attrs: ['config-ref', 'destination', 'transactionalAction', 'transactionType', 'ackMode', 'numberOfConsumers'], req: ['config-ref', 'destination'], config: 'jms:config', enums: { transactionalAction: ['ALWAYS_BEGIN', 'NONE'], transactionType: ['LOCAL', 'XA'], ackMode: ['AUTO', 'MANUAL', 'IMMEDIATE', 'DUPS_OK'] }, ints: ['numberOfConsumers'] },
  'jms:publish': { kind: P, attrs: [...OP, 'destination', 'transactionalAction', 'persistentDelivery'], req: ['config-ref', 'destination'], config: 'jms:config', enums: { transactionalAction: OP_TX } },
  'jms:consume': { kind: P, attrs: [...OP, 'destination', 'transactionalAction', 'maximumWait'], req: ['config-ref', 'destination'], config: 'jms:config', enums: { transactionalAction: OP_TX } },
  try: { kind: P, attrs: ['transactionalAction', 'transactionType'], enums: { transactionalAction: ['INDIFFERENT', 'ALWAYS_BEGIN', 'BEGIN_OR_JOIN'], transactionType: ['LOCAL', 'XA'] }, scope: true, handler: true },
  'until-successful': { kind: P, attrs: ['maxRetries', 'millisBetweenRetries'], ints: ['maxRetries', 'millisBetweenRetries'], scope: true },
  foreach: { kind: P, attrs: ['collection', 'batchSize', 'counterVariableName', 'rootMessageVariableName'], ints: ['batchSize'], scope: true },
  async: { kind: P, attrs: ['name', 'maxConcurrency'], ints: ['maxConcurrency'], scope: true },
  choice: { kind: P, attrs: [], needs: ['when'] },
  when: part(['choice'], ['expression'], { req: ['expression'], scope: true }),
  otherwise: part(['choice'], [], { scope: true }),
  'scatter-gather': { kind: P, attrs: ['timeout', 'maxConcurrency'], ints: ['timeout', 'maxConcurrency'], needs: ['route'] },
  route: part(['scatter-gather'], [], { scope: true }),
  'flow-ref': { kind: P, attrs: ['name', 'target', 'targetValue'], req: ['name'] },
  'set-variable': { kind: P, attrs: ['variableName', 'value', 'mimeType', 'encoding'], req: ['variableName', 'value'] },
  'remove-variable': { kind: P, attrs: ['variableName'], req: ['variableName'] },
  'set-payload': { kind: P, attrs: ['value', 'mimeType', 'encoding'], req: ['value'] },
  logger: { kind: P, attrs: ['level', 'message', 'category'], enums: { level: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'] } },
  'raise-error': { kind: P, attrs: ['type', 'description'], req: ['type'] },
  'ee:transform': { kind: P, attrs: [] },
  'ee:message': part(['ee:transform']),
  'ee:set-payload': part(['ee:message'], ['resource'], { text: true }),
  'ee:set-attributes': part(['ee:message'], ['resource'], { text: true }),
  'ee:variables': part(['ee:transform']),
  'ee:set-variable': part(['ee:variables'], ['variableName', 'resource'], { req: ['variableName'], text: true }),
  'batch:job': { kind: P, attrs: ['jobName', 'maxFailedRecords', 'blockSize', 'maxConcurrency', 'schedulingStrategy'], req: ['jobName'], ints: ['maxFailedRecords', 'blockSize', 'maxConcurrency'], enums: { schedulingStrategy: ['ORDERED_SEQUENTIAL', 'ROUND_ROBIN'] }, needs: ['batch:process-records'] },
  'batch:process-records': part(['batch:job'], [], { needs: ['batch:step'] }),
  'batch:step': part(['batch:process-records'], ['name', 'acceptPolicy', 'acceptExpression'], { req: ['name'], enums: { acceptPolicy: ['NO_FAILURES', 'ONLY_FAILURES', 'ALL'] }, scope: true }),
  'batch:aggregator': part(['batch:step'], ['size', 'streaming'], { ints: ['size'], enums: { streaming: BOOL }, scope: true }),
  'batch:on-complete': part(['batch:job'], [], { scope: true }),
}
export const TX_SCOPE_ACTIONS = ELEMENTS.try.enums.transactionalAction
export const TX_OPERATION_ACTIONS = OP_TX

// The error types of each module. A type of a connector exists only when the app uses that connector.
const ERRORS = {
  MULE: ['ANY', 'CONNECTIVITY', 'RETRY_EXHAUSTED', 'EXPRESSION', 'TRANSFORMATION', 'ROUTING', 'COMPOSITE_ROUTING', 'SECURITY', 'CLIENT_SECURITY', 'SERVER_SECURITY', 'NOT_PERMITTED', 'STREAM_MAXIMUM_SIZE_EXCEEDED', 'TIMEOUT', 'UNKNOWN', 'VALIDATION', 'DUPLICATE_MESSAGE', 'REDELIVERY_EXHAUSTED', 'SOURCE', 'SOURCE_RESPONSE', 'SOURCE_RESPONSE_GENERATE', 'SOURCE_RESPONSE_SEND', 'SOURCE_ERROR_RESPONSE_GENERATE', 'SOURCE_ERROR_RESPONSE_SEND', 'OVERLOAD', 'FLOW_BACK_PRESSURE', 'CRITICAL', 'FATAL_JVM_ERROR'],
  HTTP: ['BAD_GATEWAY', 'BAD_REQUEST', 'BASIC_AUTHENTICATION', 'CLIENT_SECURITY', 'CONNECTIVITY', 'FORBIDDEN', 'GATEWAY_TIMEOUT', 'INTERNAL_SERVER_ERROR', 'METHOD_NOT_ALLOWED', 'NOT_ACCEPTABLE', 'NOT_FOUND', 'PARSING', 'RETRY_EXHAUSTED', 'SECURITY', 'SERVICE_UNAVAILABLE', 'TIMEOUT', 'TOO_MANY_REQUESTS', 'UNAUTHORIZED', 'UNSUPPORTED_MEDIA_TYPE'],
  DB: ['BAD_SQL_SYNTAX', 'CONNECTIVITY', 'QUERY_EXECUTION', 'RETRY_EXHAUSTED'],
  JMS: ['ACK', 'CONNECTIVITY', 'CONSUMING', 'DESTINATION_NOT_FOUND', 'ILLEGAL_BODY', 'PUBLISHING', 'RETRY_EXHAUSTED', 'SECURITY', 'TIMEOUT'],
}
// prefix of the XML namespace -> namespace of its error types
const ERROR_NS = { http: 'HTTP', db: 'DB', jms: 'JMS' }
const RESERVED = ['MULE', 'HTTP', 'DB', 'JMS', 'EE', 'BATCH', 'APIKIT', 'SFTP', 'FTP', 'FILE', 'EMAIL', 'VM', 'KAFKA', 'ANYPOINT-MQ', 'OS', 'TLS', 'VALIDATION', 'SALESFORCE']
// connector types that are a kind of a MULE type, so a handler for MULE:CONNECTIVITY also catches DB:CONNECTIVITY
// HTTP:UNAUTHORIZED and HTTP:FORBIDDEN are kinds of HTTP:CLIENT_SECURITY, HTTP:BASIC_AUTHENTICATION of MULE:SERVER_SECURITY
const PARENTS = { CONNECTIVITY: 'MULE:CONNECTIVITY', RETRY_EXHAUSTED: 'MULE:RETRY_EXHAUSTED', SECURITY: 'MULE:SECURITY', CLIENT_SECURITY: 'MULE:CLIENT_SECURITY', SERVER_SECURITY: 'MULE:SERVER_SECURITY', BASIC_AUTHENTICATION: 'MULE:SERVER_SECURITY', UNAUTHORIZED: 'MULE:CLIENT_SECURITY', FORBIDDEN: 'MULE:CLIENT_SECURITY' }
// the MULE types that are kinds of another MULE type
const MULE_PARENTS = { CLIENT_SECURITY: 'MULE:SECURITY', SERVER_SECURITY: 'MULE:SECURITY', NOT_PERMITTED: 'MULE:SECURITY' }
const parentOf = (t) => {
  const [ns, id] = t.split(':')
  return (ns === 'MULE' ? MULE_PARENTS[id] : PARENTS[id]) ?? null
}

export const normalType = (t) => {
  const x = String(t ?? '').trim().toUpperCase()
  return x.includes(':') ? x : x ? `MULE:${x}` : ''
}
export const typeList = (text) =>
  String(text ?? '')
    .split(',')
    .map(normalType)
    .filter(Boolean)
// Does a handler type such as MULE:CONNECTIVITY, HTTP:* or *:TIMEOUT catch this error type?
export function typeCatches(handlerType, errorType) {
  const h = normalType(handlerType)
  const e = normalType(errorType)
  if (h === 'MULE:ANY' || h === e) return true
  const [hn, hl] = h.split(':')
  const [en, el] = e.split(':')
  if ((hn === '*' && hl === el) || (hl === '*' && hn === en)) return true
  for (let p = parentOf(e); p; p = parentOf(p)) if (p === h) return true
  return false
}

// ---------- the model ----------

const isExpr = (v) => /#\[|\$\{/.test(String(v))
const prefixOf = (name) => (name.includes(':') ? name.split(':')[0] : '')
const display = (node) => node.attrs['doc:name'] ?? node.attrs.name ?? node.name

// A step is { kind, line, end, attrs, name, steps (the processors inside), parts (other child elements), text, errorHandler }
function stepOf(node) {
  const step = { kind: node.name, line: node.line, end: node.end, attrs: node.attrs, name: display(node), steps: [], parts: [], text: node.text }
  for (const c of node.children) {
    const def = ELEMENTS[c.name]
    if (!def) continue
    if (c.name === 'error-handler') step.errorHandler = handlerOf(c)
    else if (def.kind === P) step.steps.push(stepOf(c))
    else step.parts.push(stepOf(c))
  }
  return step
}
function handlerOf(node) {
  const handlers = node.children
    .filter((c) => c.name === 'on-error-continue' || c.name === 'on-error-propagate')
    .map((c) => ({
      kind: c.name === 'on-error-continue' ? 'continue' : 'propagate',
      element: c.name,
      line: c.line,
      typeText: c.attrs.type ?? '',
      types: c.attrs.type ? typeList(c.attrs.type) : null,
      when: c.attrs.when ?? null,
      logException: c.attrs.logException !== 'false',
      enableNotifications: c.attrs.enableNotifications !== 'false',
      name: display(c),
      steps: stepOf(c).steps,
    }))
  return { line: node.line, name: node.attrs.name ?? null, ref: node.attrs.ref ?? null, handlers }
}

const CACHE = new Map()
// { ok, problems: [{ line, severity, message }], errors, flows: { name: flow }, flowList, globals, placeholders, customTypes }
export function parseMule(text) {
  const key = String(text ?? '')
  if (CACHE.has(key)) return CACHE.get(key)
  const model = build(key)
  CACHE.set(key, model)
  if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value)
  return model
}
export const asModel = (xml) => (xml == null ? null : typeof xml === 'string' ? parseMule(xml) : xml)

function build(text) {
  const { root, error } = parseXml(text)
  const problems = []
  const add = (line, message, severity = 'error') => problems.push({ line, message, severity })
  const model = { text, root, problems, flows: {}, flowList: [], globals: [], handlers: {}, placeholders: [], customTypes: [], namespaces: {} }
  if (error) {
    add(error.line, error.message)
    return finish(model)
  }
  if (root.name !== 'mule') {
    add(root.line, `cvc-elt.1.a: Cannot find the declaration of element '${root.name}'.`)
    return finish(model)
  }
  for (const [k, v] of Object.entries(root.attrs)) if (k.startsWith('xmlns:')) model.namespaces[k.slice(6)] = v
  const bound = (p) => !p || p in model.namespaces

  // custom error types are declared where they are raised or mapped
  const all = []
  const collect = (n) => {
    all.push(n)
    n.children.forEach(collect)
  }
  collect(root)
  for (const n of all) {
    const t = n.name === 'raise-error' ? n.attrs.type : n.name === 'error-mapping' ? n.attrs.targetType : null
    if (t && !isExpr(t)) {
      const x = normalType(t)
      if (!RESERVED.includes(x.split(':')[0]) && !model.customTypes.includes(x)) model.customTypes.push(x)
    }
  }
  const used = new Set(['MULE', ...Object.keys(model.namespaces).map((p) => ERROR_NS[p]).filter(Boolean)])

  // ---- schema: elements, attributes, where each element may stand ----
  const allowed = (parent, child) => {
    const def = ELEMENTS[child.name]
    const pd = ELEMENTS[parent.name]
    if (!def || !pd) return false
    if (parent.name === 'mule') return def.kind === G || def.kind === 'flow' || child.name === 'error-handler'
    if (def.kind === X) return def.in.includes(parent.name)
    if (child.name === 'error-handler') return parent.name === 'flow' || Boolean(pd.handler)
    if (def.kind === 'handler') return parent.name === 'error-handler'
    if (def.kind === S) return parent.name === 'flow'
    if (def.kind === P) return pd.kind === 'flow' || Boolean(pd.scope)
    return false
  }
  const visit = (node, parent) => {
    const def = ELEMENTS[node.name]
    if (!bound(prefixOf(node.name))) {
      add(node.line, `The prefix "${prefixOf(node.name)}" for element "${node.name}" is not bound.`)
      return
    }
    if (!def || (parent && !allowed(parent, node))) {
      add(node.line, `cvc-complex-type.2.4.a: Invalid content was found starting with element '${node.name}'.${def ? ` It cannot stand inside '${parent.name}'.` : ' No such element is known.'}`)
      return
    }
    for (const [k, v] of Object.entries(node.attrs)) {
      const line = node.lines[k]
      if (node.name === 'mule' ? !(k === 'xmlns' || k.startsWith('xmlns:') || k === 'xsi:schemaLocation') : !(def.attrs.includes(k) || COMMON.includes(k) || k === 'xsi:schemaLocation')) {
        add(line, `cvc-complex-type.3.2.2: Attribute '${k}' is not allowed to appear in element '${node.name}'.`)
        continue
      }
      if (isExpr(v)) continue
      const options = def.enums?.[k]
      if (options && !options.includes(v)) add(line, `cvc-enumeration-valid: Value '${v}' is not facet-valid with respect to enumeration '[${options.join(', ')}]'. It must be a value from the enumeration.`)
      if (def.ints?.includes(k) && !/^-?\d+$/.test(v.trim())) add(line, `cvc-datatype-valid.1.2.1: '${v}' is not a valid value for 'integer'.`)
    }
    for (const k of def.req ?? []) if (!(k in node.attrs)) add(node.line, `cvc-complex-type.4: Attribute '${k}' must appear on element '${node.name}'.`)
    if (node.name === 'error-handler' && parent?.name === 'mule' && !node.attrs.name) add(node.line, "cvc-complex-type.4: Attribute 'name' must appear on element 'error-handler'.")
    if (!def.text && node.text.trim()) add(node.line, `cvc-complex-type.2.3: Element '${node.name}' cannot have character [children], because the type's content type is element-only.`)
    for (const n of def.needs ?? []) if (!node.children.some((c) => c.name === n)) add(node.line, `cvc-complex-type.2.4.b: The content of element '${node.name}' is not complete. One of '{${n}}' is expected.`)
    // order inside a flow: the source first, the error handler last
    const kids = node.children
    kids.forEach((c, i) => {
      const cd = ELEMENTS[c.name]
      const misplaced =
        (cd?.kind === S && (i !== 0 || node.name !== 'flow')) ||
        (c.name === 'error-handler' && parent && i !== kids.length - 1) ||
        (c.name === 'otherwise' && i !== kids.length - 1)
      if (misplaced && allowed(node, c)) add(c.line, `cvc-complex-type.2.4.a: Invalid content was found starting with element '${c.name}'. It is not allowed at this position in '${node.name}'.`)
      visit(c, node)
    })
  }
  visit(root, null)

  // ---- global names, flows and references ----
  const named = new Map()
  for (const c of root.children) {
    const def = ELEMENTS[c.name]
    if (!def) continue
    const name = c.attrs.name
    if (name && !isExpr(name)) {
      if (named.has(name)) add(c.line, `Two (or more) configuration elements have been defined with the same global name. Global name '${name}' must be unique.`)
      else named.set(name, c)
    }
    if (def.kind === G) model.globals.push({ name: name ?? null, type: c.name, line: c.line, attrs: c.attrs })
    if (c.name === 'error-handler' && name) model.handlers[name] = handlerOf(c)
    if (def.kind === 'flow' && name) {
      const step = stepOf(c)
      const sourceNode = c.children.find((x) => ELEMENTS[x.name]?.kind === S)
      const flow = { name, kind: c.name, line: c.line, end: c.end, source: sourceNode ? stepOf(sourceNode) : null, steps: step.steps, errorHandler: step.errorHandler ?? null }
      if (!model.flows[name]) {
        model.flows[name] = flow
        model.flowList.push(flow)
      }
    }
  }
  for (const n of all) {
    const def = ELEMENTS[n.name]
    if (!def) continue
    const ref = n.attrs['config-ref']
    if (def.config && ref && !isExpr(ref)) {
      const target = named.get(ref)
      const want = ELEMENTS[def.config].stereotype
      // lab: the runtime names the stereotype it expected; the wording for a name that is not there at all is the lab's
      if (!target) add(n.lines['config-ref'], `Referenced component '${ref}' does not exist. '${n.name}' needs a global element of stereotype [${want}].`)
      else if (target.name !== def.config) add(n.lines['config-ref'], `Referenced component '${ref}' must be one of stereotypes [${want}].`)
    }
    if (n.name === 'flow-ref' && n.attrs.name && !isExpr(n.attrs.name) && !(named.get(n.attrs.name) && ELEMENTS[named.get(n.attrs.name).name]?.kind === 'flow')) add(n.lines.name, `'flow-ref' is pointing to '${n.attrs.name}' which does not exist`)
    if (n.name === 'error-handler' && n.attrs.ref && named.get(n.attrs.ref)?.name !== 'error-handler') add(n.lines.ref, `Referenced component '${n.attrs.ref}' must be one of stereotypes [MULE:ERROR_HANDLER].`)
    if (n.name === 'configuration' && n.attrs['defaultErrorHandler-ref'] && named.get(n.attrs['defaultErrorHandler-ref'])?.name !== 'error-handler') add(n.lines['defaultErrorHandler-ref'], `Referenced component '${n.attrs['defaultErrorHandler-ref']}' must be one of stereotypes [MULE:ERROR_HANDLER].`)
    // error types
    const checkType = (attr, declares) => {
      const value = n.attrs[attr]
      if (!value || isExpr(value)) return
      for (const t of declares ? [normalType(value)] : typeList(value)) {
        const [ns, id] = t.split(':')
        if (declares) {
          if (RESERVED.includes(ns)) add(n.lines[attr], `Cannot use error type '${t}': namespace already exists.`)
          continue
        }
        if (ns === '*' || id === '*') continue
        // lab: the runtime says "Could not find error" for a type it does not know; Studio marks the same attribute
        const known = (ERRORS[ns] && used.has(ns) && ERRORS[ns].includes(id)) || model.customTypes.includes(t)
        if (!known) add(n.lines[attr], ns === 'MULE' && !String(value).toUpperCase().includes('MULE:') ? `There's no MULE error named '${id}'.` : `Could not find error '${t}'.`)
      }
    }
    if (n.name === 'on-error-continue' || n.name === 'on-error-propagate') checkType('type', false)
    if (n.name === 'error-mapping') checkType('sourceType', false)
    if (n.name === 'raise-error') checkType('type', true)
    if (n.name === 'error-mapping') checkType('targetType', true)
    if (n.name === 'error-handler') handlerOrder(n, add)
  }
  for (const n of all)
    for (const [line, value] of [...Object.entries(n.attrs).map(([k, v]) => [n.lines[k], v]), [n.line, n.text]])
      for (const m of String(value ?? '').matchAll(/\$\{([^}]+)\}/g)) {
        const key = m[1].replace(/^secure::/, '')
        if (!model.placeholders.some((p) => p.key === key)) model.placeholders.push({ key, line })
      }
  return finish(model)
}
function finish(model) {
  model.problems.sort((a, b) => a.line - b.line)
  model.errors = model.problems.filter((p) => p.severity === 'error')
  model.ok = model.errors.length === 0
  return model
}

// The runtime refuses a handler without type and when that is not the last one. A handler after one that catches
// ANY can never run: the runtime accepts it, Studio and the lab warn (lab wording).
function handlerOrder(node, add) {
  const list = node.children.filter((c) => c.name === 'on-error-continue' || c.name === 'on-error-propagate')
  list.forEach((c, i) => {
    if (i < list.length - 1 && !c.attrs.type && !c.attrs.when) add(c.line, "Every handler (except for the last one) within an 'error-handler' must specify a 'when' or 'type' attribute.")
  })
  list.forEach((c, i) => {
    if (!c.attrs.type || c.attrs.when || isExpr(c.attrs.type)) return
    const mine = typeList(c.attrs.type)
    const before = list.slice(0, i).find((b) => !b.attrs.when && (!b.attrs.type || mine.every((t) => typeList(b.attrs.type).some((bt) => typeCatches(bt, t)))))
    if (before) add(c.line, `This ${c.name} is never reached. The ${before.name} at line ${before.line} above it already catches ${before.attrs.type ? before.attrs.type : 'every error'}.`, 'warning')
  })
}

// What the runtime adds at deploy time: every ${key} needs a value from the properties of the app
export function deployProblems(xml, props = {}) {
  const m = asModel(xml)
  const list = [...m.errors]
  if (m.root) for (const p of m.placeholders) if (props[p.key] === undefined || props[p.key] === '') list.push({ line: p.line, severity: 'error', message: `Couldn't find configuration property value for key \${${p.key}}` })
  return list
}
export const problemText = (p) => `[${XML_FILE}:${p.line}]: ${p.message}`

// ---------- questions a package can ask ----------

export const flowOf = (xml, name) => asModel(xml)?.flows[name] ?? null
export const partOf = (step, kind) => step?.parts.find((p) => p.kind === kind) ?? null
// every step below a list, depth first, with its ancestors. A flow-ref is followed into the flow it calls.
export function walk(xml, steps, fn, ancestors = [], seen = []) {
  const m = asModel(xml)
  for (const step of steps ?? []) {
    fn(step, ancestors)
    const inner = [step, ...ancestors]
    for (const p of step.parts) walk(m, [p], fn, inner, seen)
    walk(m, step.steps, fn, inner, seen)
    if (step.kind === 'flow-ref' && m?.flows[step.attrs.name] && !seen.includes(step.attrs.name)) walk(m, m.flows[step.attrs.name].steps, fn, inner, [...seen, step.attrs.name])
  }
}
export function stepsOf(xml, flow, kind) {
  const out = []
  walk(xml, flowOf(xml, flow)?.steps, (s, anc) => (!kind || s.kind === kind) && out.push({ ...s, ancestors: anc }))
  return out
}

// The error handler that runs for a flow: its own, the global one it refers to, or the default of <configuration>.
// null means the default error handler of Mule: it logs the error and propagates it.
export function errorHandlerOf(xml, flow) {
  const m = asModel(xml)
  const f = flowOf(m, flow)
  if (!f) return null
  const eh = f.errorHandler
  if (eh?.ref) return m.handlers[eh.ref] ?? null
  if (eh) return eh
  const dflt = m.globals.find((g) => g.type === 'configuration')?.attrs['defaultErrorHandler-ref']
  return dflt ? (m.handlers[dflt] ?? null) : null
}
// lab: a `when` expression is not run. A handler with only `when` is taken to match when its text names the error.
export function handlerMatches(h, errorType) {
  const t = normalType(errorType)
  if (h.types) return h.types.some((x) => typeCatches(x, t))
  if (!h.when) return true
  const [ns, id] = t.split(':')
  return h.when.toUpperCase().includes(id) && (ns === 'MULE' || h.when.toUpperCase().includes(ns))
}
export const handlerFor = (eh, errorType) => eh?.handlers.find((h) => handlerMatches(h, errorType)) ?? null

// The error type after the error mappings of an operation, such as HTTP:SERVICE_UNAVAILABLE mapped to APP:BACKEND
export function mappedType(step, errorType) {
  const t = normalType(errorType)
  const map = step?.parts.filter((p) => p.kind === 'error-mapping').find((p) => !p.attrs.sourceType || typeList(p.attrs.sourceType).some((x) => typeCatches(x, t)))
  return map ? normalType(map.attrs.targetType) : t
}

// What set-variable and ee:transform set, and the last payload set, in a list of steps
export function effectsOf(steps) {
  const vars = {}
  let payload = null
  const plain = (v) => String(v ?? '').trim().replace(/^#\[\s*([\s\S]*?)\s*\]$/, '$1').replace(/^["']|["']$/g, '')
  for (const s of steps ?? []) {
    if (s.kind === 'set-variable') vars[s.attrs.variableName] = plain(s.attrs.value)
    if (s.kind === 'set-payload') payload = s.attrs.value
    if (s.kind === 'ee:transform') {
      for (const v of partOf(s, 'ee:variables')?.parts ?? []) vars[v.attrs.variableName] = plain(dwBody(v.text))
      const p = partOf(partOf(s, 'ee:message'), 'ee:set-payload')
      if (p) payload = p.text
    }
  }
  return { vars, payload }
}
// The body of a DataWeave script after its header. Object literals become JSON where they can.
export function dwBody(script, err = {}) {
  let body = String(script ?? '')
  body = (body.includes('---') ? body.slice(body.indexOf('---') + 3) : body.replace(/^\s*#\[|\]\s*$/g, '')).trim()
  body = body
    .replace(/error\.description/g, JSON.stringify(err.description ?? ''))
    .replace(/error\.errorType\.identifier/g, JSON.stringify(String(err.type ?? '').split(':')[1] ?? ''))
    .replace(/error\.errorType\.namespace/g, JSON.stringify(String(err.type ?? '').split(':')[0] ?? ''))
    .replace(/error\.errorType\.asString/g, JSON.stringify(err.type ?? ''))
  const json = body.replace(/'([^']*)'/g, (_, s) => JSON.stringify(s)).replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
  try {
    return JSON.stringify(JSON.parse(json))
  } catch {
    return body
  }
}
function statusFrom(expr, vars, dflt) {
  const e = String(expr ?? '').trim()
  if (!e) return dflt
  if (/^\d{3}$/.test(e)) return Number(e)
  const m = /^#\[\s*vars\.(\w+)(?:\s+default\s+(\d{3}))?\s*\]$/.exec(e)
  if (m) return Number(vars[m[1]] ?? m[2] ?? dflt) || dflt
  return dflt
}

// What the caller of an HTTP flow gets when an error of this type reaches the flow's error handler.
// { kind: 'continue' | 'propagate' | 'default', handler, status, body, logged, flowFailed }
// `payload` is the payload as it was before the failed step (for an HTTP flow that is often the request body). An
// on-error-continue whose steps set no payload answers with it, as Mule does. Not given, it is taken as empty. The
// listener's statusCode is read when it is a number or #[vars.x default n].
export function outcomeOf(xml, flow, errorType, { description = '', payload: before = '' } = {}) {
  const f = flowOf(xml, flow)
  const eh = errorHandlerOf(xml, flow)
  const h = handlerFor(eh, errorType)
  const kind = h ? h.kind : 'default'
  const { vars, payload } = effectsOf(h?.steps)
  const listener = f?.source?.kind === 'http:listener' ? f.source : null
  const err = { description, type: normalType(errorType) }
  if (kind === 'continue') {
    const resp = partOf(listener, 'http:response')
    return { kind, handler: h, status: statusFrom(resp?.attrs.statusCode, vars, 200), body: payload == null ? String(before ?? '') : dwBody(payload, err), logged: h.logException, flowFailed: false }
  }
  const resp = partOf(listener, 'http:error-response')
  const bodyExpr = partOf(resp, 'http:body')?.text
  const body = bodyExpr && /payload/.test(bodyExpr) ? (payload == null ? '' : dwBody(payload, err)) : bodyExpr ? dwBody(bodyExpr, err) : description
  return { kind, handler: h, status: statusFrom(resp?.attrs.statusCode, vars, 500), body, logged: h ? h.logException : true, flowFailed: true }
}

// The status of a response that worked, from the statusCode of the listener's http:response
export const okStatus = (xml, flow, vars = {}) => {
  const f = flowOf(xml, flow)
  return statusFrom(partOf(f?.source?.kind === 'http:listener' ? f.source : null, 'http:response')?.attrs.statusCode, vars, 200)
}

// The error block Mule 4 writes to the log, with the element and the line of the real config
const STARS = '*'.repeat(80)
export function errorLog({ name, xml, flow, step, type, message, handler = 'propagate' }) {
  const f = flowOf(xml, flow)
  const at = Math.max(0, f?.steps.findIndex((s) => s === step || (s.line <= step?.line && (s.end ?? s.line) >= step?.line)) ?? 0)
  const where = `${flow}/processors/${at} @ ${name}:${XML_FILE}:${step?.line ?? 0} (${step?.name ?? flow})`
  const attrs = Object.entries(step?.attrs ?? {})
    .filter(([k]) => !k.startsWith('doc:id'))
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')
  return {
    level: 'ERROR',
    logger: handler === 'continue' ? 'org.mule.runtime.core.internal.exception.OnErrorContinueHandler' : 'org.mule.runtime.core.internal.exception.OnErrorPropagateHandler',
    text: ['', STARS, `Message               : ${message}`, `Element               : ${where}`, `Element DSL           : <${step?.kind ?? 'flow'}${attrs}>`, `Error type            : ${type}`, `FlowStack             : at ${flow}(${where})`, '  (set debug level logging or -Dmule.verbose.exceptions=true for everything)', STARS].join('\n'),
  }
}

const activeTx = (s) => s.kind === 'try' && ['ALWAYS_BEGIN', 'BEGIN_OR_JOIN'].includes(s.attrs.transactionalAction)
const TX_OPS = [...DB_OPS, 'jms:publish', 'jms:consume']

// The until-successful scopes of a flow: { line, name, maxRetries, millisBetweenRetries, inTransaction, kinds }
export function retryOf(xml, flow) {
  const out = []
  walk(xml, flowOf(xml, flow)?.steps, (s, anc) => {
    if (s.kind !== 'until-successful') return
    const kinds = []
    walk(xml, s.steps, (x) => kinds.push(x.kind))
    const num = (v, d) => (/^\d+$/.test(String(v ?? '').trim()) ? Number(v) : d)
    out.push({ line: s.line, name: s.name, maxRetries: num(s.attrs.maxRetries, 5), millisBetweenRetries: num(s.attrs.millisBetweenRetries, 60000), inTransaction: anc.some(activeTx), kinds })
  })
  return out
}

// The transactions of a flow. A try with ALWAYS_BEGIN or BEGIN_OR_JOIN starts a local (or XA) transaction. An operation
// inside joins it unless its transactionalAction is NOT_SUPPORTED. A local transaction is bound to the first config that
// joins it; an operation of another config cannot join (joined: false).
// { scopes: [{ line, action, type, config, ops, retries, requests, errorHandler }], ops, outside }
export function txOf(xml, flow) {
  const scopes = []
  const ops = []
  walk(xml, flowOf(xml, flow)?.steps, (s, anc) => {
    if (activeTx(s) && !anc.some(activeTx)) scopes.push({ line: s.line, name: s.name, action: s.attrs.transactionalAction, type: s.attrs.transactionType ?? 'LOCAL', config: null, ops: [], retries: [], requests: [], errorHandler: s.errorHandler ?? null, step: s })
    const tx = anc.find(activeTx)
    const scope = tx && scopes.find((x) => x.step === anc.findLast(activeTx))
    if (s.kind === 'until-successful' && scope) scope.retries.push(s.line)
    if (s.kind === 'http:request' && scope) scope.requests.push(s.line)
    if (!TX_OPS.includes(s.kind)) return
    const action = s.attrs.transactionalAction ?? 'JOIN_IF_POSSIBLE'
    const config = s.attrs['config-ref'] ?? null
    const inside = scope && action !== 'NOT_SUPPORTED' ? scope : null
    if (inside && inside.type === 'LOCAL') inside.config ??= config
    const op = { kind: s.kind, line: s.line, name: s.name, config, action, scope: inside ? scopes.indexOf(inside) : null, joined: Boolean(inside) && (inside.type === 'XA' || inside.config === config) }
    if (inside) inside.ops.push(op)
    ops.push(op)
  })
  return { scopes, ops, outside: ops.filter((o) => !o.joined) }
}
// Are all operations of this kind in one transaction?
export function inOneTx(xml, flow, kinds = ['db:insert']) {
  const { ops } = txOf(xml, flow)
  const list = ops.filter((o) => kinds.includes(o.kind))
  return list.length > 0 && list.every((o) => o.joined && o.scope === list[0].scope)
}

// The batch jobs of a flow: { line, jobName, maxFailedRecords, blockSize, steps: [{ name, acceptPolicy }] }
export function batchOf(xml, flow) {
  return stepsOf(xml, flow, 'batch:job').map((j) => ({
    line: j.line,
    jobName: j.attrs.jobName,
    maxFailedRecords: /^-?\d+$/.test(j.attrs.maxFailedRecords ?? '') ? Number(j.attrs.maxFailedRecords) : 0,
    blockSize: /^\d+$/.test(j.attrs.blockSize ?? '') ? Number(j.attrs.blockSize) : 100,
    steps: (partOf(j, 'batch:process-records')?.parts ?? []).filter((p) => p.kind === 'batch:step').map((p) => ({ name: p.attrs.name, acceptPolicy: p.attrs.acceptPolicy ?? 'NO_FAILURES', line: p.line })),
  }))
}
export const placeholdersOf = (xml) => asModel(xml)?.placeholders.map((p) => p.key) ?? []

// ---------- the editor ----------

// A line diff of two texts: [{ op: ' ' | '+' | '-', text, a, b }] with the line numbers of each side
export function diffLines(before, after) {
  const a = String(before ?? '').split('\n')
  const b = String(after ?? '').split('\n')
  const n = a.length
  const m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) out.push({ op: ' ', text: a[i], a: ++i, b: ++j })
    else if (i < n && (j >= m || lcs[i + 1][j] >= lcs[i][j + 1])) out.push({ op: '-', text: a[i], a: ++i })
    else out.push({ op: '+', text: b[j], b: ++j })
  }
  return out
}

// Draft text of the editor, kept in state.xmlDrafts so it survives a change of screen
export const draftOf = (state, name) => state.xmlDrafts?.[name] ?? null
export const setDraft = (state, name, text) => {
  const s = structuredClone(state)
  s.xmlDrafts = { ...s.xmlDrafts }
  if (text == null) delete s.xmlDrafts[name]
  else s.xmlDrafts[name] = text
  return s
}
