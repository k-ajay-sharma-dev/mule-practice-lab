import { problems } from './problems.js'

// Topic tracks cut across tabs: each is one ordered path through every problem tagged with its topic.
// Order: level first, then concept → code → design → scenario → incident → enterprise case.
export const TRACKS = [
  {
    slug: 'api-led',
    title: 'API-led Connectivity',
    blurb: 'Experience, Process and System APIs: responsibilities, reuse, security, errors and real application networks.',
    tags: ['api-led', 'application-network', 'system-api', 'process-api', 'experience-api', 'layers'],
  },
  {
    slug: 'activemq-oracle',
    title: 'ActiveMQ + Oracle',
    blurb: 'JMS with ActiveMQ Classic and Artemis, Oracle with the Database connector, transactions and their production failures.',
    tags: ['activemq', 'jms', 'oracle', 'xa', 'stored-procedure'],
  },
  {
    slug: 'kafka',
    title: 'Apache Kafka',
    blurb: 'Topics, partitions and keys, consumer groups, commits and seeking, batch listeners and production failures.',
    tags: ['kafka', 'consumer-groups', 'partitions', 'offsets'],
  },
  {
    slug: 'email',
    title: 'Email Connector',
    blurb: 'IMAP and POP3 listeners, SMTP sending, attachments, mailbox housekeeping and notification failures.',
    tags: ['email', 'imap', 'pop3', 'smtp', 'attachments', 'notifications'],
  },
  {
    slug: 'files-storage',
    title: 'Files & Cloud Storage',
    blurb: 'File, FTP and SFTP connectors, partner file drops, Amazon S3 and Azure Blob Storage in production.',
    tags: ['ftp', 'sftp', 'file', 'file-transfer', 'azure-blob', 's3', 'csv'],
  },
  {
    slug: 'databases',
    title: 'Databases (Oracle, SQL Server…)',
    blurb: 'Database connector configurations, queries, bulk operations, stored procedures, transactions and their failures.',
    tags: ['oracle', 'sql-server', 'mysql', 'postgresql', 'database', 'stored-procedure', 'bulk-insert'],
  },
  {
    slug: 'xml-json',
    title: 'XML, JSON, CSV & Data Formats',
    blurb: 'XML namespaces and attributes, CSV, fixed width, NDJSON and YAML, schema validation, XPath, XSLT and DataWeave mappings.',
    tags: ['xml', 'json', 'csv', 'namespaces', 'xsd', 'json-schema', 'xslt', 'xpath', 'soap', 'flat-file', 'fixed-width', 'ndjson', 'yaml', 'data-formats'],
  },
  {
    slug: 'enterprise-systems',
    title: 'Salesforce, SAP & Workday',
    blurb: 'The enterprise connectors interviewers ask about: objects and bulk loads, IDocs and BAPIs, Workday services and worker data.',
    tags: ['salesforce', 'sap', 'workday', 'idoc', 'bapi'],
  },
  {
    slug: 'testing',
    title: 'Testing with MUnit',
    blurb: 'Mocks, spies, assertions, error scenarios, coverage gates and what a green test suite does not prove.',
    tags: ['munit', 'testing'],
  },
  {
    slug: 'supply-chain',
    title: 'Supply Chain',
    blurb: 'Purchase orders, EDI, ASNs, warehouses, transport, inventory, recalls and 3PLs.',
    tags: ['supply-chain', 'edi', 'x12', 'wms', 'tms', 'asn', 'recall', 'traceability', 'goods-receipt'],
  },
  {
    slug: 'retail',
    title: 'Retail',
    blurb: 'POS, stores, pricing and promotions, omnichannel orders, loyalty and e-commerce.',
    tags: ['retail', 'pos', 'omnichannel', 'pricing', 'loyalty', 'e-commerce', 'store-inventory'],
  },
  {
    slug: 'error-handling',
    title: 'Error Handling & Resilience',
    blurb: 'Error types, propagation, retries, timeouts, circuit breakers, DLQs and idempotency.',
    tags: ['error-handling', 'resilience', 'retries', 'timeouts', 'circuit-breaker', 'until-successful', 'dlq', 'idempotency', 'fallback', 'reconnection'],
  },
  {
    slug: 'messaging',
    title: 'Messaging & Events',
    blurb: 'Anypoint MQ, JMS, Kafka, pub/sub, async patterns, sagas and the outbox.',
    tags: ['anypoint-mq', 'event-driven', 'events', 'pub-sub', 'async', 'kafka', 'messaging', 'saga', 'outbox', 'cdc'],
  },
  {
    slug: 'security',
    title: 'Security & API Management',
    blurb: 'Policies, OAuth, client contracts, SLA tiers, PII and governance.',
    tags: ['security', 'oauth2', 'oauth', 'policies', 'api-manager', 'api-management', 'sla-tiers', 'pii', 'gdpr', 'governance', 'rate-limiting'],
  },
  {
    slug: 'anypoint-platform',
    title: 'Anypoint Platform',
    blurb: 'Exchange, API Designer, API Governance, API Groups, Anypoint Monitoring, API Visualizer, Runtime Manager and the CLI.',
    tags: ['exchange', 'design-center', 'api-designer', 'mocking-service', 'api-governance', 'anypoint-monitoring', 'api-visualizer', 'runtime-manager', 'anypoint-cli', 'platform-apis', 'api-groups', 'api-proxy', 'contracts'],
  },
  {
    slug: 'deployment',
    title: 'Deployment & Operations',
    blurb: 'CloudHub, Runtime Fabric, CI/CD, environments, monitoring, logging and performance.',
    tags: ['deployment', 'cloudhub', 'cloudhub-2', 'runtime-fabric', 'ci-cd', 'environments', 'maven', 'observability', 'logging', 'performance', 'memory', 'capacity-planning'],
  },
  {
    slug: 'ai-agents',
    title: 'AI Agents & Agent Fabric',
    blurb: 'Agent Fabric, Omni Gateway, MCP, A2A, Model Proxy and governing agents and LLM traffic in production.',
    tags: ['ai-agents', 'agent-fabric', 'mcp', 'a2a', 'llm'],
  },
  {
    slug: 'dataweave-core',
    title: 'DataWeave Essentials',
    blurb: 'Selectors, map/filter/reduce, groupBy, formats, dates, recursion — the functions interviewers ask about.',
    categories: ['dataweave'],
  },
]

const CATEGORY_ORDER = ['mulesoft', 'dataweave', 'flows', 'architecture', 'use-cases', 'incidents', 'case-studies']
const LEVEL_ORDER = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']

export const trackBySlug = new Map(TRACKS.map((t) => [t.slug, t]))

export function trackProblems(track) {
  return problems
    .filter((p) => (track.categories ? track.categories.includes(p.category) : p.tags.some((t) => track.tags.includes(t))))
    .sort(
      (a, b) =>
        LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.id.localeCompare(b.id, undefined, { numeric: true }),
    )
}
