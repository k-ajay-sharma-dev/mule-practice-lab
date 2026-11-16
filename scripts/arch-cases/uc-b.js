// Run cases for the use cases uc-014 to uc-033.
// See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, cut, draw, set }) => {
  // UC-014
  // The loyalty Process API left at 0.1 vCore cannot take 120 baskets and 30 redemptions a second.
  await failsOn('uc-014', 'Run: Saturday morning peak', (d) => set(d, 'p', { vCores: undefined }))
  // No redelivery limit: malformed baskets are retried for ever and never reach the DLQ.
  await failsOn('uc-014', 'Run: Malformed baskets', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // UC-015
  // The PMS and Graph called one after another: the times add up to more than 2 seconds.
  await failsOn('uc-015', 'Run: Monday morning searches', (d) => set(d, 'p', { calls: undefined }))
  // No partial answer: slow Graph calls fail the whole search.
  await failsOn('uc-015', 'Run: Microsoft Graph is slow', (d) => set(d, 'p', { onFailure: undefined }))

  // UC-016
  // A short redelivery limit drops signed contracts while SharePoint is down (there is no DLQ).
  await failsOn('uc-016', 'Run: SharePoint is down for an hour', (d) => set(d, 'dsq', { maxRedelivery: 3 }))
  // The DocuSign System API keeps the default 10 second timeout and gives up on every slow envelope.
  await failsOn('uc-016', 'Run: DocuSign is slow at month end', (d) => set(d, 'sds', { timeoutMs: undefined }))

  // UC-017
  // The carrier and D365 called one after another: the label takes more than 2 seconds.
  await failsOn('uc-017', 'Run: After-Christmas returns', (d) => set(d, 'p', { calls: undefined }))
  // No retries on the Shopify System API: 1 refund in 10 fails.
  await failsOn('uc-017', 'Run: Shopify drops some refund calls', (d) => set(d, 'sshop', { retries: undefined }))

  // UC-018
  // A detector sized for the average 250 a second never catches up after the backlog burst.
  await failsOn('uc-018', 'Run: Trucks come out of a tunnel area', (d) => set(d, 'det', { vCores: '0.5' }))
  // A detector at 0.2 vCore cannot even keep up with the normal stream, let alone a restart.
  await failsOn('uc-018', 'Run: The detector restarts', (d) => set(d, 'det', { vCores: '0.2' }))

  // UC-019
  // No retries on the NetSuite System API: 1 payment line in 10 is not posted.
  await failsOn('uc-019', 'Run: NetSuite drops some calls', (d) => set(d, 'sns', { retries: undefined }))
  // The matching API keeps the default 10 second timeout and gives up on every slow posting.
  await failsOn('uc-019', 'Run: NetSuite is slow at night', (d) => set(d, 'p', { timeoutMs: undefined }))

  // UC-020
  // The webhook API calls the onboarding API directly: while the bureau is down the vendor results fail.
  await failsOn('uc-020', 'Run: The credit bureau is down for 20 minutes', (d) => {
    cut(d, 'wh ~> q')
    draw(d, 'wh -> p')
  })
  // No retries on the screening System API: 1 applicant in 5 gets an error.
  await failsOn('uc-020', 'Run: Screening drops some calls', (d) => set(d, 'sscr', { retries: undefined }))

  // UC-021
  // Salesforce calls the subscription API directly: while the product platform is down the deals fail.
  await failsOn('uc-021', 'Run: The product platform is down for 10 minutes', (d) => {
    cut(d, 'sf ~> q')
    draw(d, 'sf -> p')
  })
  // No retries on the billing System API: 1 usage record in 10 is not billed.
  await failsOn('uc-021', 'Run: Billing drops some usage uploads', (d) => set(d, 'sbill', { retries: undefined }))

  // UC-022
  // Neither gateway checks credentials: the revoked partner still creates shipments.
  await failsOn('uc-022', 'Run: A revoked partner calls', (d) => {
    set(d, 'gw', { auth: undefined })
    set(d, 'lgw', { auth: undefined })
  })
  // No rate limit on the API Manager gateway: the flood reaches the shipment platform.
  await failsOn('uc-022', 'Run: A partner floods the API', (d) => set(d, 'gw', { rateLimit: undefined }))

  // UC-023
  // The SAP System API calls the Field Service API directly: the release burst goes straight at Salesforce.
  await failsOn('uc-023', 'Run: The morning order release', (d) => {
    cut(d, 'ssap ~> ord')
    draw(d, 'ssap -> pfs')
  })
  // Salesforce calls the work-order API directly: while SAP is down the completions fail.
  await failsOn('uc-023', 'Run: SAP is down for 30 minutes', (d) => {
    cut(d, 'sf ~> wq')
    draw(d, 'sf -> pwo')
  })

  // UC-024
  // No retries on the Salesforce DSR API: 1 erasure in 5 fails.
  await failsOn('uc-024', 'Run: Salesforce drops some calls', (d) => set(d, 'ssf', { retries: undefined }))
  // The warehouse System API keeps the default 10 second timeout and gives up on every slow delete.
  await failsOn('uc-024', 'Run: The data warehouse is slow', (d) => set(d, 'sdw', { timeoutMs: undefined }))

  // UC-025
  // No cache on flight search: every search goes to the GDS, far over its 100 calls a second.
  await failsOn('uc-025', 'Run: Peak searches', (d) => cut(d, 'pfs -> cache'))
  // No client ID policy on the gateway: the bot gets through and overloads the GDS.
  await failsOn('uc-025', 'Run: A bot scrapes prices', (d) => set(d, 'gw', { auth: undefined }))

  // UC-026
  // The RMS System API calls the distribution API directly: the run goes at the OTAs faster than they allow.
  await failsOn('uc-026', 'Run: The RMS re-pricing run', (d) => {
    cut(d, 'srms ~> ariq')
    draw(d, 'srms -> ari')
  })
  // The Booking.com adapter calls the delivery API directly: while OPERA is down the reservations fail.
  await failsOn('uc-026', 'Run: OPERA is down for 20 minutes', (d) => {
    cut(d, 'cbk ~> resq')
    draw(d, 'cbk -> resp')
  })

  // UC-027
  // The job fails when the provider fails, so SAP gets no rates at all.
  await failsOn('uc-027', 'Run: The provider is late', (d) => set(d, 'job', { onFailure: undefined }))
  // No retries on the FX System API: 1 rate set in 4 falls back to yesterday's rate.
  await failsOn('uc-027', 'Run: The provider drops some calls', (d) => set(d, 'sfx', { retries: undefined }))

  // UC-028
  // A short redelivery limit sends good notifications to the DLQ while the vendor is down.
  await failsOn('uc-028', 'Run: The parent app is down for 20 minutes', (d) => set(d, 'nq', { maxRedelivery: 3 }))
  // No redelivery limit: rejected notifications are retried for ever and never reach the DLQ.
  await failsOn('uc-028', 'Run: Guardians the vendor rejects', (d) => set(d, 'nq', { maxRedelivery: undefined }))

  // UC-029
  // No retries on the Salesforce System API: 1 renewal Opportunity in 5 is missing.
  await failsOn('uc-029', 'Run: Salesforce drops some calls', (d) => set(d, 'ssf', { retries: undefined }))
  // The job fails a contract when the directory fails, so no reminder goes out.
  await failsOn('uc-029', 'Run: The directory is down', (d) => set(d, 'job', { onFailure: undefined }))

  // UC-030
  // No retries on the D365 System API: 1 report in 5 is not posted.
  await failsOn('uc-030', 'Run: D365 drops some calls', (d) => set(d, 'serp', { retries: undefined }))
  // The poller keeps the default 10 second timeout and gives up on every slow posting.
  await failsOn('uc-030', 'Run: D365 is slow at month end', (d) => set(d, 'job', { timeoutMs: undefined }))

  // UC-031
  // A short redelivery limit sends good PRs to the DLQ while SAP is down.
  await failsOn('uc-031', 'Run: SAP is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 3 }))
  // No redelivery limit: rejected PRs are retried for ever and never reach the buying team.
  await failsOn('uc-031', 'Run: PRs SAP always rejects', (d) => set(d, 'q', { maxRedelivery: undefined }))

  // UC-032
  // The MLLP listener calls the results API directly: while the portal is down the results fail.
  await failsOn('uc-032', 'Run: The portal is down for 30 minutes', (d) => {
    cut(d, 'mllp ~> q')
    draw(d, 'mllp -> prc')
  })
  // The FHIR System API keeps the default 10 second timeout and gives up on every large bundle.
  await failsOn('uc-032', 'Run: The portal FHIR API is slow', (d) => set(d, 'sfhir', { timeoutMs: undefined }))

  // UC-033
  // The SMS System API left at 0.1 vCore sends only 50 a second, so the storm SMS are not all out in 45 minutes.
  await failsOn('uc-033', 'Run: A storm', (d) => set(d, 'ssms', { vCores: undefined }))
  // A notification API at 0.2 vCore cannot take 150 updates a second, so outage events pile up in the topic.
  await failsOn('uc-033', 'Run: The SMS provider is down for 20 minutes', (d) => set(d, 'prc', { vCores: '0.2' }))
}
