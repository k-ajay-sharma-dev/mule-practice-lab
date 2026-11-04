// The policies the Platform Lab can apply. Behaviour follows the Mule Gateway policy pages for HTTP APIs;
// anything those pages do not state is marked `basis: 'assumed'` where the engine reports it.
const DOCS = 'https://docs.mulesoft.com/mule-gateway/'

export const IP_EXPRESSIONS = ['#[attributes.remoteAddress]', "#[attributes.headers['x-forwarded-for']]"]

const number = (key, label, value, hint) => ({ key, label, type: 'number', value, hint })
const text = (key, label, value, hint) => ({ key, label, type: 'text', value, hint })
const select = (key, label, options, value) => ({ key, label, type: 'select', options, value: value ?? options[0] })

export const POLICIES = [
  {
    type: 'client-id',
    name: 'Client ID Enforcement',
    category: 'Compliance',
    summary: 'Allows access only to client applications with valid credentials and a contract.',
    docs: 'policies-included-client-id-enforcement',
    fields: [
      select('origin', 'Credentials origin', ['Custom Expression', 'HTTP Basic Authentication Header']),
      select('secret', 'Client secret', ['Required', 'Not checked']),
    ],
  },
  {
    type: 'rate-limit',
    name: 'Rate Limiting',
    category: 'Quality of Service',
    summary: 'Counts requests in a fixed window, per identifier. Over quota returns 429 until the window finishes.',
    docs: 'policies-included-rate-limiting',
    fields: [
      number('requests', 'Number of Reqs', 3),
      number('periodMs', 'Time Period (ms)', 10000),
      select('identifier', 'Identifier', ['(not configured)', '#[attributes.method]', "#[attributes.headers['client_id']]"]),
      select('expose', 'Expose Headers', ['No', 'Yes']),
    ],
  },
  {
    type: 'rate-limit-sla',
    name: 'Rate Limiting SLA',
    category: 'Quality of Service',
    summary: 'Limits each client application by the SLA tier on its contract. It also checks the client credentials.',
    docs: 'policies-included-rate-limiting-sla',
    fields: [select('secret', 'Client secret', ['Required', 'Not checked']), select('expose', 'Expose Headers', ['No', 'Yes'])],
  },
  {
    type: 'spike',
    name: 'Spike Control',
    category: 'Quality of Service',
    summary: 'Sliding window that queues a request and retries it before rejecting with 429.',
    docs: 'policies-included-spike-control',
    fields: [
      number('requests', 'Number of Reqs', 2),
      number('periodMs', 'Time Period (ms)', 1000),
      number('delayMs', 'Delay Time in Milliseconds', 499),
      number('attempts', 'Delay Attempts', 1),
      number('queueLimit', 'Queuing Limit', 5),
    ],
  },
  {
    type: 'ip-allow',
    name: 'IP Allowlist',
    category: 'Security',
    summary: 'Only listed addresses or ranges get through. Anything else returns 403.',
    docs: 'policies-included-ip-allowlist',
    fields: [
      select('expression', 'IP expression', IP_EXPRESSIONS),
      text('list', 'Allowlist', '10.0.0.0/8', 'Comma separated addresses or CIDR ranges'),
    ],
  },
  {
    type: 'ip-block',
    name: 'IP Blocklist',
    category: 'Security',
    summary: 'Listed addresses or ranges return 403. Anything else gets through.',
    docs: 'policies-included-ip-blocklist',
    fields: [
      select('expression', 'IP expression', IP_EXPRESSIONS),
      text('list', 'Blocklist', '203.0.113.0/24', 'Comma separated addresses or CIDR ranges'),
    ],
  },
  {
    type: 'basic-auth',
    name: 'Basic Authentication: Simple',
    category: 'Security',
    summary: 'One username and password, checked against the Authorization header.',
    docs: 'policies-included-basic-auth-simple',
    fields: [text('username', 'User Name', 'lab-user'), text('password', 'User Password', 'lab-password')],
  },
  {
    type: 'jwt',
    name: 'JWT Validation',
    category: 'Security',
    summary: 'No token returns 400. A bad signature, a failed claim or an unreadable token returns 401.',
    docs: 'policies-included-jwt-validation',
    fields: [],
  },
  {
    type: 'json-threat',
    name: 'JSON Threat Protection',
    category: 'Security',
    summary: 'Rejects JSON bodies over the configured limits with 400. A limit of -1 means no check.',
    docs: 'policies-included-json-threat-protection',
    fields: [
      number('depth', 'Maximum Container Depth', -1),
      number('stringLength', 'Maximum String Value Length', -1),
      number('nameLength', 'Maximum Object Entry Name Length', -1),
      number('entries', 'Maximum Object Entry Count', -1),
      number('elements', 'Maximum Array Element Count', -1),
    ],
  },
  {
    type: 'header-inject',
    name: 'Header Injection',
    category: 'Transformation',
    summary: 'Adds headers to the request or response. An existing header is kept, not overridden.',
    docs: 'policies-included-header-injection',
    fields: [
      text('inbound', 'Inbound headers', 'x-tenant: internal', 'name: value, comma separated'),
      text('outbound', 'Outbound headers', '', 'name: value, comma separated'),
    ],
  },
  {
    type: 'header-remove',
    name: 'Header Removal',
    category: 'Transformation',
    summary: 'Removes request headers at the start of processing and response headers at the end.',
    docs: 'policies-included-header-removal',
    fields: [
      text('inbound', 'Inbound Header Map', 'x-tenant', 'Names or regular expressions, comma separated'),
      text('outbound', 'Outbound Header Map', '', 'Names or regular expressions, comma separated'),
    ],
  },
]

export const policyByType = new Map(POLICIES.map((p) => [p.type, p]))
export const docsUrl = (policy) => `${DOCS}${policy.docs}`

export function defaultSettings(type) {
  return Object.fromEntries(policyByType.get(type).fields.map((f) => [f.key, f.value]))
}

export const TOKENS = [
  ['none', 'No token'],
  ['valid', 'Valid token'],
  ['expired', 'Expired token'],
  ['bad-signature', 'Wrong signature'],
  ['missing-claim', 'Required claim missing'],
  ['malformed', 'Unreadable token'],
]
