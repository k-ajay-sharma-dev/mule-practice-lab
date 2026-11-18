export default {
  id: 'ms-236',
  category: 'mulesoft',
  title: 'Dynamic Connector Configurations: One Config per Tenant, Expressions and the Expiration Policy',
  level: 'ADVANCED',
  tags: ['myproject', 'dynamic-config', 'connector-config', 'expiration-policy', 'multi-tenant', 'sftp', 'connection-pool', 'security', 'saas'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'What makes a connector configuration dynamic?',
      options: [
        'It is defined in a separate XML file',
        'One of its parameters uses an expression that is evaluated for each event',
        'It has a reconnection strategy',
        'It is shared through a domain',
      ],
      answer: 1,
      explain: 'A config with an expression, such as a host taken from a variable, is resolved per event. A config with fixed values is created once at startup.',
    },
    {
      type: 'single',
      prompt: 'An SFTP config takes host and user from variables. Calls arrive for 40 tenants, each with its own host. How many config instances can exist?',
      options: ['One, shared by all tenants', 'Up to 40, one for each distinct set of values', 'One per flow', 'One per CPU core'],
      answer: 1,
      explain: 'Mule creates one instance for each distinct set of resolved values and reuses it for later events with the same values.',
    },
    {
      type: 'single',
      prompt: 'What does the expiration policy of a dynamic config do?',
      options: [
        'Expires the passwords of each tenant',
        'Disposes of an instance, with its connections, once it has been idle for the set time',
        'Limits how many tenants can call the app',
        'Sets the response timeout',
      ],
      answer: 1,
      explain: 'maxIdleTime and timeUnit decide how long an unused instance is kept before it is released.',
    },
    {
      type: 'multi',
      prompt: 'Which are real risks of dynamic configurations?',
      options: [
        'Connection counts grow with the number of tenants times the connections each instance holds',
        'Values taken from the request could point the app at a host the caller chose',
        'The first call for a tenant is slower, because a new instance and connection are created',
        'Operations with a dynamic config cannot use connections at all',
      ],
      answer: [0, 1, 2],
      explain: 'Each instance has its own connections. The values must come from a trusted source, not from the request body.',
    },
    {
      type: 'single',
      prompt: 'Where should each tenant\'s SFTP host and credentials come from?',
      options: [
        'From fields in the request body',
        'From a trusted store looked up by a tenant id taken from the caller\'s verified token',
        'From query parameters',
        'From the Mule app name',
      ],
      answer: 1,
      explain: 'The caller proves who it is with its token. The app then looks up that tenant\'s settings. Taking a host from the request lets a caller point the app anywhere.',
    },
    {
      type: 'order',
      prompt: 'Order what happens for one tenant\'s call.',
      items: [
        'Read the tenant id from the verified token',
        'Look up the tenant\'s connection settings in a trusted store',
        'Put the settings in variables used by the config expressions',
        'Run the operation, which creates or reuses the instance for those values',
        'The instance is released after it has been idle longer than the expiration policy',
      ],
      explain: 'Identity first, then trusted settings, then the connector call.',
    },
  ],
  description: `
Quillon Payroll is a payroll SaaS. Every evening it collects a timesheet file from each customer's own SFTP server. There are 40 customers today and 300 planned. The first version had one SFTP config and one flow per customer, and every new customer meant a new release.

A developer proposes one flow with one **dynamic** SFTP config, where host, port, user and password come from expressions.

**Questions**
1. What makes a config dynamic, and how does Mule create and reuse its instances?
2. What does the expiration policy do?
3. What can go wrong with connections and memory at 300 tenants?
4. Where should the per-tenant values come from, and why does that matter for security?
`,
  answerTemplate: `## Dynamic configs

## Expiration policy

## Scale

## Where the values come from
`,
  keyPoints: [
    'An expression in a config parameter makes the config dynamic.',
    'Mule keeps one instance per distinct set of resolved values.',
    'The expiration policy releases instances that have been idle too long.',
    'Connections add up per instance, so size for the number of tenants.',
    'Per-tenant values come from a trusted store, never from the request.',
    'The first call for a tenant pays for creating the instance.',
  ],
  solution: `
**1. Dynamic configs.** A config with fixed values is created once at startup. When a parameter holds an expression, such as \`host="#[vars.tenant.host]"\`, Mule evaluates it per event. The first event with a new set of values creates a new instance of the config with its own connection. Later events with the same values reuse it. One flow can then serve every customer.

**2. Expiration policy.** Dynamic configs take an expiration policy with \`maxIdleTime\` and \`timeUnit\`. An instance that has not been used for that long is released, with its connections. Set it to fit the pattern: for a nightly collection, an instance can be released soon after its run. Check the default in your connector version and set it on purpose.

**3. Scale.** Each instance keeps its own connections. 300 tenants collected in the same hour can mean 300 open SFTP sessions, plus memory for each. Limit how many tenants run at once, for example with a For Each over batches or a max concurrency on the flow, and make sure the customers' servers allow the connections.

**4. Where values come from.** Store each tenant's host and credentials in a secure store, encrypted, and look them up by a tenant id the app trusts: from the scheduler's own tenant list, or from a verified token for API calls. Never take a host from the request body. A caller who controls the host can make the app connect to any server it can reach.
`,
  followUps: [
    {
      q: 'Can every parameter of a config be an expression?',
      a: 'Not always. Check the connector documentation for which parameters accept expressions, and test the config with two tenants before you rely on it.',
    },
    {
      q: 'How would you add a new customer now?',
      a: 'Add a row to the tenant store with its host and an encrypted secret. No new release is needed, which is the main reason for the design.',
    },
    {
      q: 'When is a static config per tenant still the better choice?',
      a: 'With a handful of tenants that rarely change, or when one tenant needs very different settings, such as its own TLS context. Named static configs also read more clearly in logs and monitoring.',
    },
  ],
}
