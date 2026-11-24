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
  'mobile-app': { label: 'Mobile app', lane: 'consumers' },
  'web-app': { label: 'Web app', lane: 'consumers' },
  partner: { label: 'Partner / B2B client', lane: 'consumers' },
  'internal-app': { label: 'Internal / staff app', lane: 'consumers' },
  chatbot: { label: 'Chatbot / voice', lane: 'consumers' },
  device: { label: 'IoT device / kiosk', lane: 'consumers' },
  // edge
  'api-gateway': { label: 'API gateway / policies', lane: 'edge' },
  'identity-provider': { label: 'Identity provider', lane: 'edge' },
  'load-balancer': { label: 'Load balancer / ingress', lane: 'edge' },
  // API-led layers
  'experience-api': { label: 'Experience API', lane: 'experience', api: true },
  'process-api': { label: 'Process API', lane: 'process', api: true },
  'batch-job': { label: 'Batch / scheduled job', lane: 'process' },
  'system-api': { label: 'System API', lane: 'system', api: true },
  // messaging
  queue: { label: 'Queue', lane: 'messaging' },
  topic: { label: 'Topic / exchange', lane: 'messaging' },
  'event-stream': { label: 'Event stream (Kafka)', lane: 'messaging' },
  dlq: { label: 'Dead-letter queue', lane: 'messaging' },
  'cloud-queue': { label: 'Cloud queue (SQS / Azure Service Bus)', lane: 'messaging' },
  // backends and data
  erp: { label: 'ERP (SAP, Oracle…)', lane: 'backends' },
  crm: { label: 'CRM (Salesforce…)', lane: 'backends' },
  wms: { label: 'Warehouse mgmt (WMS)', lane: 'backends' },
  tms: { label: 'Transport mgmt (TMS)', lane: 'backends' },
  pos: { label: 'POS / store system', lane: 'backends' },
  database: { label: 'Database', lane: 'backends' },
  'oracle-db': { label: 'Oracle Database', lane: 'backends' },
  'sql-server': { label: 'SQL Server', lane: 'backends' },
  'sftp-server': { label: 'SFTP / FTP server', lane: 'backends' },
  'azure-blob': { label: 'Azure Blob Storage', lane: 'backends' },
  's3-bucket': { label: 'Amazon S3 bucket', lane: 'backends' },
  legacy: { label: 'Legacy / mainframe', lane: 'backends' },
  saas: { label: 'SaaS application', lane: 'backends' },
  payment: { label: 'Payment provider', lane: 'backends' },
  'external-api': { label: 'Third-party API', lane: 'backends' },
  notification: { label: 'Email / SMS / push', lane: 'backends' },
  cache: { label: 'Cache / Object Store', lane: 'backends' },
  'file-store': { label: 'File / object storage', lane: 'backends' },
  'data-warehouse': { label: 'Data warehouse / analytics', lane: 'backends' },
  monitoring: { label: 'Monitoring / logging', lane: 'backends' },
}

export const isNodeType = (t) => Object.hasOwn(NODE_TYPES, t)
