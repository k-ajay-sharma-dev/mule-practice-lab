// Wrong and other correct diagrams for batch I (case studies cs-093 to cs-106). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, line, cut, flip, swap, draw, box, unbox, rename }) => {
  // CS-093
  // The scheduler flow calls the SIS System API itself, so the sync logic lives in the trigger.
  await failsOn('cs-093', 'job does not call', (d) => draw(d, 'job -> ssis'))
  // The Process API runs SQL against the SIS database.
  await failsOn('cs-093', 'SIS database is reached only', (d) => draw(d, 'prc -> sis'))
  // The Process API posts to the LMS with its own API key.
  await failsOn('cs-093', 'LMS is reached only', (d) => {
    cut(d, 'prc -> slms')
    draw(d, 'prc -> lms')
  })
  // No watermark: every run sends everything.
  await failsOn('cs-093', 'watermark', (d) => unbox(d, 'os'))
  // Errors are only logged, nobody hears about them.
  await failsOn('cs-093', 'reported to the IT help desk', (d) => unbox(d, 'help'))
  // A fire-and-forget call to the SIS System API.
  await failsOn('cs-093', 'synchronous', (d) => swap(d, 'prc -> ssis'))
  // A two-way sync where LMS changes are pushed back into the SIS.
  await failsOn('cs-093', 'Data flows one way', (d) => draw(d, 'lms ~> prc'))
  await failsOn('cs-093', 'scheduled job starts', (d) => cut(d, 'job -> prc'))
  await failsOn('cs-093', 'another for the LMS', (d) => unbox(d, 'slms'))
  // The SIS drawn as a plain database.
  await passes('cs-093', (d) => {
    d.nodes.find((n) => n.id === 'sis').type = 'database'
  })
  // A separate nightly reconciliation job that uses the same Process API.
  await passes('cs-093', (d) => {
    box(d, 'recon', 'batch-job', 'nightly full reconciliation')
    draw(d, 'recon -> prc')
  })
  // Failed records parked on a dead-letter queue as well as reported.
  await passes('cs-093', (d) => {
    box(d, 'dlq', 'dlq', 'roster-rejects')
    draw(d, 'prc ~> dlq')
  })

  // CS-094
  // Today's design rebuilt in Mule: the intake job and the portal call the submission flow directly.
  await failsOn('cs-094', 'No synchronous route', (d) => {
    unbox(d, 'q')
    draw(d, 'intake -> prc', 'exp -> prc')
  })
  // The portal gets its own queue and its own consumer, so pacing and duplicate checks exist twice.
  await failsOn('cs-094', 'share one claims queue', (d) => {
    box(d, 'q2', 'queue', 'portal-claims')
    cut(d, 'exp ~> q')
    draw(d, 'exp ~> q2', 'q2 ~> prc')
  })
  // The Process API calls CICS itself.
  await failsOn('cs-094', 'only through a System API', (d) => draw(d, 'prc -> eng'))
  // No duplicate check: the same claim from portal and file is paid twice.
  await failsOn('cs-094', 'Duplicate claims', (d) => unbox(d, 'keys'))
  // Poison claims are retried for ever.
  await failsOn('cs-094', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // The submission flow writes the 277CA itself, so no one else can use the status.
  await failsOn('cs-094', 'published as an event', (d) => {
    unbox(d, 'st')
    draw(d, 'prc -> ack')
  })
  // The intake job hands claims over with a blocking call into the queue.
  await failsOn('cs-094', 'async message', (d) => swap(d, 'intake ~> q'))
  await failsOn('cs-094', '277CA files', (d) => cut(d, 'ack -> outb'))
  await failsOn('cs-094', 'drop 837 files', (d) => flip(d, 'ch -> inb'))
  // The dead-letter queue fed by the Process API instead of the broker.
  await passes('cs-094', (d) => {
    cut(d, 'q ~> dlq')
    draw(d, 'prc ~> dlq')
  })
  // A gateway in front of the portal API, and an eligibility lookup before submission.
  await passes('cs-094', (d) => {
    box(d, 'gw', 'api-gateway', 'client ID and rate limit policies')
    box(d, 'sel', 'system-api', 'sys-eligibility-api')
    box(d, 'el', 'database', 'Member eligibility')
    cut(d, 'portal -> exp')
    draw(d, 'portal -> gw', 'gw -> exp', 'prc -> sel', 'sel -> el')
  })
  // Duplicate keys in a database table instead of Object Store.
  await passes('cs-094', (d) => {
    d.nodes.find((n) => n.id === 'keys').type = 'database'
  })

  // CS-095
  // The listener calls the pharmacy System API before it ACKs, so a slow pharmacy holds up the EHR.
  await failsOn('cs-095', 'cannot hold up the EHR feed', (d) => draw(d, 'lis -> sph'))
  // The EHR keeps a second interface straight to bed management.
  await failsOn('cs-095', 'one outbound feed', (d) => draw(d, 'ehr -> sbed'))
  // One shared queue that every department reads from.
  await failsOn('cs-095', 'its own queue', (d) => {
    unbox(d, 'qph')
    unbox(d, 'qdi')
    draw(d, 'qbed ~> pph', 'qbed ~> pdi', 'qbed ~> dlq')
  })
  // The pharmacy Process API opens its own MLLP connection to the pharmacy system.
  await failsOn('cs-095', 'only through System APIs', (d) => {
    cut(d, 'pph -> sph')
    draw(d, 'pph -> phs')
  })
  // No archive, so nothing can be replayed.
  await failsOn('cs-095', 'archived for replay', (d) => unbox(d, 'arch'))
  // The listener hands each event to the topic with a blocking call.
  await failsOn('cs-095', 'publishes each event once', (d) => swap(d, 'lis ~> top'))
  await failsOn('cs-095', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  await failsOn('cs-095', 'three departmental systems', (d) => unbox(d, 'sbed'))
  await failsOn('cs-095', 'async messages', (d) => swap(d, 'qdi ~> pdi'))
  // A separate archive subscriber on the topic instead of the listener writing it.
  await passes('cs-095', (d) => {
    cut(d, 'lis -> arch')
    draw(d, 'top ~> arch')
  })
  // A fourth department (patient billing) joins with its own queue.
  await passes('cs-095', (d) => {
    box(d, 'qbi', 'queue', 'billing.adt')
    box(d, 'pbi', 'process-api', 'prc-billing-adt')
    box(d, 'sbi', 'system-api', 'sys-patient-billing-api')
    box(d, 'bil', 'legacy', 'Patient billing')
    draw(d, 'top ~> qbi', 'qbi ~> pbi', 'pbi -> sbi', 'sbi -> bil')
  })
  // The EHR drawn as a SaaS product, and dead letters raised by the Process API.
  await passes('cs-095', (d) => {
    d.nodes.find((n) => n.id === 'ehr').type = 'saas'
    cut(d, 'qph ~> dlq')
    draw(d, 'pph ~> dlq')
  })

  // CS-096
  // One topic for everything: the supply consumer reads the same events as EDC and CTMS.
  await failsOn('cs-096', 'through a restricted queue', (d) => {
    unbox(d, 'unq')
    draw(d, 'ev ~> psup')
  })
  // The supply Process API also writes the kit number and arm into EDC.
  await failsOn('cs-096', 'Unblinded data never reaches', (d) => draw(d, 'psup -> sedc'))
  // The webhook API creates the EDC subject itself, around the blinded topic.
  await failsOn('cs-096', 'Every route from IRT', (d) => draw(d, 'hook -> sedc'))
  // The warehouse loads the restricted queue too, for "complete" reporting.
  await failsOn('cs-096', 'Unblinded data never reaches', (d) => draw(d, 'unq ~> dw'))
  // The enrolment Process API posts to the EDC vendor API directly.
  await failsOn('cs-096', 'only through System APIs', (d) => {
    cut(d, 'penr -> sedc')
    draw(d, 'penr -> edc')
  })
  // Site payments still keyed by hand: no scheduled run.
  await failsOn('cs-096', 'pays sites in SAP', (d) => unbox(d, 'job'))
  // The webhook API waits for every consumer before it answers the vendor.
  await failsOn('cs-096', 'publishes blinded trial events', (d) => swap(d, 'hook ~> ev'))
  // IRT drawn as polling the webhook API instead of sending to it.
  await failsOn('cs-096', 'send their events', (d) => flip(d, 'irt -> hook'))
  await failsOn('cs-096', 'Completed visits', (d) => cut(d, 'pvis -> sctms'))
  // A separate webhook API per vendor, both publishing blinded events.
  await passes('cs-096', (d) => {
    box(d, 'hook2', 'experience-api', 'exp-edc-webhooks')
    cut(d, 'edc -> hook')
    draw(d, 'edc -> hook2', 'hook2 ~> ev')
  })
  // The warehouse loaded by its own Process API from the blinded topic.
  await passes('cs-096', (d) => {
    box(d, 'pdw', 'process-api', 'prc-warehouse-loader')
    cut(d, 'ev ~> dw')
    draw(d, 'ev ~> pdw', 'pdw -> dw')
  })
  // The restricted channel drawn as a topic, with the depot as a partner.
  await passes('cs-096', (d) => {
    rename(d, 'unq', 'unblinded-supply-restricted')
    d.nodes.find((n) => n.id === 'unq').type = 'topic'
  })

  // CS-097
  // Last year's design: the filing API calls the mainframe while the vendor waits.
  await failsOn('cs-097', 'No synchronous route', (d) => draw(d, 'exp -> stax'))
  // Status read straight from the mainframe on every poll.
  await failsOn('cs-097', 'status from the status store', (d) => {
    cut(d, 'exp -> sdb')
    draw(d, 'exp -> stax')
  })
  // A vendor given a direct route that skips the gateway policies.
  await failsOn('cs-097', 'only through the gateway', (d) => draw(d, 'sw -> exp'))
  // The return handed over with a blocking call.
  await failsOn('cs-097', 'queues the return', (d) => swap(d, 'exp ~> q'))
  // The Process API opens its own CICS connection.
  await failsOn('cs-097', 'only through a System API', (d) => draw(d, 'prc -> mf'))
  // No copy of the original return is kept.
  await failsOn('cs-097', 'original return is stored', (d) => unbox(d, 'store'))
  // Results stay in the mainframe, so the status store never changes.
  await failsOn('cs-097', 'written to a status store', (d) => cut(d, 'prc -> sdb'))
  await failsOn('cs-097', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  await failsOn('cs-097', 'drains the queue', (d) => cut(d, 'q ~> prc'))
  // The status store as a cache.
  await passes('cs-097', (d) => {
    d.nodes.find((n) => n.id === 'sdb').type = 'cache'
  })
  // Results published as events and written to the status store by a second Process API.
  await passes('cs-097', (d) => {
    box(d, 'top', 'topic', 'return-results')
    box(d, 'pst', 'process-api', 'prc-status-writer')
    cut(d, 'prc -> sdb')
    draw(d, 'prc ~> top', 'top ~> pst', 'pst -> sdb')
  })
  // An identity provider behind the gateway and the original return kept in S3.
  await passes('cs-097', (d) => {
    box(d, 'idp', 'identity-provider', 'Vendor certificate registry')
    draw(d, 'gw -> idp')
    d.nodes.find((n) => n.id === 'store').type = 's3-bucket'
  })

  // CS-098
  // A "lookup tool" for caseworkers that calls the exchange System API without a claim or purpose.
  await failsOn('cs-098', 'without the eligibility Process API', (d) => draw(d, 'ecw -> sx'))
  // The retry consumer gets its own exchange connection, with its own certificate and no quota sharing.
  await failsOn('cs-098', 'Only one System API', (d) => {
    box(d, 'sx2', 'system-api', 'sys-tax-retry-api')
    cut(d, 'pret -> sx')
    draw(d, 'pret -> sx2', 'sx2 -> xg')
  })
  // The Process API signs its own requests to the exchange.
  await failsOn('cs-098', 'reached only through a System API', (d) => draw(d, 'pel -> xg'))
  // Audit written in the lookup call path.
  await failsOn('cs-098', 'Audit records are written as async', (d) => swap(d, 'aq ~> alog'))
  // No audit store at all.
  await failsOn('cs-098', 'recorded in an audit store', (d) => unbox(d, 'alog'))
  // No retry queue: the claim fails when the tax service is offline.
  await failsOn('cs-098', 'parked on a queue', (d) => unbox(d, 'pq'))
  // One Experience API for both audiences.
  await failsOn('cs-098', 'each have their own Experience API', (d) => unbox(d, 'ecw'))
  // The caseworker app skips the gateway.
  await failsOn('cs-098', 'only through the gateway', (d) => draw(d, 'cw -> ecw'))
  await failsOn('cs-098', 'case management system', (d) => draw(d, 'pel -> cms'))
  // Audit messages go through a topic before the queue.
  await passes('cs-098', (d) => {
    box(d, 'at', 'topic', 'audit-events')
    cut(d, 'sx ~> aq')
    draw(d, 'sx ~> at', 'at ~> aq')
  })
  // The eligibility Process API itself consumes the retry queue.
  await passes('cs-098', (d) => {
    unbox(d, 'pret')
    draw(d, 'pq ~> pel')
  })
  // A chatbot channel with its own Experience API joins later.
  await passes('cs-098', (d) => {
    box(d, 'bot', 'chatbot', 'Benefits chatbot')
    box(d, 'ebot', 'experience-api', 'exp-chatbot-api')
    draw(d, 'bot -> gw', 'gw -> ebot', 'ebot -> pel')
  })

  // CS-099
  // The status API asks the OMS for live status, as the old map did.
  await failsOn('cs-099', 'never reach the OMS', (d) => {
    box(d, 'soms', 'system-api', 'sys-oms-api')
    draw(d, 'eout -> soms', 'soms -> oms')
  })
  // The event Process API sends the texts itself, and nothing else uses the notices.
  await failsOn('cs-099', 'at least two consumers', (d) => {
    unbox(d, 'pnot')
    draw(d, 'pout -> notif')
  })
  // The OMS is polled with a blocking call.
  await failsOn('cs-099', 'leave the OMS as async', (d) => swap(d, 'oms ~> oq'))
  // The event Process API reads the CRM directly.
  await failsOn('cs-099', 'CRM is reached only', (d) => {
    cut(d, 'pout -> scrm')
    draw(d, 'pout -> crm')
  })
  // The app gets its own Experience API with its own logic.
  await failsOn('cs-099', 'share one status Experience API', (d) => {
    box(d, 'emob', 'experience-api', 'exp-mobile-outage-api')
    cut(d, 'mob -> eout')
    draw(d, 'mob -> emob', 'emob -> cache')
  })
  // No status cache: the API has nothing to read.
  await failsOn('cs-099', 'reads outage status from a cache', (d) => unbox(d, 'cache'))
  await failsOn('cs-099', 'SMS or email', (d) => unbox(d, 'notif'))
  await failsOn('cs-099', 'updated from the notices', (d) => cut(d, 'pstat -> cache'))
  await failsOn('cs-099', 'outage notices on a topic', (d) => cut(d, 'pout ~> top'))
  // OMS events on Kafka instead of ActiveMQ.
  await passes('cs-099', (d) => {
    d.nodes.find((n) => n.id === 'oq').type = 'event-stream'
  })
  // A gateway in front of the status API, and a priority-call consumer on the topic.
  await passes('cs-099', (d) => {
    box(d, 'gw', 'api-gateway', 'rate limits and HTTP caching')
    box(d, 'ppri', 'process-api', 'prc-priority-calls')
    cut(d, 'web -> eout', 'mob -> eout', 'ivr -> eout')
    draw(d, 'web -> gw', 'mob -> gw', 'ivr -> gw', 'gw -> eout', 'top ~> ppri', 'ppri -> notif')
  })
  // Each subscriber reads its own queue bound to the topic.
  await passes('cs-099', (d) => {
    box(d, 'qn', 'queue', 'notifications.outage')
    cut(d, 'top ~> pnot')
    draw(d, 'top ~> qn', 'qn ~> pnot')
  })

  // CS-100
  // The switching consumer posts its objection straight to the hub System API.
  await failsOn('cs-100', 'replies pass the outbound queue', (d) => draw(d, 'psw -> shub'))
  // One consumer for everything, so month-end reads delay switches.
  await failsOn('cs-100', 'separate consumers', (d) => {
    unbox(d, 'prd')
  })
  // The inbound API calls the switching Process API while the hub waits.
  await failsOn('cs-100', 'placed on a stream', (d) => {
    cut(d, 'ein ~> ms')
    draw(d, 'ein -> psw')
  })
  // The switching Process API writes to the billing platform directly.
  await failsOn('cs-100', 'Billing and the CRM', (d) => draw(d, 'psw -> bill'))
  // Meter reads get a second hub connection for acknowledgements.
  await failsOn('cs-100', 'Only one System API', (d) => {
    box(d, 'shub2', 'system-api', 'sys-read-ack-api')
    draw(d, 'prd -> shub2', 'shub2 -> hub')
  })
  // No archive for the regulator.
  await failsOn('cs-100', 'archived', (d) => unbox(d, 'arch'))
  // Nobody watches deadlines.
  await failsOn('cs-100', 'watches switch deadlines', (d) => unbox(d, 'job'))
  await failsOn('cs-100', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  await failsOn('cs-100', 'tracked in a database', (d) => cut(d, 'psw -> trk'))
  await failsOn('cs-100', 'reached only through a System API', (d) => draw(d, 'pout -> hub'))
  // A topic instead of Kafka, and the archive written by the inbound API before it publishes.
  await passes('cs-100', (d) => {
    d.nodes.find((n) => n.id === 'ms').type = 'topic'
    cut(d, 'ms ~> arch')
    draw(d, 'ein -> arch')
  })
  // Meter read acknowledgements also go through the outbound queue.
  await passes('cs-100', (d) => draw(d, 'prd ~> outq'))
  // Dead letters raised by the stream consumer group, and deadline alerts by email.
  await passes('cs-100', (d) => {
    cut(d, 'psw ~> dlq')
    draw(d, 'ms ~> dlq')
    rename(d, 'alert', 'Market operations email')
  })

  // CS-101
  // The viewer calls a hospital FHIR System API directly, skipping consent, MPI and audit.
  await failsOn('cs-101', 'passes the query Process API', (d) => draw(d, 'cv -> sfa'))
  // No consent check.
  await failsOn('cs-101', 'Consent is checked', (d) => unbox(d, 'scon'))
  // No MPI: hospital numbers are passed through as they are.
  await failsOn('cs-101', 'master patient index', (d) => unbox(d, 'smpi'))
  // Audit written in the request path.
  await failsOn('cs-101', 'audited through async', (d) => swap(d, 'pq ~> aud'))
  // A query System API for a v2-only hospital that cannot answer queries.
  await failsOn('cs-101', 'never query an HL7 v2-only hospital live', (d) => {
    box(d, 'sv2', 'system-api', 'sys-hospital-c-query-api')
    draw(d, 'pq -> sv2', 'sv2 -> v2h')
  })
  // FHIR queries sent through a queue, so the clinician waits on a backlog.
  await failsOn('cs-101', 'queried live with sync calls', (d) => {
    box(d, 'qq', 'queue', 'fhir-query-requests')
    cut(d, 'pq -> sfa')
    draw(d, 'pq ~> qq', 'qq ~> sfa')
  })
  // The loader writes the repository tables itself.
  await failsOn('cs-101', 'reached only through System APIs', (d) => {
    cut(d, 'load -> scdr')
    draw(d, 'load -> cdr')
  })
  // The listener loads each v2 message inline before it ACKs.
  await failsOn('cs-101', 'HL7 v2 messages are queued', (d) => {
    unbox(d, 'v2q')
    draw(d, 'lis -> load')
  })
  await failsOn('cs-101', 'only through the gateway', (d) => draw(d, 'cv -> efh'))
  await failsOn('cs-101', 'validates tokens', (d) => unbox(d, 'idp'))
  // A third FHIR hospital joins.
  await passes('cs-101', (d) => {
    box(d, 'sfc', 'system-api', 'sys-hospital-c-fhir-api')
    box(d, 'ehrc', 'saas', 'Hospital C EHR (FHIR R4)')
    draw(d, 'pq -> sfc', 'sfc -> ehrc')
  })
  // Audit on Kafka, and a cache in front of the MPI.
  await passes('cs-101', (d) => {
    d.nodes.find((n) => n.id === 'aud').type = 'event-stream'
    box(d, 'mc', 'cache', 'MPI lookup cache')
    draw(d, 'smpi -> mc')
  })
  // A GP portal as a second channel through the same gateway.
  await passes('cs-101', (d) => {
    box(d, 'gp', 'web-app', 'GP practice portal')
    draw(d, 'gp -> gw')
  })

  // CS-102
  // The intake API creates the case while the web form waits.
  await failsOn('cs-102', 'No channel writes to the safety database synchronously', (d) => draw(d, 'ef -> ss'))
  // The pollers get their own queue and Process API, so duplicates across channels are missed.
  await failsOn('cs-102', 'one shared intake queue', (d) => {
    box(d, 'q2', 'queue', 'ae-intake-partners')
    box(d, 'p2', 'process-api', 'prc-partner-ae-intake')
    cut(d, 'poll ~> q')
    draw(d, 'poll ~> q2', 'q2 ~> p2', 'p2 -> ss')
  })
  // The Process API inserts rows into the vendor's Oracle tables.
  await failsOn('cs-102', 'reached only through a System API', (d) => draw(d, 'p -> sdb'))
  // No duplicate index.
  await failsOn('cs-102', 'Duplicate reports', (d) => unbox(d, 'dup'))
  // Incomplete reports are dropped instead of triaged.
  await failsOn('cs-102', 'triage queue', (d) => unbox(d, 'tq'))
  // A blocking hand-off from the queue to the Process API.
  await failsOn('cs-102', 'async messages', (d) => swap(d, 'q ~> p'))
  await failsOn('cs-102', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // The web form posts to the intake API around the gateway.
  await failsOn('cs-102', 'only through the gateway', (d) => draw(d, 'web -> ef'))
  await failsOn('cs-102', 'Pollers read', (d) => cut(d, 'poll -> mbox'))
  // One poller per source, both on the shared queue.
  await passes('cs-102', (d) => {
    unbox(d, 'poll')
    box(d, 'pm', 'batch-job', 'mailbox poller')
    box(d, 'ps', 'batch-job', 'partner SFTP poller')
    draw(d, 'pm -> mbox', 'ps -> sftp', 'pm ~> q', 'ps ~> q')
  })
  // The duplicate index in Object Store, and dead letters raised by the Process API.
  await passes('cs-102', (d) => {
    d.nodes.find((n) => n.id === 'dup').type = 'cache'
    cut(d, 'q ~> dlq')
    draw(d, 'p ~> dlq')
  })
  // Original documents stored by the intake API before publishing.
  await passes('cs-102', (d) => {
    box(d, 'docs', 'file-store', 'Source documents (encrypted)')
    draw(d, 'ef -> docs', 'poll -> docs')
  })
}
