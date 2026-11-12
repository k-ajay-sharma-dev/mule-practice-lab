// Generates simplified Mule 4 configuration XML from a design, to show what the canvas
// corresponds to. Global configurations (connector configs) are omitted.
import { COMPONENTS } from './catalog.js'

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function attrs(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '' && String(v) !== '0')
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('')
}

const pad = (depth) => '  '.repeat(depth)

function el(depth, name, attributes = {}, children = null) {
  const a = attrs(attributes)
  if (!children || !children.length) return `${pad(depth)}<${name}${a}/>`
  return `${pad(depth)}<${name}${a}>\n${children.join('\n')}\n${pad(depth)}</${name}>`
}

function list(nodes, depth) {
  return nodes.map((n) => nodeXml(n, depth))
}

function errorHandler(handlers, depth) {
  if (!handlers?.length) return []
  return [el(depth, 'error-handler', {}, list(handlers, depth + 1))]
}

// One global Database Config per database product; the connection element differs per product.
const DB_CONFIGS = {
  Oracle: {
    name: 'Oracle_Config',
    connection: ['db:oracle-connection', { host: '${oracle.host}', port: '1521', user: '${oracle.user}', password: '${secure::oracle.password}', serviceName: '${oracle.service}' }],
  },
  'SQL Server': {
    name: 'SQL_Server_Config',
    connection: ['db:mssql-connection', { host: '${mssql.host}', port: '1433', user: '${mssql.user}', password: '${secure::mssql.password}', databaseName: '${mssql.database}' }],
  },
  MySQL: {
    name: 'MySQL_Config',
    connection: ['db:my-sql-connection', { host: '${mysql.host}', port: '3306', user: '${mysql.user}', password: '${secure::mysql.password}', database: '${mysql.database}' }],
  },
  // PostgreSQL has no dedicated connection type: it uses the generic JDBC connection with the driver class
  PostgreSQL: {
    name: 'PostgreSQL_Config',
    connection: ['db:generic-connection', { url: 'jdbc:postgresql://${pg.host}:5432/${pg.database}', driverClassName: 'org.postgresql.Driver', user: '${pg.user}', password: '${secure::pg.password}' }],
  },
}
const dbConfigRef = (c) => DB_CONFIGS[c.database]?.name ?? 'Database_Config'

function dbGlobals(body) {
  return Object.values(DB_CONFIGS)
    .filter((g) => body.includes(`config-ref="${g.name}"`))
    .map((g) => el(1, 'db:config', { name: g.name }, [el(2, ...g.connection)]))
}

// Shared by the File, FTP and SFTP connectors (same operations, different namespace)
function fileOp(prefix, op, c, d) {
  const ref = { file: 'File_Config', ftp: 'FTP_Config', sftp: 'SFTP_Config' }[prefix]
  switch (op) {
    case 'read':
      return el(d, `${prefix}:read`, { 'config-ref': ref, path: c.path, outputMimeType: c.outputMimeType === '(auto)' ? undefined : c.outputMimeType })
    case 'list':
      return el(d, `${prefix}:list`, { 'config-ref': ref, directoryPath: c.directoryPath, recursive: c.recursive === 'true' ? 'true' : undefined },
        c.matcher ? [el(d + 1, `${prefix}:matcher`, { filenamePattern: c.matcher })] : null)
    case 'delete':
      return el(d, `${prefix}:delete`, { 'config-ref': ref, path: c.path })
    case 'rename':
      return el(d, `${prefix}:rename`, { 'config-ref': ref, path: c.path, to: c.to })
    case 'copy':
      return el(d, `${prefix}:copy`, { 'config-ref': ref, sourcePath: c.sourcePath, targetPath: c.targetPath, overwrite: c.overwrite === 'true' ? 'true' : undefined, renameTo: c.renameTo })
    case 'create-directory':
      return el(d, `${prefix}:create-directory`, { 'config-ref': ref, directoryPath: c.directoryPath })
    default:
      return `${pad(d)}<!-- ${prefix}-${op} -->`
  }
}

