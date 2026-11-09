// Wrong and other correct diagrams for batch L (back-office integration scenarios uc-091 to uc-105).
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, flip, swap, draw, box, unbox, rename }) => {
  // UC-091
  // Started by hand through an API instead of a schedule.
  await failsOn('uc-091', 'A scheduled job runs', (d) => {
    d.nodes.find((n) => n.id === 'job').type = 'process-api'
  })
  // The job talks to SAP with its own OData client.
  await failsOn('uc-091', 'SAP is reached only', (d) => draw(d, 'job -> sap'))
  // Supplier records pushed into Coupa by the job directly.
  await failsOn('uc-091', 'Coupa is reached only', (d) => draw(d, 'job -> coupa'))
  // The watermark lives in a flow variable, so a restart reads everything again.
  await failsOn('uc-091', 'watermark', (d) => unbox(d, 'wm'))
  // A two-way sync lets Coupa edits overwrite the SAP master.
  await failsOn('uc-091', 'never writes back', (d) => draw(d, 'coupa -> ssap'))
  await failsOn('uc-091', 'rejected', (d) => unbox(d, 'mail'))
  // Arrow drawn as Coupa calling its own System API.
  await failsOn('uc-091', 'Coupa is reached only', (d) => flip(d, 'scoupa -> coupa'))
  // The job never reads SAP, only the System API exists.
  await failsOn('uc-091', 'reads changed vendors', (d) => cut(d, 'job -> ssap'))
  // Watermark in a control table instead of Object Store.
  await passes('uc-091', (d) => {
    unbox(d, 'wm')
    box(d, 'ctl', 'database', 'Sync control table')
    draw(d, 'job -> ctl')
  })
  // A Process API between the scheduler and the System APIs.
  await passes('uc-091', (d) => {
    box(d, 'prc', 'process-api', 'prc-vendor-sync')
    cut(d, 'job -> ssap', 'job -> scoupa')
    draw(d, 'job -> prc', 'prc -> ssap', 'prc -> scoupa')
  })
  await passes('uc-091', (d) => {
    box(d, 'mon', 'monitoring', 'Anypoint Monitoring')
    draw(d, 'job ~> mon')
  })

  // UC-092
  // Started by hand through an API instead of a schedule.
  await failsOn('uc-092', 'A scheduled job builds', (d) => {
    d.nodes.find((n) => n.id === 'job').type = 'process-api'
  })
  await failsOn('uc-092', 'Oracle EBS is reached only', (d) => draw(d, 'job -> ebs'))
  // The job opens its own SFTP session to the bank.
  await failsOn('uc-092', 'bank SFTP server is reached only', (d) => {
    cut(d, 'job -> sbank')
    draw(d, 'job -> sftp')
  })
  // The bank server drawn as calling the System API.
  await failsOn('uc-092', 'delivered to the bank', (d) => flip(d, 'sbank -> sftp'))
  await failsOn('uc-092', 'archived', (d) => unbox(d, 'arch'))
  await failsOn('uc-092', 'Treasury is alerted', (d) => unbox(d, 'mail'))
  await failsOn('uc-092', 'issued and voided cheques', (d) => cut(d, 'job -> sebs'))
  // Archive in an S3 bucket written by the SFTP System API.
  await passes('uc-092', (d) => {
    unbox(d, 'arch')
    box(d, 's3', 's3-bucket', 'positive-pay-archive')
    draw(d, 'sbank -> s3')
  })
  await passes('uc-092', (d) => {
    box(d, 'prc', 'process-api', 'prc-positive-pay')
    cut(d, 'job -> sebs', 'job -> sbank')
    draw(d, 'job -> prc', 'prc -> sebs', 'prc -> sbank')
  })

  // UC-093
  // A Salesforce outbound call straight into the Process API, so SAP time-outs reach the user.
  await failsOn('uc-093', 'No synchronous call chain', (d) => draw(d, 'sf -> prc'))
  // Polling-style: Salesforce is called, not listened to.
  await failsOn('uc-093', 'leave Salesforce as events', (d) => swap(d, 'sf ~> ssf'))
  // The CDC subscriber hands changes straight to the Process API.
  await failsOn('uc-093', 'wait on a queue', (d) => {
    cut(d, 'ssf ~> q')
    draw(d, 'ssf ~> prc')
  })
  await failsOn('uc-093', 'SAP is reached only', (d) => draw(d, 'prc -> sap'))
  await failsOn('uc-093', 'writes the SAP customer number back', (d) => cut(d, 'prc -> ssf'))
  await failsOn('uc-093', 'cross-reference', (d) => unbox(d, 'xref'))
  await failsOn('uc-093', 'dead-letter', (d) => unbox(d, 'dlq'))
  await failsOn('uc-093', 'Salesforce is updated only', (d) => draw(d, 'prc -> sf'))
  // An exchange instead of a queue.
  await passes('uc-093', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'topic'
    rename(d, 'q', 'account-changes exchange')
  })
  // The cross-reference kept in Object Store, and the Process API owns the DLQ move.
  await passes('uc-093', (d) => {
    unbox(d, 'xref')
    box(d, 'os', 'cache', 'Id map (persistent Object Store)')
    draw(d, 'prc -> os')
    cut(d, 'q ~> dlq')
    draw(d, 'prc ~> dlq')
  })

  // UC-094
  // Workday hires sent in by an HR clerk through an API, with no scheduled pickup.
  await failsOn('uc-094', 'picks up completed hires', (d) => {
    d.nodes.find((n) => n.id === 'job').type = 'process-api'
  })
  // Payroll chained after AD, so an ADP outage blocks logins.
  await failsOn('uc-094', 'do not call each other', (d) => {
    cut(d, 'topic ~> ppay')
    draw(d, 'pad -> ppay')
  })
  // The poller calls both Process APIs itself.
  await failsOn('uc-094', 'published once to a topic', (d) => {
    cut(d, 'job ~> topic')
    draw(d, 'job -> pad', 'job -> ppay')
  })
  await failsOn('uc-094', 'Active Directory is reached only', (d) => draw(d, 'pad -> ad'))
  await failsOn('uc-094', 'payroll provider is reached only', (d) => draw(d, 'ppay -> adp'))
  await failsOn('uc-094', 'written back to Workday', (d) => cut(d, 'pad -> swd'))
  await failsOn('uc-094', 'dead-letter', (d) => unbox(d, 'dlq'))
  await failsOn('uc-094', 'each receive the hire', (d) => swap(d, 'topic ~> ppay'))
  // A third subscriber for ServiceNow laptop requests.
  await passes('uc-094', (d) => {
    box(d, 'psn', 'process-api', 'prc-equipment-request')
    box(d, 'ssn', 'system-api', 'sys-servicenow-api')
    box(d, 'sn', 'saas', 'ServiceNow')
    draw(d, 'topic ~> psn', 'psn -> ssn', 'ssn -> sn')
  })
  // Entra ID drawn as an identity provider behind the AD System API.
  await passes('uc-094', (d) => {
    box(d, 'entra', 'identity-provider', 'Microsoft Entra ID (synced)')
    draw(d, 'sad -> entra')
    rename(d, 'topic', 'worker-events')
  })

  // UC-095
  await failsOn('uc-095', 'never calls EBS in one synchronous chain', (d) => draw(d, 'sf -> prc'))
  await failsOn('uc-095', 'leave Salesforce as events', (d) => swap(d, 'sf ~> ssf'))
  await failsOn('uc-095', 'wait on a queue while EBS is down', (d) => {
    cut(d, 'ssf ~> q')
    draw(d, 'ssf ~> prc')
  })
  // The Process API inserts into OE tables with its own database connection.
  await failsOn('uc-095', 'Oracle EBS is reached only', (d) => draw(d, 'prc -> ebs'))
  await failsOn('uc-095', 'EBS order number is written back', (d) => cut(d, 'prc -> ssf'))
  // Nobody sends shipping status back.
  await failsOn('uc-095', 'shipped and invoiced status', (d) => unbox(d, 'job'))
  await failsOn('uc-095', 'dead-letter', (d) => unbox(d, 'dlq'))
  await failsOn('uc-095', 'Salesforce is updated only', (d) => draw(d, 'job -> sf'))
  // The status job goes through a Process API.
  await passes('uc-095', (d) => {
    box(d, 'pst', 'process-api', 'prc-order-status')
    cut(d, 'job -> sebs', 'job -> ssf')
    draw(d, 'job -> pst', 'pst -> sebs', 'pst -> ssf')
  })
  await passes('uc-095', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'topic'
    box(d, 'mon', 'monitoring', 'Order integration dashboard')
    draw(d, 'prc ~> mon')
  })

  // UC-096
  // The AS2 endpoint posts the IDoc while the retailer waits.
  await failsOn('uc-096', 'No synchronous chain', (d) => draw(d, 'exp -> ssap'))
  await failsOn('uc-096', 'queued before any SAP work', (d) => swap(d, 'exp ~> qin'))
  // DESADV handed straight to the Process API from the IDoc listener.
  await failsOn('uc-096', 'through a queue', (d) => {
    cut(d, 'ssap ~> qout')
    draw(d, 'ssap -> prc')
  })
  await failsOn('uc-096', 'SAP is reached only', (d) => draw(d, 'prc -> sap'))
  await failsOn('uc-096', 'leave through a System API', (d) => draw(d, 'prc -> gw'))
  await failsOn('uc-096', 'tracked in a database', (d) => unbox(d, 'trk'))
  await failsOn('uc-096', 'dead-letter', (d) => unbox(d, 'dlq'))
  await failsOn('uc-096', 'Retailers send 850s', (d) => flip(d, 'ret -> exp'))
  // Documents back to the retailer drawn from the gateway, and one queue for both directions.
  await passes('uc-096', (d) => {
    unbox(d, 'qout')
    draw(d, 'ssap ~> qin', 'gw ~> ret')
  })
  await passes('uc-096', (d) => {
    d.nodes.find((n) => n.id === 'qout').type = 'topic'
    box(d, 'raw', 'file-store', 'Raw interchange store')
    draw(d, 'exp -> raw')
  })

  // UC-097
  // Started by hand through an API instead of a schedule.
  await failsOn('uc-097', 'A scheduled job collects', (d) => {
    d.nodes.find((n) => n.id === 'job').type = 'process-api'
  })
  // The collector loads billing journals into GL_INTERFACE itself.
  await failsOn('uc-097', 'without passing the balance check', (d) => draw(d, 'job -> sgl'))
  await failsOn('uc-097', 'Oracle EBS GL is reached only', (d) => draw(d, 'prc -> ebs'))
  await failsOn('uc-097', 'billing database is read only', (d) => draw(d, 'job -> bill'))
  await failsOn('uc-097', 'Payroll journal files', (d) => {
    cut(d, 'job -> sfile')
    draw(d, 'job -> sftp')
  })
  // Mapping written in DataWeave with no table.
  await failsOn('uc-097', 'mapped from a table', (d) => unbox(d, 'map'))
  await failsOn('uc-097', 'GL team hears', (d) => unbox(d, 'mail'))
  await failsOn('uc-097', 'through a validating Process API', (d) => cut(d, 'job -> prc'))
  // The Process API collects from the sources itself.
  await passes('uc-097', (d) => {
    cut(d, 'job -> sbill', 'job -> sfile')
    draw(d, 'prc -> sbill', 'prc -> sfile')
  })
  // A control table for batch keys and the mapping cached in Object Store.
  await passes('uc-097', (d) => {
    unbox(d, 'map')
    box(d, 'os', 'cache', 'Segment mapping (cached)')
    box(d, 'ctl', 'database', 'Batch control table')
    draw(d, 'prc -> os', 'prc -> ctl')
  })

  // UC-098
  // The poller never starts the e-invoice process.
  await failsOn('uc-098', 'picks up approved invoices', (d) => cut(d, 'job -> prc'))
  // The webhook updates NetSuite inline.
  await failsOn('uc-098', 'never calls NetSuite synchronously', (d) => draw(d, 'hook -> sns'))
  await failsOn('uc-098', 'queued before NetSuite is updated', (d) => {
    cut(d, 'hook ~> q')
    draw(d, 'hook -> prc')
  })
  await failsOn('uc-098', 'Peppol access point is reached only', (d) => draw(d, 'prc -> ap'))
  await failsOn('uc-098', 'NetSuite is reached only', (d) => draw(d, 'job -> ns'))
  await failsOn('uc-098', 'archived', (d) => unbox(d, 'arch'))
  await failsOn('uc-098', 'by email', (d) => unbox(d, 'mail'))
  // Status is polled; no webhook at all.
  await failsOn('uc-098', 'webhook API', (d) => cut(d, 'ap -> hook'))
  await passes('uc-098', (d) => {
    unbox(d, 'arch')
    box(d, 'blob', 'azure-blob', 'ubl-archive container')
    draw(d, 'prc -> blob')
  })
  // An API gateway with IP allowlist in front of the webhook.
  await passes('uc-098', (d) => {
    box(d, 'gwp', 'api-gateway', 'IP allowlist and signature check')
    draw(d, 'gwp -> hook')
    d.nodes.find((n) => n.id === 'q').type = 'topic'
  })

  // UC-099
  // The NetSuite System API pushes bills into SAP itself.
  await failsOn('uc-099', 'do not call each other', (d) => draw(d, 'sns -> ssap'))
  await failsOn('uc-099', 'only through System APIs', (d) => draw(d, 'prc -> sap'))
  await failsOn('uc-099', 'Each invoice pair is recorded', (d) => unbox(d, 'pair'))
  await failsOn('uc-099', 'do not write the pair table', (d) => draw(d, 'ssap -> pair'))
  await failsOn('uc-099', 'daily mismatch report', (d) => unbox(d, 'rec'))
  // The poller talks to both System APIs, so rules end up in the job.
  await failsOn('uc-099', 'owns the intercompany rules', (d) => {
    cut(d, 'job -> prc')
    draw(d, 'job -> sns', 'job -> ssap')
  })
  // One shared System API for both ERPs.
  await failsOn('uc-099', 'serves exactly one ERP', (d) => {
    unbox(d, 'ssap')
    draw(d, 'sns -> sap', 'prc -> sns')
  })
  // The report goes through the Process API.
  await passes('uc-099', (d) => {
    cut(d, 'rec -> pair', 'rec -> mail')
    draw(d, 'rec -> prc', 'prc -> mail')
  })
  await passes('uc-099', (d) => {
    box(d, 'mon', 'monitoring', 'Intercompany dashboard')
    draw(d, 'prc ~> mon')
    rename(d, 'pair', 'IC pair register')
  })

  // UC-100
  // Started by hand through an API instead of a schedule.
  await failsOn('uc-100', 'A batch job runs', (d) => {
    d.nodes.find((n) => n.id === 'job').type = 'process-api'
  })
  // No checkpoint: a restart begins at record 1 again.
  await failsOn('uc-100', 'checkpointed', (d) => unbox(d, 'ck'))
  // Both replicas run at 23:00.
  await failsOn('uc-100', 'two replicas', (d) => unbox(d, 'lock'))
  await failsOn('uc-100', 'billing database is written only', (d) => draw(d, 'job -> bill'))
  await failsOn('uc-100', 'Usage files are read only', (d) => {
    cut(d, 'job -> sfile')
    draw(d, 'job -> sftp')
  })
  await failsOn('uc-100', 'parked', (d) => unbox(d, 'err'))
  await failsOn('uc-100', 'control totals', (d) => unbox(d, 'mail'))
  await failsOn('uc-100', 'loads usage into the billing database', (d) => cut(d, 'job -> sbill'))
  // A Process API does the load for the batch job.
  await passes('uc-100', (d) => {
    box(d, 'prc', 'process-api', 'prc-usage-load')
    cut(d, 'job -> sbill')
    draw(d, 'job -> prc', 'prc -> sbill')
  })
  // Processed files archived by the SFTP System API.
  await passes('uc-100', (d) => {
    box(d, 'arc', 'file-store', 'Processed usage archive')
    draw(d, 'sfile -> arc')
  })

  // UC-101
  // Started by hand through an API instead of a schedule.
  await failsOn('uc-101', 'A scheduled run does', (d) => {
    d.nodes.find((n) => n.id === 'job').type = 'process-api'
  })
  await failsOn('uc-101', 'Salesforce, SAP and Stripe', (d) => cut(d, 'job -> sstr'))
  await failsOn('uc-101', 'only through a System API', (d) => draw(d, 'job -> stripe'))
  await failsOn('uc-101', 'staged in a database', (d) => unbox(d, 'stage'))
  // The dashboard asks Salesforce live.
  await failsOn('uc-101', 'never queries the source systems', (d) => draw(d, 'ui -> ssf'))
  // SAP replicates to Snowflake with its own tool, bypassing the matching.
  await failsOn('uc-101', 'not loaded straight from the sources', (d) => draw(d, 'sap ~> dw'))
  await failsOn('uc-101', 'exception report', (d) => unbox(d, 'mail'))
  await failsOn('uc-101', 'feed the data warehouse', (d) => cut(d, 'job -> dw'))
  // Warehouse loaded from the staging database.
  await passes('uc-101', (d) => {
    cut(d, 'job -> dw')
    draw(d, 'stage ~> dw')
  })
  // The dashboard reads the warehouse through an Experience API.
  await passes('uc-101', (d) => {
    box(d, 'exp', 'experience-api', 'exp-finance-recon-api')
    cut(d, 'ui -> dw')
    draw(d, 'ui -> exp', 'exp -> dw')
  })

  // UC-102
  // The old nightly extract job still runs beside the CDC feed.
  await failsOn('uc-102', 'No API or job queries', (d) => draw(d, 'rep -> ebs'))
  // The loader looks up reference data in EBS.
  await failsOn('uc-102', 'No API or job queries', (d) => draw(d, 'prc -> ebs'))
  await failsOn('uc-102', 'captured from the EBS database onto Kafka', (d) => swap(d, 'ebs ~> k'))
  await failsOn('uc-102', 'row by row', (d) => draw(d, 'prc -> dw'))
  await failsOn('uc-102', 'through a staging bucket', (d) => cut(d, 's3 ~> dw'))
  await failsOn('uc-102', 'dead-letter', (d) => unbox(d, 'dlq'))
  await failsOn('uc-102', 'compares row counts', (d) => unbox(d, 'rep'))
  await failsOn('uc-102', 'raise alerts', (d) => unbox(d, 'mail'))
  await failsOn('uc-102', 'consumes the change stream', (d) => swap(d, 'k ~> prc'))
  // Azure Blob staging and a System API for the count check.
  await passes('uc-102', (d) => {
    d.nodes.find((n) => n.id === 's3').type = 'azure-blob'
    box(d, 'sdw', 'system-api', 'sys-snowflake-api')
    cut(d, 'rep -> dw')
    draw(d, 'rep -> sdw', 'sdw -> dw')
  })
  await passes('uc-102', (d) => {
    box(d, 'mon', 'monitoring', 'Consumer lag dashboard')
    draw(d, 'prc ~> mon')
    rename(d, 'k', 'Confluent topics per table')
  })

  // UC-103
  // The approval app updates SAP bank data itself after the call.
  await failsOn('uc-103', 'approval app never writes to SAP', (d) => draw(d, 'expa -> ssap'))
  // The webhook writes the new IBAN to SAP and starts checks later.
  await failsOn('uc-103', 'Coupa cannot change SAP bank details', (d) => draw(d, 'hook -> ssap'))
  await failsOn('uc-103', 'validation service is reached only', (d) => draw(d, 'prc -> val'))
  await failsOn('uc-103', 'SAP is reached only', (d) => draw(d, 'prc -> sap'))
  await failsOn('uc-103', 'audit log', (d) => unbox(d, 'audit'))
  await failsOn('uc-103', 'call-back is needed', (d) => unbox(d, 'mail'))
  await failsOn('uc-103', 'are queued for the Process API', (d) => {
    cut(d, 'hook ~> q')
    draw(d, 'hook -> prc')
  })
  // The approval app calls the Process API without an Experience API.
  await failsOn('uc-103', 'An AP clerk approves', (d) => {
    unbox(d, 'expa')
    draw(d, 'ap -> prc')
  })
  // Sign-in through the identity provider and a gateway in front of the approvals API.
  await passes('uc-103', (d) => {
    box(d, 'idp', 'identity-provider', 'Azure AD sign-in')
    box(d, 'gwp', 'api-gateway', 'JWT validation policy')
    cut(d, 'ap -> expa')
    draw(d, 'ap -> idp', 'ap -> gwp', 'gwp -> expa')
  })
  // An exchange, a DLQ, and the vendor told about the outcome.
  await passes('uc-103', (d) => {
    d.nodes.find((n) => n.id === 'q').type = 'topic'
    box(d, 'dlq', 'dlq', 'bank-change-dlq')
    box(d, 'vmail', 'notification', 'Outcome email to vendor')
    draw(d, 'q ~> dlq', 'prc -> vmail')
  })

  // UC-104
  // The cockpit API calls the SAP System API to pull a trial balance while the controller waits.
  await failsOn('uc-104', 'never waits on an ERP', (d) => draw(d, 'exp -> s1'))
  // The orchestrator calls the worker directly instead of raising an event.
  await failsOn('uc-104', 'do not call each other directly', (d) => {
    cut(d, 'orch ~> topic')
    draw(d, 'orch -> gl')
  })
  // No events at all: the orchestrator drives the worker by calls.
  await failsOn('uc-104', 'started by events', (d) => {
    unbox(d, 'topic')
    draw(d, 'orch -> gl')
  })
  await failsOn('uc-104', 'All ERPs are reached only', (d) => draw(d, 'gl -> erp3'))
  // A second SAP System API built for the close project.
  await failsOn('uc-104', 'exactly one System API', (d) => {
    box(d, 's1b', 'system-api', 'sys-sap-close-api')
    draw(d, 'gl -> s1b', 's1b -> erp1')
  })
  await failsOn('uc-104', 'consolidation tool is reached only', (d) => draw(d, 'orch -> cons'))
  await failsOn('uc-104', 'state are kept in a database', (d) => unbox(d, 'state'))
  await failsOn('uc-104', 'write-once store', (d) => unbox(d, 'ev'))
  await failsOn('uc-104', 'dead-letter', (d) => unbox(d, 'dlq'))
  await failsOn('uc-104', 'FX rates come through', (d) => draw(d, 'orch -> fx'))
  await failsOn('uc-104', 'Controllers drive the close', (d) => {
    unbox(d, 'exp')
    draw(d, 'cal -> orch')
  })
  // One worker per ERP type, each with its own subscription.
  await passes('uc-104', (d) => {
    box(d, 'w2', 'process-api', 'prc-ebs-gl-worker')
    cut(d, 'gl -> s2')
    draw(d, 'topic ~> w2', 'w2 -> s2', 'w2 ~> topic')
  })
  // Gateway in front of the cockpit API, and the Dynamics instance added.
  await passes('uc-104', (d) => {
    box(d, 'gwp', 'api-gateway', 'SSO and client-id policies')
    cut(d, 'cal -> exp')
    draw(d, 'cal -> gwp', 'gwp -> exp')
    box(d, 's4', 'system-api', 'sys-d365-gl-api')
    box(d, 'erp4', 'erp', 'Dynamics 365 Finance (Brazil)')
    draw(d, 'gl -> s4', 's4 -> erp4')
  })

  // UC-105
  // Treasury releases a payment by calling the bank connectivity API.
  await failsOn('uc-105', 'cannot send anything to a bank', (d) => draw(d, 'exap -> sbank'))
  // The factory uploads files to the bank inline.
  await failsOn('uc-105', 'No synchronous call chain', (d) => draw(d, 'prc -> sbank'))
  await failsOn('uc-105', 'reached only through System APIs', (d) => draw(d, 'prc -> san'))
  // No ledger: duplicates are found by hand.
  await failsOn('uc-105', 'payment ledger', (d) => unbox(d, 'led'))
  await failsOn('uc-105', 'ERPs are updated only', (d) => draw(d, 'prc -> erp2'))
  // Status reports handed straight to the factory.
  await failsOn('uc-105', 'status reports reach the ERPs', (d) => {
    cut(d, 'poll ~> qs')
    draw(d, 'poll -> prc')
  })
  await failsOn('uc-105', 'dead-letter', (d) => unbox(d, 'dlq'))
  await failsOn('uc-105', 'Treasury is alerted', (d) => unbox(d, 'mail'))
  await failsOn('uc-105', 'Treasury approves large payments', (d) => unbox(d, 'tws'))
  await failsOn('uc-105', 'Bank files leave through a queue', (d) => {
    cut(d, 'prc ~> qb')
    draw(d, 'prc ~> sbank')
  })
  // A separate System API for the SWIFT bureau.
  await passes('uc-105', (d) => {
    box(d, 'sswift', 'system-api', 'sys-swift-fileact-api')
    cut(d, 'sbank -> swift')
    draw(d, 'qb ~> sswift', 'sswift -> swift')
  })
  // Cloud queues and a gateway in front of the approvals API.
  await passes('uc-105', (d) => {
    d.nodes.find((n) => n.id === 'qb').type = 'cloud-queue'
    d.nodes.find((n) => n.id === 'qs').type = 'cloud-queue'
    box(d, 'gwp', 'api-gateway', 'MFA and client-id policies')
    cut(d, 'tws -> exap')
    draw(d, 'tws -> gwp', 'gwp -> exap')
  })
}
