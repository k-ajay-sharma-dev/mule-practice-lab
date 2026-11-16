// Wrong and other correct diagrams for batch D. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, flip, swap, draw, box, unbox, rename, set }) => {
  // AR-005
  await failsOn('ar-005', 'Run: Due date peak', (d) => set(d, 'prc', { replicas: 4, vCores: '1' }))
  await failsOn('ar-005', 'Run: One availability zone goes down', (d) => set(d, 'prc', { replicas: undefined }))
  // Receipts sent inside the payment request: an email outage fails payments.
  await failsOn('ar-005', 'Run: The email provider is down', (d) => draw(d, 'prc -> mail'))
  // A redelivery limit with no DLQ drops the receipts while email is down.
  await failsOn('ar-005', 'Run: The email provider is down', (d) => set(d, 'q', { maxRedelivery: 3 }))
  await failsOn('ar-005', 'keep their keys in a shared store', (d) => unbox(d, 'keys'))
  await failsOn('ar-005', 'never skips the Experience API', (d) => draw(d, 'mob -> prc'))
  // Receipts sent inside the payment request, with the queue left beside it.
  await failsOn('ar-005', 'No chain of sync calls', (d) => draw(d, 'prc -> mail'))
  await failsOn('ar-005', 'reached only through a System API', (d) => draw(d, 'prc -> prov'))
  await failsOn('ar-005', 'publishes PaymentCompleted', (d) => swap(d, 'prc ~> q'))
  await failsOn('ar-005', 'reads PaymentCompleted', (d) => cut(d, 'q ~> rc'))
  // A DB table with a unique key is as good as a persistent Object Store.
  await passes('ar-005', (d) => {
    d.nodes.find((n) => n.id === 'keys').type = 'database'
  })
  await passes('ar-005', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'topic'
  })
  await passes('ar-005', (d) => {
    box(d, 'gw', 'api-gateway', 'API Manager policies')
    cut(d, 'mob -> exp')
    draw(d, 'mob -> gw', 'gw -> exp')
  })
  // The email System API carries every receipt, so like the other apps it runs 2 replicas to clear a backlog.
  await passes('ar-005', (d) => {
    box(d, 'smsg', 'system-api', 'sys-email-api', { replicas: 2 })
    cut(d, 'rc -> mail')
    draw(d, 'rc -> smsg', 'smsg -> mail')
  })

  // AR-006
  // Orders call SAP in the request, so they fail while SAP fails over.
  await failsOn('ar-006', 'Run: SAP fails over to its DR site', (d) => draw(d, 'ordW -> ssap'))
  // A redelivery limit with no DLQ drops the orders that wait for SAP.
  await failsOn('ar-006', 'Run: SAP fails over to its DR site', (d) => set(d, 'q', { maxRedelivery: 5 }))
  await failsOn('ar-006', 'Run: One availability zone goes down', (d) => set(d, 'ordW', { replicas: undefined }))
  await failsOn('ar-006', 'Run: One availability zone goes down', (d) => set(d, 'erpf', { replicas: undefined }))
  // Active-active everywhere: over the budget.
  await failsOn('ar-006', 'Run: One availability zone goes down', (d) => {
    for (const id of ['ordW', 'ordC', 'erpf', 'ssap']) set(d, id, { regions: '2', vCores: '0.5' })
  })
  await failsOn('ar-006', 'routes to the ingress in each region', (d) => cut(d, 'gtm -> ingC'))
  // Orders call SAP in the request, so they fail while SAP fails over.
  await failsOn('ar-006', 'No chain of sync calls', (d) => draw(d, 'ordW -> ssap'))
  await failsOn('ar-006', 'commits the order', (d) => cut(d, 'ordC -> dbr'))
  await failsOn('ar-006', 'replicates to the other region', (d) => cut(d, 'db -> dbr'))
  await failsOn('ar-006', 'Load balancers forward', (d) => swap(d, 'gtm -> ingW'))
  await failsOn('ar-006', 'reached only through a System API', (d) => draw(d, 'erpf -> sap'))
  // Replication runs the other way after a failback, and async replication is fair when the gap is stated.
  await passes('ar-006', (d) => flip(d, 'db -> dbr'))
  await passes('ar-006', (d) => swap(d, 'db -> dbr'))
  // The orders System API is on the order path, so it needs 2 replicas to survive a zone outage.
  await passes('ar-006', (d) => {
    box(d, 'sord', 'system-api', 'sys-orders', { replicas: 2 })
    cut(d, 'ordW -> db')
    draw(d, 'ordW -> sord', 'sord -> db')
  })
  await passes('ar-006', (d) => draw(d, 'ordC ~> q'))
  await passes('ar-006', (d) => rename(d, 'gtm', 'Route 53 failover with health checks'))

  // AR-007
  await failsOn('ar-007', 'Run: Mobile app and broker portal move to v2', (d) => set(d, 'v2', { vCores: undefined }))
  await failsOn('ar-007', 'Run: Mobile app and broker portal move to v2', (d) => set(d, 'v2', { replicas: 4, vCores: '1' }))
  await failsOn('ar-007', 'Run: Partners stay on v1', (d) => set(d, 'gw', { auth: undefined }))
  // Forking the stack for v2 instead of sharing the lower layers.
  await failsOn('ar-007', 'share one Process API', (d) => {
    box(d, 'prc2', 'process-api', 'prc-policy-v2')
    cut(d, 'v2 -> prc')
    draw(d, 'v2 -> prc2', 'prc2 -> sys')
  })
  await failsOn('ar-007', 'partners can still reach v1', (d) => cut(d, 'gw -> v1'))
  await failsOn('ar-007', 'Clients can reach v2', (d) => cut(d, 'gw -> v2'))
  await failsOn('ar-007', 'never call System APIs directly', (d) => draw(d, 'v1 -> sys'))
  await failsOn('ar-007', 'v2 box', (d) => rename(d, 'v2', 'Policy Experience API new'))
  await failsOn('ar-007', 'the broker portal and the partners each call', (d) => unbox(d, 'brk'))
  // With no gateway box, each instance enforces client ID itself through Autodiscovery.
  await passes('ar-007', (d) => {
    unbox(d, 'gw')
    draw(d, 'mob -> v1', 'mob -> v2', 'brk -> v2', 'ptn -> v1')
    set(d, 'v1', { auth: 'client-id' })
    set(d, 'v2', { auth: 'client-id' })
  })
  await passes('ar-007', (d) => swap(d, 'sys -> pas'))
  await passes('ar-007', (d) => rename(d, 'v1', '/policies/v1 instance (Exchange 1.5.0)'))

  // AR-011
  // No timeout and no breaker: the hanging bureau holds every thread.
  await failsOn('ar-011', 'Run: The credit bureau hangs', (d) => set(d, 'scb', { circuitBreaker: undefined, timeoutMs: undefined }))
  await failsOn('ar-011', 'Run: The credit bureau hangs', (d) => set(d, 'prc', { replicas: 4, vCores: '1' }))
  // The document step inside the request: a consumer outage fails submissions.
  await failsOn('ar-011', 'Run: The document consumer is down', (d) => {
    cut(d, 'prc ~> q')
    draw(d, 'prc -> doc')
  })
  await failsOn('ar-011', 'ships its logs to Splunk', (d) => cut(d, 'doc -> splunk'))
  await failsOn('ar-011', 'ships its logs to Splunk', (d) => flip(d, 'scu -> splunk'))
  // Only Anypoint Monitoring, so the security team gets no logs in Splunk.
  await failsOn('ar-011', 'ships its logs to Splunk', (d) => unbox(d, 'splunk'))
  await failsOn('ar-011', 'publishes LoanSubmitted', (d) => swap(d, 'prc ~> q'))
  await failsOn('ar-011', 'document consumer reads', (d) => cut(d, 'q ~> doc'))
  await failsOn('ar-011', 'reached only through System APIs', (d) => draw(d, 'prc -> sf'))
  await passes('ar-011', (d) => unbox(d, 'am'))
  // An async appender is a fair way to ship logs.
  await passes('ar-011', (d) => swap(d, 'exp -> splunk'))
  await passes('ar-011', (d) => {
    box(d, 'mob', 'mobile-app', 'Mobile app')
    draw(d, 'mob -> exp')
  })
  await passes('ar-011', (d) => rename(d, 'splunk', 'Central log platform (Splunk HEC)'))

  // AR-014
  await failsOn('ar-014', 'Run: Partners without a client ID', (d) => set(d, 'fk', { auth: undefined }))
  await failsOn('ar-014', 'Run: Partners without a client ID', (d) => set(d, 'fd', { auth: undefined }))
  await failsOn('ar-014', 'Run: A partner floods the microservices', (d) => set(d, 'fk', { rateLimit: undefined }))
  // A limit above what the services can take.
  await failsOn('ar-014', 'Run: A partner floods the microservices', (d) => set(d, 'fk', { rateLimit: 250 }))
  // A trusted internal network with no identity check.
  await failsOn('ar-014', 'Run: Internal apps call internal APIs', (d) => set(d, 'mi', { auth: undefined }))
  await failsOn('ar-014', 'Run: Internal apps call internal APIs', (d) => {
    cut(d, 'int -> prv')
    draw(d, 'int -> waf', 'waf -> prv')
  })
  await failsOn('ar-014', 'Partners enter through the WAF', (d) => {
    cut(d, 'ptn -> waf')
    draw(d, 'ptn -> pub')
  })
  await failsOn('ar-014', 'never reaches an API or gateway without passing the WAF', (d) => draw(d, 'ptn -> fk'))
  // The rejected option: a Mule API proxy on CloudHub in front of the on-prem services.
  await failsOn('ar-014', 'microservices are reached only through a Flex Gateway', (d) => {
    box(d, 'mprx', 'experience-api', 'Mule API proxy on CloudHub')
    cut(d, 'fk -> k8s')
    draw(d, 'waf -> mprx', 'mprx -> k8s')
  })
  await failsOn('ar-014', 'SOAP service is reached only through', (d) => draw(d, 'waf -> soap'))
  await failsOn('ar-014', 'Internal traffic skips the WAF hop', (d) => {
    cut(d, 'int -> prv')
    draw(d, 'int -> waf')
  })
  await failsOn('ar-014', 'no Flex Gateway or proxy in front', (d) => draw(d, 'fd -> mp'))
  await passes('ar-014', (d) => {
    unbox(d, 'prv')
    draw(d, 'int -> mi')
  })
  await passes('ar-014', (d) => {
    d.nodes.find((n) => n.id === 'waf').type = 'api-gateway'
  })
  await passes('ar-014', (d) => draw(d, 'mp -> mi'))
  await passes('ar-014', (d) => rename(d, 'soap', 'Legacy .NET service (SOAP)'))

  // AR-019
  // Salesforce and the EHR called one after another.
  await failsOn('ar-019', 'Run: Clinician lookups under 500 ms', (d) => set(d, 'prc', { calls: undefined }))
  await failsOn('ar-019', 'Run: The VPN goes down', (d) => set(d, 'prc', { onFailure: undefined }))
  // The HL7 listener moved to the cloud, so the feeds cross the VPN.
  await failsOn('ar-019', 'Run: The VPN goes down', (d) => {
    cut(d, 'lab -> hl7')
    draw(d, 'lab -> ing', 'ing -> hl7')
  })
  await failsOn('ar-019', 'never reach the EHR database except', (d) => draw(d, 'prc -> ehr'))
  await failsOn('ar-019', 'EHR System API runs on Runtime Fabric', (d) => rename(d, 'sehr', 'sys-ehr (Private Space)'))
  await failsOn('ar-019', 'reaches the EHR through the on-prem System API', (d) => cut(d, 'ing -> sehr'))
  await failsOn('ar-019', 'imaging flow runs on Runtime Fabric', (d) => rename(d, 'img', 'Nightly imaging flow (Private Space)'))
  await failsOn('ar-019', 'never calls System APIs directly', (d) => draw(d, 'exp -> sehr'))
  await failsOn('ar-019', 'send HL7 to a listener', (d) => rename(d, 'hl7', 'HL7 MLLP listener (Private Space)'))
  await passes('ar-019', (d) => {
    unbox(d, 'ing')
    draw(d, 'prc -> sehr')
  })
  // Clinicians on-prem get an on-prem Experience API.
  await passes('ar-019', (d) => {
    box(d, 'cli', 'internal-app', 'Clinician workstation')
    box(d, 'eon', 'experience-api', 'exp-clinician (Runtime Fabric on-prem)')
    box(d, 'hprc', 'process-api', 'prc-clinician-lookup (Runtime Fabric on-prem)')
    draw(d, 'cli -> eon', 'eon -> hprc', 'hprc -> sehr')
  })
  await passes('ar-019', (d) => {
    d.nodes.find((n) => n.id === 'ehr').type = 'legacy'
  })
  await passes('ar-019', (d) => rename(d, 'sehr', 'sys-ehr (hybrid Mule runtime in the data center)'))

  // AR-024
  await failsOn('ar-024', 'Run: An orchestrator replica crashes', (d) => set(d, 'orc', { replicas: undefined }))
  // No redelivery limit: the failing cancel never reaches a person.
  await failsOn('ar-024', 'Run: A compensation keeps failing', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // A redelivery limit with no DLQ (from the queue or the orchestrator) drops the cancel.
  await failsOn('ar-024', 'Run: A compensation keeps failing', (d) => cut(d, 'q ~> dlq', 'orc ~> dlq'))
  // Choreography: billing driven by another app reacting to the queue.
  await failsOn('ar-024', 'One orchestrator calls all six', (d) => {
    box(d, 'p2', 'process-api', 'prc-billing-step')
    cut(d, 'orc -> sbil')
    draw(d, 'q ~> p2', 'p2 -> sbil')
  })
  await failsOn('ar-024', 'durable database', (d) => unbox(d, 'state'))
  await failsOn('ar-024', 'consumed again', (d) => cut(d, 'q ~> orc'))
  await failsOn('ar-024', 'go to a DLQ', (d) => unbox(d, 'dlq'))
  await failsOn('ar-024', 'reached only through System APIs', (d) => draw(d, 'orc -> pay'))
  await failsOn('ar-024', 'sends each next step', (d) => swap(d, 'orc ~> q'))
  await passes('ar-024', (d) => {
    cut(d, 'exp -> orc')
    draw(d, 'exp ~> q')
  })
  await passes('ar-024', (d) => {
    cut(d, 'orc ~> dlq')
    draw(d, 'q ~> dlq')
  })
  await passes('ar-024', (d) => swap(d, 'sprov -> net'))
  await passes('ar-024', (d) => {
    d.nodes.find((n) => n.id === 'state').type = 'sql-server'
  })
  // The provisioning callback is put on the saga queue.
  await passes('ar-024', (d) => draw(d, 'net -> sprov', 'sprov ~> q'))

  // AR-026
  // One limit for the whole gateway throttles small tenants during a big tenant's peak.
  await failsOn('ar-026', 'Run: Black Friday at the big marketplaces', (d) => set(d, 'gw', { rateLimit: 500 }))
  await failsOn('ar-026', 'Run: Black Friday at the big marketplaces', (d) => set(d, 'cell', { rateLimit: undefined }))
  await failsOn('ar-026', 'Run: Black Friday at the big marketplaces', (d) => set(d, 'pool', { vCores: undefined }))
  await failsOn('ar-026', 'Run: Black Friday at the big marketplaces', (d) => set(d, 'cell', { replicas: 4, vCores: '2' }))
  // Token introspection at the IdP for every call.
  await failsOn('ar-026', 'Run: The identity provider is down', (d) => set(d, 'gw', { auth: 'oauth2' }))
  await failsOn('ar-026', 'Run: The identity provider is down', (d) => set(d, 'gw', { auth: undefined }))
  await failsOn('ar-026', 'without passing the gateway', (d) => draw(d, 'ten -> pool'))
  await failsOn('ar-026', 'never touches the Enterprise DB', (d) => draw(d, 'pool -> cdb'))
  // One shared webhook queue: the Black Friday backlog delays everyone.
  await failsOn('ar-026', 'At least two webhook queues', (d) => {
    unbox(d, 'qb')
    draw(d, 'cell ~> qs')
  })
  await failsOn('ar-026', 'its own dedicated DB', (d) => {
    cut(d, 'cell -> cdb')
    draw(d, 'cell -> sdb')
  })
  await failsOn('ar-026', 'No chain of sync calls', (d) => draw(d, 'pool -> wh'))
  await failsOn('ar-026', 'validates tokens', (d) => unbox(d, 'idp'))
  await failsOn('ar-026', 'tenant config from the registry', (d) => cut(d, 'cell -> reg'))
  // The gateway may fetch keys, or the IdP may be drawn as the token issuer.
  await passes('ar-026', (d) => flip(d, 'gw -> idp'))
  await passes('ar-026', (d) => {
    box(d, 'sreg', 'system-api', 'sys-tenant-registry')
    cut(d, 'pool -> reg', 'cell -> reg')
    draw(d, 'pool -> sreg', 'cell -> sreg', 'sreg -> reg')
  })
  // The biggest marketplace moved to the Enterprise cell.
  await passes('ar-026', (d) => cut(d, 'pool ~> qb'))
  await passes('ar-026', (d) => {
    d.nodes.find((n) => n.id === 'reg').type = 'cache'
  })

  // AR-028
  // No rate limit on the partner facade, sized up instead: the burst reaches the policy system.
  await failsOn('ar-028', 'Run: Partner aggregators send a burst', (d) => set(d, 'eagg', { rateLimit: undefined, vCores: '1' }))
  await failsOn('ar-028', 'Run: Partner aggregators send a burst', (d) => set(d, 'eagg', { rateLimit: undefined }))
  await failsOn('ar-028', 'Run: Partner aggregators send a burst', (d) => set(d, 'prc', { vCores: undefined }))
  await failsOn('ar-028', 'Run: Analytics is down', (d) => draw(d, 'prc -> dw'))
  // A separate SOAP stack with its own logic.
  await failsOn('ar-028', 'share one Process API', (d) => {
    box(d, 'p2', 'process-api', 'prc-quotes-soap')
    cut(d, 'esoap -> prc')
    draw(d, 'esoap -> p2', 'p2 -> spol')
  })
  await failsOn('ar-028', 'never call System APIs directly', (d) => draw(d, 'emob -> sclm'))
  await failsOn('ar-028', 'No chain of sync calls', (d) => draw(d, 'prc -> dw'))
  await failsOn('ar-028', 'reaches the analytics platform', (d) => cut(d, 'ev ~> dw'))
  await failsOn('ar-028', 'each call an Experience API facade', (d) => {
    cut(d, 'brk -> esoap')
    draw(d, 'brk -> prc')
  })
  await failsOn('ar-028', 'publishes PolicyChanged', (d) => swap(d, 'prc ~> ev'))
  await passes('ar-028', (d) => {
    d.nodes.find((n) => n.id === 'ev').type = 'queue'
  })
  await passes('ar-028', (d) => {
    box(d, 'ing', 'process-api', 'prc-analytics-ingest')
    cut(d, 'ev ~> dw')
    draw(d, 'ev ~> ing', 'ing -> dw')
  })
  await passes('ar-028', (d) => {
    d.nodes.find((n) => n.id === 'brk').type = 'partner'
  })

  // AR-031
  await failsOn('ar-031', 'Run: Customer lookups at peak', (d) => set(d, 'prc', { calls: undefined }))
  // The partial answer hides an overloaded System API.
  await failsOn('ar-031', 'Run: Customer lookups at peak', (d) => set(d, 'ssap', { vCores: undefined }))
  await failsOn('ar-031', 'Run: Customer lookups at peak', (d) => set(d, 'prc', { replicas: 4, vCores: '1' }))
  await failsOn('ar-031', 'Run: The support tool is down', (d) => set(d, 'prc', { onFailure: undefined }))
  // Pass-through: the partner channel gets Salesforce data as it is.
  await failsOn('ar-031', 'Every Experience API calls the Customer Process API', (d) => {
    cut(d, 'eptl -> prc')
    draw(d, 'eptl -> ssf')
  })
  // A canonical model forced at the System layer: one System API for two systems.
  await failsOn('ar-031', 'fronts exactly one system', (d) => {
    unbox(d, 'ssf')
    draw(d, 'ssap -> sf')
  })
  await failsOn('ar-031', 'owns the cross-reference', (d) => cut(d, 'prc -> xref'))
  await failsOn('ar-031', 'reached only through System APIs', (d) => draw(d, 'prc -> sap'))
  await failsOn('ar-031', 'reads all four System APIs', (d) => cut(d, 'prc -> ssup'))
  await passes('ar-031', (d) => unbox(d, 'ev'))
  await passes('ar-031', (d) => {
    unbox(d, 'xref')
    // The MDM System API is called on every lookup, so it gets 0.2 vCore like the other System APIs.
    box(d, 'smdm', 'system-api', 'sys-mdm (cross-reference)', { vCores: '0.2' })
    box(d, 'mdm', 'saas', 'MDM')
    draw(d, 'prc -> smdm', 'smdm -> mdm')
  })
  await passes('ar-031', (d) => {
    box(d, 'web', 'web-app', 'Web shop')
    box(d, 'eweb', 'experience-api', 'exp-customer-web')
    draw(d, 'web -> eweb', 'eweb -> prc')
  })
}