// What a file listener does with a file once read, and how long it waits for the file to stop growing
const postAction = (c) => ({
  autoDelete: c.postAction === 'delete' ? 'true' : undefined,
  moveToDirectory: c.postAction === 'move' ? c.moveTo : undefined,
  renameTo: c.postAction === 'rename' ? c.renameTo : undefined,
  timeBetweenSizeCheck: c.timeBetweenSizeCheck,
  timeBetweenSizeCheckUnit: c.timeBetweenSizeCheck ? 'MILLISECONDS' : undefined,
})

const txAttrs = (c) =>
  c.transactionalAction === 'ALWAYS_BEGIN' ? { transactionalAction: 'ALWAYS_BEGIN', transactionType: c.transactionType } : {}

// Salesforce Replay listeners: streamingChannel, topic, replayOption, replayId and autoReplay appear in the docs' samples.
const replayAttrs = (c) => ({
  'config-ref': 'Salesforce_Config',
  replayOption: c.replayOption,
  replayId: c.replayOption === 'FROM_REPLAY_ID' ? c.replayId : undefined,
  autoReplay: c.autoReplay === 'true' ? 'true' : undefined,
})

// The docs' XML shows `key` on sap:send, sap:sync-rfc and sap:async-rfc. The current RFC elements are
// documented only by the display name Function Name, so confirm that attribute in Studio.
const sapGateway = (c) => ({ 'config-ref': 'SAP_Config', gatewayHost: c.gatewayHost, gatewayService: c.gatewayService, programID: c.programID })

// A streaming strategy other than the default is written as the first child element, as Studio does:
// <http:request ...><repeatable-in-memory-stream/></http:request>
export function nodeXml(n, d) {
  const xml = elementXml(n, d)
  const strategy = n.config?.streamingStrategy
  const field = COMPONENTS[n.type]?.fields?.find((f) => f.key === 'streamingStrategy')
  if (!field || !strategy || strategy === field.default) return xml
  const [first, ...rest] = xml.split('\n')
  const child = el(d + 1, strategy)
  if (!first.endsWith('/>')) return [first, child, ...rest].join('\n')
  const name = first.match(/<([\w:.-]+)/)[1]
  return [`${first.slice(0, -2)}>`, child, `${pad(d)}</${name}>`, ...rest].join('\n')
}

