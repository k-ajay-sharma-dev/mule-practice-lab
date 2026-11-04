// Building blocks for the Architecture Designer. Each node type lives in a fixed lane, so a diagram
// always reads top to bottom: consumers → edge → experience → process → messaging → system → backends.

export const LANES = [
  { key: 'consumers', label: 'Consumers & channels' },
  { key: 'edge', label: 'Edge & security' },
  { key: 'experience', label: 'Experience APIs' },
  { key: 'process', label: 'Process APIs & jobs' },
  { key: 'messaging', label: 'Messaging & events' },
  { key: 'system', label: 'System APIs' },
  { key: 'backends', label: 'Systems of record & data' },
]

export const NODE_TYPES = {
  // consumers
  'mobile-app': { label: 'Mobile app', lane: 'consumers', glyph: '📱' },
  'web-app': { label: 'Web app', lane: 'consumers', glyph: '🖥' },
  partner: { label: 'Partner / B2B client', lane: 'consumers', glyph: '🤝' },
  'internal-app': { label: 'Internal / staff app', lane: 'consumers', glyph: '🏢' },
  chatbot: { label: 'Chatbot / voice', lane: 'consumers', glyph: '💬' },
  device: { label: 'IoT device / kiosk', lane: 'consumers', glyph: '📟' },
  // edge
  'api-gateway': { label: 'API gateway / policies', lane: 'edge', glyph: '🛡' },
  'identity-provider': { label: 'Identity provider', lane: 'edge', glyph: '🔑' },
  'load-balancer': { label: 'Load balancer / ingress', lane: 'edge', glyph: '⚖' },
  // API-led layers
  'experience-api': { label: 'Experience API', lane: 'experience', glyph: 'E', api: true },
  'process-api': { label: 'Process API', lane: 'process', glyph: 'P', api: true },
  'batch-job': { label: 'Batch / scheduled job', lane: 'process', glyph: '⏱' },
  'system-api': { label: 'System API', lane: 'system', glyph: 'S', api: true },
  // messaging
  queue: { label: 'Queue', lane: 'messaging', glyph: '▤' },
  topic: { label: 'Topic / exchange', lane: 'messaging', glyph: '⇶' },
  'event-stream': { label: 'Event stream (Kafka)', lane: 'messaging', glyph: '≋' },
  dlq: { label: 'Dead-letter queue', lane: 'messaging', glyph: '⚠' },
  'cloud-queue': { label: 'Cloud queue (SQS / Azure Service Bus)', lane: 'messaging', glyph: '▤' },
  // backends and data
  erp: { label: 'ERP (SAP, Oracle…)', lane: 'backends', glyph: '▦' },
  crm: { label: 'CRM (Salesforce…)', lane: 'backends', glyph: '☁' },
  wms: { label: 'Warehouse mgmt (WMS)', lane: 'backends', glyph: '▤' },
  tms: { label: 'Transport mgmt (TMS)', lane: 'backends', glyph: '🚚' },
  pos: { label: 'POS / store system', lane: 'backends', glyph: '🏬' },
  database: { label: 'Database', lane: 'backends', glyph: '⛁' },
  'oracle-db': { label: 'Oracle Database', lane: 'backends', glyph: '⛁' },
  'sql-server': { label: 'SQL Server', lane: 'backends', glyph: '⛁' },
  'sftp-server': { label: 'SFTP / FTP server', lane: 'backends', glyph: '⇅' },
  'azure-blob': { label: 'Azure Blob Storage', lane: 'backends', glyph: '◰' },
  's3-bucket': { label: 'Amazon S3 bucket', lane: 'backends', glyph: '◰' },
  legacy: { label: 'Legacy / mainframe', lane: 'backends', glyph: '▣' },
  saas: { label: 'SaaS application', lane: 'backends', glyph: '◫' },
  payment: { label: 'Payment provider', lane: 'backends', glyph: '💳' },
  'external-api': { label: 'Third-party API', lane: 'backends', glyph: '⇄' },
  notification: { label: 'Email / SMS / push', lane: 'backends', glyph: '✉' },
  cache: { label: 'Cache / Object Store', lane: 'backends', glyph: '⚡' },
  'file-store': { label: 'File / object storage', lane: 'backends', glyph: '🗀' },
  'data-warehouse': { label: 'Data warehouse / analytics', lane: 'backends', glyph: '▥' },
  monitoring: { label: 'Monitoring / logging', lane: 'backends', glyph: '📈' },
}

export const isNodeType = (t) => Object.hasOwn(NODE_TYPES, t)