function elementXml(n, d) {
  const c = n.config ?? {}
  const steps = () => list(n.steps ?? [], d + 1)
  switch (n.type) {
    // Sources
    case 'http-listener':
      return el(d, 'http:listener', { 'config-ref': 'HTTP_Listener_config', path: c.path, allowedMethods: c.allowedMethods })
    case 'scheduler': {
      const strategy =
        c.strategy === 'cron'
          ? el(d + 2, 'cron', { expression: c.expression })
          : el(d + 2, 'fixed-frequency', { frequency: c.frequency, timeUnit: c.timeUnit })
      return el(d, 'scheduler', {}, [el(d + 1, 'scheduling-strategy', {}, [strategy])])
    }
    case 'sftp-listener':
      return el(d, 'sftp:listener', { 'config-ref': 'SFTP_Config', directory: c.directory, ...postAction(c) }, [el(d + 1, 'sftp:matcher', { filenamePattern: c.matcher })])
    case 'file-listener':
      return el(d, 'file:listener', {
        'config-ref': 'File_Config',
        directory: c.directory,
        ...postAction(c),
        watermarkMode: c.watermarkMode && c.watermarkMode !== 'DISABLED' ? c.watermarkMode : undefined,
      }, [
        el(d + 1, 'file:matcher', { filenamePattern: c.matcher }),
      ])
    case 'email-listener':
      return el(d, 'email:listener-imap', {
        'config-ref': 'Email_IMAP',
        folder: c.folder,
        deleteAfterRetrieve: c.deleteAfterRetrieve === 'true' ? 'true' : undefined,
        enableWatermark: c.enableWatermark === 'false' ? 'false' : undefined,
      }, c.subjectRegex ? [el(d + 1, 'email:imap-matcher', { subjectRegex: c.subjectRegex })] : null)
    case 'email-listener-pop3':
      return el(d, 'email:listener-pop3', { 'config-ref': 'Email_POP3', folder: c.folder, deleteAfterRetrieve: c.deleteAfterRetrieve === 'true' ? 'true' : undefined })
    case 'mq-subscriber':
      return el(d, 'anypoint-mq:subscriber', { 'config-ref': 'Anypoint_MQ_Config', destination: c.destination, acknowledgementMode: c.acknowledgementMode })
    case 'jms-listener':
      return el(d, 'jms:listener', {
        'config-ref': 'JMS_Config',
        destination: c.destination,
        ackMode: c.ackMode,
        selector: c.selector,
        numberOfConsumers: c.numberOfConsumers === 4 ? undefined : c.numberOfConsumers,
        ...txAttrs(c),
      }, c.durable === 'true' || c.subscriptionName
        ? [el(d + 1, 'jms:consumer-type', {}, [el(d + 2, 'jms:topic-consumer', { durable: c.durable === 'true' ? 'true' : undefined, subscriptionName: c.subscriptionName })])]
        : null)
    case 'vm-listener':
      return el(d, 'vm:listener', { 'config-ref': 'VM_Config', queueName: c.queueName, ...txAttrs(c) })
    case 'db-listener':
      return el(d, 'db:listener', { 'config-ref': dbConfigRef(c), table: c.table, watermarkColumn: c.watermarkColumn, idColumn: c.idColumn })
    case 'sf-listener':
      return el(d, `salesforce:${c.event}-object-listener`, { 'config-ref': 'Salesforce_Config', objectType: c.objectType })
    case 'sf-replay-channel':
      return el(d, 'salesforce:replay-channel-listener', { streamingChannel: c.streamingChannel, ...replayAttrs(c) })
    case 'sf-replay-topic':
      return el(d, 'salesforce:replay-topic-listener', { topic: c.topic, ...replayAttrs(c) })
    case 'sap-document-listener':
      return el(d, 'sap:document-listener', { ...sapGateway(c), idocTypeFilterRegex: c.idocTypeFilterRegex })
    case 'sap-function-listener':
      return el(d, 'sap:function-listener', sapGateway(c))
    case 'wd-modified-objects':
      return el(d, 'workday:modified-objects-listener', {
        'config-ref': 'Workday_Config',
        objectType: c.objectType,
        updatedFrom: c.updatedFrom,
        watermarkEnabled: c.watermarkEnabled === 'true' ? 'true' : undefined,
      }, [el(d + 1, 'scheduling-strategy', {}, [el(d + 2, 'fixed-frequency', { frequency: c.frequency, timeUnit: c.timeUnit })])])
    case 'ftp-listener':
      return el(d, 'ftp:listener', {
        'config-ref': 'FTP_Config',
        directory: c.directory,
        ...postAction(c),
        watermarkEnabled: c.watermarkEnabled === 'true' ? 'true' : undefined,
        applyPostActionWhenFailed: c.applyPostActionWhenFailed === 'false' ? 'false' : undefined,
      }, [el(d + 1, 'ftp:matcher', { filenamePattern: c.matcher })])
    case 'kafka-listener':
      // topic and group id live on the consumer configuration, not on the listener
      return el(d, 'kafka:message-listener', { 'config-ref': 'Kafka_Consumer_config', ackMode: c.ackMode, parallelConsumersAmount: c.parallelConsumersAmount === 1 ? undefined : c.parallelConsumersAmount })
    case 'kafka-batch-listener':
      return el(d, 'kafka:batch-message-listener', { 'config-ref': 'Kafka_Consumer_config', ackMode: c.ackMode, parallelConsumersAmount: c.parallelConsumersAmount === 1 ? undefined : c.parallelConsumersAmount })
    case 'sqs-receive':
      return el(d, 'sqs:receivemessages', { 'config-ref': 'Amazon_SQS_Configuration', queueUrl: c.queueUrl, numberOfMessages: c.numberOfMessages, preserveMessages: c.preserveMessages === 'true' ? 'true' : undefined })

    // Core
    case 'logger':
      return el(d, 'logger', { level: c.level, message: c.message })
    case 'transform': {
      const target =
        c.target === 'variable'
          ? `${pad(d + 2)}<ee:set-variable variableName="${esc(c.variableName)}"><![CDATA[${c.script}]]></ee:set-variable>`
          : `${pad(d + 2)}<ee:set-payload><![CDATA[${c.script}]]></ee:set-payload>`
      return `${pad(d)}<ee:transform>\n${pad(d + 1)}<ee:message>\n${target}\n${pad(d + 1)}</ee:message>\n${pad(d)}</ee:transform>`
    }
    case 'set-payload':
      return el(d, 'set-payload', { value: c.value })
    case 'set-variable':
      return el(d, 'set-variable', { variableName: c.variableName, value: c.value })
    case 'flow-ref':
      return el(d, 'flow-ref', { name: c.name, target: c.target })
    case 'apikit-router':
      return el(d, 'apikit:router', { config: c.config })
    case 'raise-error':
      return el(d, 'raise-error', { type: c.type, description: c.description })
    case 'validation': {
      if (c.check === 'json-schema') return el(d, 'json:validate-schema', { schema: c.expression })
      // 'is-not-empty' is the old palette name, kept so designs saved before the rename still export
      const op = c.check === 'is-not-empty' ? 'is-not-blank-string' : c.check
      const attrName = { 'is-true': 'expression', 'matches-regex': 'regex', 'is-email': 'email', 'is-not-empty-collection': 'values' }[op] ?? 'value'
      return el(d, `validation:${op}`, { [attrName]: c.expression, message: c.message })
    }
    case 'idempotent':
      return el(d, 'idempotent-message-validator', { idExpression: c.idExpression, objectStore: c.objectStore })
    case 'os-store':
      return el(d, 'os:store', { key: c.key, objectStore: c.objectStore }, [el(d + 1, 'os:value', {}, [`${pad(d + 2)}${esc(c.value)}`])])
    case 'parse-template':
      return el(d, 'parse-template', { location: c.location })
    case 'os-remove':
      return el(d, 'os:remove', { key: c.key, objectStore: c.objectStore })
    case 'os-retrieve':
      return el(d, 'os:retrieve', { key: c.key, objectStore: c.objectStore })

    // Routers
    case 'choice':
      return el(d, 'choice', {}, [
        ...n.routes.map((r) => el(d + 1, 'when', { expression: r.config.expression }, list(r.steps, d + 2))),
        el(d + 1, 'otherwise', {}, list(n.otherwise ?? [], d + 2)),
      ])
    case 'scatter-gather':
      return el(d, 'scatter-gather', { timeout: c.timeout, maxConcurrency: c.maxConcurrency }, n.routes.map((r) => el(d + 1, 'route', {}, list(r.steps, d + 2))))
    case 'first-successful':
      return el(d, 'first-successful', {}, n.routes.map((r) => el(d + 1, 'route', {}, list(r.steps, d + 2))))
    case 'round-robin':
      return el(d, 'round-robin', {}, n.routes.map((r) => el(d + 1, 'route', {}, list(r.steps, d + 2))))

    // Scopes
    case 'foreach':
      return el(d, 'foreach', { collection: c.collection, batchSize: c.batchSize === 1 ? undefined : c.batchSize }, steps())
    case 'parallel-foreach':
      return el(d, 'parallel-foreach', { collection: c.collection, maxConcurrency: c.maxConcurrency, timeout: c.timeout }, steps())
    case 'try':
      return el(d, 'try', { transactionalAction: c.transactionalAction === 'INDIFFERENT' ? undefined : c.transactionalAction }, [
        ...steps(),
        ...errorHandler(n.errorHandlers, d + 1),
      ])
    case 'until-successful':
      return el(d, 'until-successful', { maxRetries: c.maxRetries, millisBetweenRetries: c.millisBetweenRetries }, steps())
    case 'async':
      return el(d, 'async', { maxConcurrency: c.maxConcurrency }, steps())
    case 'cache':
      return el(d, 'ee:cache', { 'cachingStrategy-ref': c.cachingStrategy }, steps())
    case 'batch-job':
      return el(d, 'batch:job', { jobName: c.jobName, blockSize: c.blockSize, maxFailedRecords: c.maxFailedRecords }, [
        el(d + 1, 'batch:process-records', {}, n.routes.map((r) =>
          el(d + 2, 'batch:step', {
            name: r.config.name,
            acceptPolicy: r.config.acceptPolicy === 'NO_FAILURES' ? undefined : r.config.acceptPolicy,
            acceptExpression: r.config.acceptExpression,
          }, list(r.steps, d + 3)),
        )),
        el(d + 1, 'batch:on-complete', {}, list(n.onComplete ?? [], d + 2)),
      ])
    case 'batch-aggregator':
      return el(d, 'batch:aggregator', { size: c.streaming === 'true' ? undefined : c.size, streaming: c.streaming === 'true' ? 'true' : undefined }, steps())

    // Connectors
    case 'http-request':
      return el(d, 'http:request', { method: c.method, 'config-ref': 'HTTP_Request_config', path: c.path, responseTimeout: c.responseTimeout })
    case 'db-select':
    case 'db-insert':
    case 'db-bulk-insert':
    case 'db-update':
    case 'db-bulk-update':
    case 'db-delete':
    case 'db-stored-procedure': {
      const op = n.type.replace('db-', '')
      const select = n.type === 'db-select' ? { fetchSize: c.fetchSize, maxRows: c.maxRows } : {}
      return el(d, `db:${op}`, { 'config-ref': dbConfigRef(c), ...select }, [`${pad(d + 1)}<db:sql><![CDATA[${c.sql}]]></db:sql>`])
    }
    case 'sf-query':
      return el(d, 'salesforce:query', { 'config-ref': 'Salesforce_Config' }, [`${pad(d + 1)}<salesforce:salesforce-query><![CDATA[${c.soql}]]></salesforce:salesforce-query>`])
    case 'sf-upsert':
      return el(d, 'salesforce:upsert', { 'config-ref': 'Salesforce_Config', objectType: c.objectType, externalIdFieldName: c.externalIdField })
    case 'sf-create':
      return el(d, 'salesforce:create', { 'config-ref': 'Salesforce_Config', type: c.objectType })
    case 'sf-update':
      return el(d, 'salesforce:update', { 'config-ref': 'Salesforce_Config', type: c.objectType })
    case 'sf-delete':
      return el(d, 'salesforce:delete', { 'config-ref': 'Salesforce_Config' })
    case 'sf-query-all':
    case 'sf-query-xml-stream':
      return el(d, `salesforce:${n.type.replace('sf-', '')}`, { 'config-ref': 'Salesforce_Config' }, [`${pad(d + 1)}<salesforce:salesforce-query><![CDATA[${c.soql}]]></salesforce:salesforce-query>`])
    case 'sf-publish-platform-event':
      return el(d, 'salesforce:publish-platform-event-message', { 'config-ref': 'Salesforce_Config', platformEventName: c.platformEventName })
    case 'sf-create-job-v2':
      return el(d, 'salesforce:create-job-bulk-api-v2', {
        'config-ref': 'Salesforce_Config',
        objectType: c.objectType,
        operation: c.operation,
        externalIdFieldName: c.externalIdFieldName,
        lineEnding: c.lineEnding === 'LF' ? undefined : c.lineEnding,
        columnDelimiter: c.columnDelimiter === 'COMMA' ? undefined : c.columnDelimiter,
        target: c.target,
      })
    case 'sf-create-query-job-v2':
      return el(d, 'salesforce:create-query-job-bulk-api-v2', { 'config-ref': 'Salesforce_Config', query: c.query, operation: c.operation === 'QUERY' ? undefined : c.operation })
    case 'sf-get-job-state-v2':
      return el(d, 'salesforce:get-job-state-bulk-api-v2', { 'config-ref': 'Salesforce_Config', jobId: c.jobId })
    case 'sf-abort-job-v2':
      return el(d, 'salesforce:abort-job-bulk-api-v2', { 'config-ref': 'Salesforce_Config', jobId: c.jobId })
    case 'sf-retrieve-failed-v2':
      return el(d, 'salesforce:retrieve-job-failed-results-bulk-v2', { 'config-ref': 'Salesforce_Config', jobId: c.jobId })
    case 'sf-retrieve-successful-v2':
      return el(d, 'salesforce:retrieve-job-successful-results-bulk-v2', { 'config-ref': 'Salesforce_Config', jobId: c.jobId })
    case 'sf-retrieve-unprocessed-v2':
      return el(d, 'salesforce:retrieve-job-unprocessed-results-bulk-v2', { 'config-ref': 'Salesforce_Config', jobId: c.jobId })
    case 'sf-get-query-job-info-v2':
      return el(d, 'salesforce:get-query-job-info-bulk-api-v2', { 'config-ref': 'Salesforce_Config', id: c.jobId })
    case 'sf-get-query-job-results-v2':
      return el(d, 'salesforce:get-query-job-results-bulk-api-v2', { 'config-ref': 'Salesforce_Config', id: c.jobId })
    case 'sap-send-idoc':
      return el(d, 'sap:send', { 'config-ref': 'SAP_Config', key: c.key, transactionId: c.transactionId, queueName: c.queueName, version: c.version })
    case 'sap-sync-rfc':
      return el(d, 'sap:synchronous-remote-function-call', { 'config-ref': 'SAP_Config', key: c.key, target: c.target })
    case 'sap-async-rfc':
      return el(d, 'sap:asynchronous-remote-function-call', { 'config-ref': 'SAP_Config', key: c.key, transactionId: c.transactionId, queueName: c.queueName })
    case 'sap-start-transaction':
      return el(d, 'sap:create-transaction-id', { 'config-ref': 'SAP_Config', target: c.target })
    case 'sap-confirm-transaction':
      return el(d, 'sap:confirm-transaction-id', { 'config-ref': 'SAP_Config', transactionId: c.transactionId })
    case 'sap-get-function':
      return el(d, 'sap:get-function', { 'config-ref': 'SAP_Config', key: c.key })
    case 'sap-retrieve-idoc':
      return el(d, 'sap:retrieve-idoc', { 'config-ref': 'SAP_Config', key: c.key })
    case 'wd-human-resources':
    case 'wd-staffing':
    case 'wd-recruiting':
    case 'wd-compensation':
    case 'wd-benefits-administration':
    case 'wd-absence-management':
    case 'wd-time-tracking':
    case 'wd-payroll':
    case 'wd-talent':
    case 'wd-learning':
    case 'wd-identity-management':
    case 'wd-integrations':
    case 'wd-financial-management':
      return el(d, `workday:${n.type.replace('wd-', '')}`, { 'config-ref': 'Workday_Config', operation: c.operation, target: c.target })
    case 'sftp-write':
      return el(d, 'sftp:write', { 'config-ref': 'SFTP_Config', path: c.path, mode: c.mode })
    case 'sftp-move':
      return el(d, 'sftp:move', { 'config-ref': 'SFTP_Config', sourcePath: c.sourcePath, targetPath: c.targetPath })
    case 'file-write':
      return el(d, 'file:write', { 'config-ref': 'File_Config', path: c.path, mode: c.mode })
    case 'file-move':
      return c.renameTo
        ? el(d, 'file:rename', { 'config-ref': 'File_Config', path: c.sourcePath, to: c.renameTo })
        : el(d, 'file:move', { 'config-ref': 'File_Config', sourcePath: c.sourcePath, targetPath: c.targetPath })
    case 's3-put':
      return el(d, 's3:put-object', { 'config-ref': 'Amazon_S3_Configuration', bucketName: c.bucket, key: c.key })
    case 'mq-publish':
      return el(d, 'anypoint-mq:publish', { 'config-ref': 'Anypoint_MQ_Config', destination: c.destination })
    case 'mq-consume':
      return el(d, 'anypoint-mq:consume', { 'config-ref': 'Anypoint_MQ_Config', destination: c.destination, acknowledgementMode: c.acknowledgementMode })
    case 'mq-ack':
      return el(d, 'anypoint-mq:ack', { 'config-ref': 'Anypoint_MQ_Config', ackToken: c.ackToken })
    case 'mq-nack':
      return el(d, 'anypoint-mq:nack', { 'config-ref': 'Anypoint_MQ_Config', ackToken: c.ackToken })
    case 'jms-publish':
      return el(d, 'jms:publish', {
        'config-ref': 'JMS_Config',
        destination: c.destination,
        destinationType: c.destinationType === 'TOPIC' ? 'TOPIC' : undefined,
        persistentDelivery: c.persistentDelivery === 'true' ? 'true' : undefined,
        priority: c.priority === 4 ? undefined : c.priority,
        timeToLive: c.timeToLive,
      })
    case 'jms-ack':
      return el(d, 'jms:ack', { ackId: c.ackId })
    case 'jms-recover-session':
      return el(d, 'jms:recover-session', { ackId: c.ackId })
    case 'jms-consume':
      return el(d, 'jms:consume', { 'config-ref': 'JMS_Config', destination: c.destination, ackMode: c.ackMode, maximumWait: c.maximumWait === 10000 ? undefined : c.maximumWait, selector: c.selector })
    case 'jms-publish-consume':
      return el(
        d,
        'jms:publish-consume',
        { 'config-ref': 'JMS_Config', destination: c.destination },
        c.maximumWait && c.maximumWait !== 10000 ? [el(d + 1, 'jms:consume-configuration', { maximumWait: c.maximumWait, maximumWaitUnit: 'MILLISECONDS' })] : null,
      )
    case 'vm-publish':
      return el(d, 'vm:publish', { 'config-ref': 'VM_Config', queueName: c.queueName })
    case 'email-send':
      return el(d, 'email:send', { 'config-ref': 'Email_SMTP', subject: c.subject }, [
        el(d + 1, 'email:to-addresses', {}, String(c.toAddresses ?? '').split(',').map((a) => el(d + 2, 'email:to-address', { value: a.trim() }))),
        `${pad(d + 1)}<email:body contentType="${esc(c.contentType ?? 'text/plain')}">\n${pad(d + 2)}<email:content>${esc(c.content ?? '#[payload]')}</email:content>\n${pad(d + 1)}</email:body>`,
        ...(c.attachments ? [`${pad(d + 1)}<email:attachments>${esc(c.attachments)}</email:attachments>`] : []),
      ])
    case 'email-list-imap':
      return el(d, 'email:list-imap', { 'config-ref': 'Email_IMAP', mailboxFolder: c.mailboxFolder, limit: c.limit === -1 ? undefined : c.limit })
    case 'email-mark-read':
      return el(d, 'email:mark-as-read', { 'config-ref': 'Email_IMAP', emailId: c.emailId })
    case 'email-move':
      return el(d, 'email:move-to-folder', { 'config-ref': 'Email_IMAP', emailId: c.emailId, targetFolder: c.targetFolder, createTargetFolder: c.createTargetFolder === 'true' ? 'true' : undefined })
    case 'email-delete':
      return el(d, 'email:delete', { 'config-ref': 'Email_IMAP', emailId: c.emailId })
    case 'wsc-consume':
      return el(d, 'wsc:consume', { 'config-ref': 'Web_Service_Consumer_Config', operation: c.operation })

    case 'ftp-write':
      return el(d, 'ftp:write', { 'config-ref': 'FTP_Config', path: c.path, mode: c.mode, createParentDirectories: c.createParentDirectories === 'false' ? 'false' : undefined })
    case 'ftp-move':
      return el(d, 'ftp:move', { 'config-ref': 'FTP_Config', sourcePath: c.sourcePath, targetPath: c.targetPath, overwrite: c.overwrite === 'true' ? 'true' : undefined })
    case 's3-get':
      return el(d, 's3:get-object', { 'config-ref': 'Amazon_S3_Configuration', bucketName: c.bucket, key: c.key })
    case 's3-list':
      return el(d, 's3:list-objects', { 'config-ref': 'Amazon_S3_Configuration', bucketName: c.bucket, prefix: c.prefix })
    case 's3-delete':
      return el(d, 's3:delete-object', { 'config-ref': 'Amazon_S3_Configuration', bucketName: c.bucket, key: c.key })
    case 'azure-upload-blob':
      return el(d, 'azure-storage:upload-blob', { 'config-ref': 'Azure_Storage_Config', contentType: c.contentType }, [
        el(d + 1, 'azure-storage:storblob', { container: c.container, fileName: c.fileName, fileStream: c.fileStream }),
      ])
    case 'azure-download-blob':
    case 'azure-delete-blob':
      return el(d, `azure-storage:${n.type.replace('azure-', '')}`, { 'config-ref': 'Azure_Storage_Config' }, [
        el(d + 1, 'azure-storage:blob', { container: c.container, fileName: c.fileName }),
      ])
    case 'azure-list-blobs':
      return el(d, 'azure-storage:list-blobs-in-container', { 'config-ref': 'Azure_Storage_Config', containerName: c.containerName, blobPath: c.blobPath })
    case 'kafka-publish':
      return el(d, 'kafka:publish', { 'config-ref': 'Kafka_Producer_config', topic: c.topic, key: c.key })
    case 'kafka-bulk-publish':
      return el(d, 'kafka:bulk-publish', { 'config-ref': 'Kafka_Producer_config', messages: c.messages === '#[payload]' ? undefined : c.messages })
    case 'kafka-commit':
      return el(d, 'kafka:commit', { 'config-ref': 'Kafka_Consumer_config', consumerCommitKey: c.consumerCommitKey })
    case 'kafka-consume':
      return el(d, 'kafka:consume', { 'config-ref': 'Kafka_Consumer_config', ackMode: c.ackMode, timeout: c.timeout, timeoutTimeUnit: c.timeoutTimeUnit })
    case 'kafka-seek':
      return `${pad(d)}<kafka:seek config-ref="Kafka_Consumer_config" topic="${esc(c.topic)}" partition="${esc(c.partition)}" offset="${esc(c.offset)}"/>`
    case 'sqs-send':
      return el(d, 'sqs:send-message', { 'config-ref': 'Amazon_SQS_Configuration', queueUrl: c.queueUrl }, [
        el(d + 1, 'sqs:message', { body: c.body, groupId: c.groupId, deduplicationId: c.deduplicationId }),
      ])
    case 'sqs-delete':
      return el(d, 'sqs:delete-message', { 'config-ref': 'Amazon_SQS_Configuration', queueUrl: c.queueUrl, receiptHandle: c.receiptHandle })

    // JSON & XML modules
    case 'json-validate':
      return el(d, 'json:validate-schema', { schema: c.schema, content: c.content === '#[payload]' ? undefined : c.content })
    case 'xml-validate':
      return el(d, 'xml-module:validate-schema', { 'config-ref': 'XML_Config', schemas: c.schemas, schemaLanguage: c.schemaLanguage === 'W3C' ? undefined : c.schemaLanguage })
    case 'xml-xpath':
      return el(d, 'xml-module:xpath-extract', { 'config-ref': 'XML_Config', xpath: c.xpath, target: c.target })
    case 'xml-xslt':
      return `${pad(d)}<xml-module:xslt-transform config-ref="XML_Config" outputMimeType="${esc(c.outputMimeType)}">\n${pad(d + 1)}<xml-module:xslt><![CDATA[${c.xslt}]]></xml-module:xslt>\n${pad(d)}</xml-module:xslt-transform>`

    // Error handlers
    case 'on-error-propagate':
    case 'on-error-continue':
      return el(d, n.type, { type: c.type === 'ANY' ? undefined : c.type, when: c.when }, steps())

    default: {
      const m = /^(file|ftp|sftp)-(read|list|delete|rename|copy|create-directory)$/.exec(n.type)
      return m ? fileOp(m[1], m[2], c, d) : `${pad(d)}<!-- ${n.type} -->`
    }
  }
}

function flowXml(f) {
  if (f.kind === 'sub-flow') return el(1, 'sub-flow', { name: f.name }, list(f.steps, 2))
  const children = [...(f.source ? [nodeXml(f.source, 2)] : []), ...list(f.steps, 2), ...errorHandler(f.errorHandlers, 2)]
  return el(1, 'flow', { name: f.name }, children)
}

// Declare only the namespace prefixes the body actually uses.
function namespaces(body) {
  // CDATA (DataWeave, XSLT) may contain its own prefixes, e.g. xsl: — those are not Mule namespaces
  const markup = body.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
  const prefixes = [...new Set([...markup.matchAll(/<([a-z][a-z0-9-]*):/g)].map((m) => m[1]))].sort()
  return [
    'xmlns="http://www.mulesoft.org/schema/mule/core"',
    ...prefixes.map((p) => `xmlns:${p}="http://www.mulesoft.org/schema/mule/${p === 'ee' ? 'ee/core' : p}"`),
  ]
}

export function toXml(design) {
  const flows = design.flows.map(flowXml).join('\n\n')
  const globals = dbGlobals(flows)
  const body = globals.length ? `${globals.join('\n\n')}\n\n${flows}` : flows
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated from the Flow Designer. Simplified: most global connector configs,
     doc:name attributes and schema locations are omitted. -->
<mule ${namespaces(body).join('\n      ')}>

${body}

</mule>`
}
