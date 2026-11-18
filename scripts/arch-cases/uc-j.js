// Wrong and other correct diagrams for use cases batch J (uc-151 to uc-162). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // UC-151
  // No redelivery limit: a scan for a closed ward is tried for ever.
  await failsOn('uc-151', 'Run: A scan for a closed ward', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // A limit of 5: good scans go to the DLQ during the Sunday upgrade.
  await failsOn('uc-151', 'Run: The Sunday LIMS upgrade', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // The Experience API calls the LIMS System API itself.
  await failsOn('uc-151', 'The scanners never wait on the LIMS', (d) => draw(d, 'exp -> sys'))
  // No DLQ.
  await failsOn('uc-151', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // Two replicas of the Experience API, and other names.
  await passes('uc-151', (d) => {
    set(d, 'exp', { replicas: 2 })
    rename(d, 'q', 'lab-sample-scans')
  })

  // UC-152
  // No client ID policy.
  await failsOn('uc-152', 'Run: A caller without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  // The bureau calls the Experience API around the gateway.
  await failsOn('uc-152', 'reached only through the gateway', (d) => draw(d, 'bur -> exp'))
  // The Experience API files documents directly.
  await failsOn('uc-152', 'The bureau never waits on the document system', (d) => draw(d, 'exp -> sys'))
  // The Experience API on the smallest size cannot take the January rush.
  await failsOn('uc-152', 'Run: The January rush', (d) => set(d, 'exp', { vCores: undefined }))
  // Two replicas of the Experience API, and other names.
  await passes('uc-152', (d) => {
    set(d, 'exp', { replicas: 2 })
    rename(d, 'dm', 'Tax document store')
  })

  // UC-153
  // No client ID policy.
  await failsOn('uc-153', 'Run: A supplier without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  // A limit of 10: good notifications fail during Oracle patching.
  await failsOn('uc-153', 'Run: Oracle patching for an hour', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // The Experience API loads Oracle while the supplier waits.
  await failsOn('uc-153', 'Suppliers never wait on Oracle', (d) => draw(d, 'exp -> sysO'))
  // The Experience API writes to blob storage directly.
  await failsOn('uc-153', 'only through a System API', (d) => draw(d, 'exp -> blob'))
  // No failure queue.
  await failsOn('uc-153', 'has a failure queue', (d) => unbox(d, 'dlq'))
  // A limit of 120 and other names.
  await passes('uc-153', (d) => {
    set(d, 'q', { maxRedelivery: 120 })
    rename(d, 'sysB', 'sys-pdh-documents')
  })

  // UC-154
  // One replica: a zone outage at 21:00 fails the stores.
  await failsOn('uc-154', 'Run: A zone fails at 21:00', (d) => set(d, 'exp', { replicas: 1 }))
  // A limit of 5: good movements go to the DLQ during maintenance.
  await failsOn('uc-154', 'Run: Planning platform maintenance', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No redelivery limit.
  await failsOn('uc-154', 'Run: A movement for an unknown store', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The smallest size cannot take closing time.
  await failsOn('uc-154', 'Run: Closing time', (d) => set(d, 'exp', { replicas: undefined, vCores: undefined }))
  // The Process API calls the planning platform directly.
  await failsOn('uc-154', 'only through a System API', (d) => draw(d, 'prc -> plan'))
  // Three replicas and a limit of 60.
  await passes('uc-154', (d) => {
    set(d, 'exp', { replicas: 3 })
    set(d, 'q', { maxRedelivery: 60 })
  })

  // UC-155
  // A limit of 5: good notifications go to the DLQ while the stores restart.
  await failsOn('uc-155', 'Run: Store systems restart for an hour', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No redelivery limit.
  await failsOn('uc-155', 'Run: A message for a closed store group', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The Process API reads Oracle directly.
  await failsOn('uc-155', 'read from Oracle only through a System API', (d) => draw(d, 'prc -> ora'))
  // No console path.
  await failsOn('uc-155', 'Support can start a run', (d) => unbox(d, 'con'))
  // A limit of 120, and other names.
  await passes('uc-155', (d) => {
    set(d, 'q', { maxRedelivery: 120 })
    rename(d, 'dst', 'prc-pdh-store-delivery')
  })

  // UC-156
  // A queue instead of a topic: each scan reaches only one system.
  await failsOn('uc-156', 'Run: The evening peak', (d) => {
    const t = d.nodes.find((n) => n.id === 't')
    t.type = 'queue'
  })
  // One replica of the Experience API: a zone outage fails the scanners.
  await failsOn('uc-156', 'Run: A zone fails at the peak', (d) => set(d, 'exp', { replicas: 1 }))
  // A limit of 5: scans for the warehouse go to the DLQ during its outage.
  await failsOn('uc-156', 'Run: The data warehouse is down for 45 minutes', (d) => set(d, 't', { maxRedelivery: 5 }))
  // No redelivery limit.
  await failsOn('uc-156', 'Run: A scan with a broken barcode', (d) => set(d, 't', { maxRedelivery: undefined }))
  // The tracking Process API calls the tracking system directly.
  await failsOn('uc-156', 'only through System APIs', (d) => draw(d, 'pT -> trk'))
  // Three replicas of the Experience API, and a limit of 120.
  await passes('uc-156', (d) => {
    set(d, 'exp', { replicas: 3 })
    set(d, 't', { maxRedelivery: 120 })
  })

  // UC-157
  // No retries: a busy storage account fails part of the night.
  await failsOn('uc-157', 'Run: A busy storage account', (d) => set(d, 'job', { retries: undefined }))
  // The job does not read SFTP: the partner pushes to storage itself.
  await failsOn('uc-157', 'reads from the partner\'s SFTP server', (d) => cut(d, 'job -> sftp'))
  // The job writes to storage and does not wait.
  await failsOn('uc-157', 'while it waits for them', (d) => {
    cut(d, 'job -> blob')
    draw(d, 'job ~> blob')
  })
  // Three retries, and other names.
  await passes('uc-157', (d) => {
    set(d, 'job', { retries: 3 })
    rename(d, 'blob', 'policy-documents container')
  })

  // UC-158
  // The default ten second timeout: 80 MB files fail.
  await failsOn('uc-158', 'Run: The month end SupplierItem files', (d) => {
    set(d, 'job', { timeoutMs: undefined })
    set(d, 'sysB', { timeoutMs: undefined })
    set(d, 'prc', { timeoutMs: undefined })
  })
  // A limit of 10: documents fail during Oracle patching.
  await failsOn('uc-158', 'Run: Oracle patching', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // The collector loads Oracle itself.
  await failsOn('uc-158', 'only through a System API', (d) => draw(d, 'job -> ora'))
  // No DLQ.
  await failsOn('uc-158', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // Two minute timeouts and a limit of 90.
  await passes('uc-158', (d) => {
    for (const id of ['job', 'sysB', 'prc']) set(d, id, { timeoutMs: 120000 })
    set(d, 'q', { maxRedelivery: 90 })
  })

  // UC-159
  // No token check: scripts get links.
  await failsOn('uc-159', 'Run: A request without a token', (d) => set(d, 'gw', { auth: undefined }))
  // Mule fetches the PDFs again.
  await failsOn('uc-159', 'No Mule API fetches the PDFs', (d) => draw(d, 'exp -> blob'))
  // The APIs on the smallest size cannot take statements day.
  await failsOn('uc-159', 'Run: Statements day', (d) => {
    for (const id of ['exp', 'sysS', 'sysT']) set(d, id, { vCores: undefined })
  })
  // The Experience API calls the token service directly.
  await failsOn('uc-159', 'only through a System API', (d) => draw(d, 'exp -> tok'))
  // Two replicas each, and other names.
  await passes('uc-159', (d) => {
    for (const id of ['exp', 'sysS', 'sysT']) set(d, id, { replicas: 2 })
    rename(d, 'tok', 'Link token signer')
  })

  // UC-160
  // A limit of 10: good feeds go to the poison queue during maintenance.
  await failsOn('uc-160', 'Run: The catalogue is down for an hour', (d) => set(d, 'cq', { maxRedelivery: 10 }))
  // No redelivery limit: corrupt feeds are tried for ever.
  await failsOn('uc-160', 'Run: A corrupt feed', (d) => set(d, 'cq', { maxRedelivery: undefined }))
  // The import calls the catalogue directly.
  await failsOn('uc-160', 'only through a System API', (d) => draw(d, 'prc -> cat'))
  // No poison queue.
  await failsOn('uc-160', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A limit of 75, and other names.
  await passes('uc-160', (d) => {
    set(d, 'cq', { maxRedelivery: 75 })
    rename(d, 'cq', 'supplier-drop-events')
  })

  // UC-161
  // The default timeouts: a 15 second Oracle fails the jobs.
  await failsOn('uc-161', 'Run: Oracle gathers statistics', (d) => {
    for (const id of ['exp', 'res', 'sysO']) set(d, id, { timeoutMs: undefined })
  })
  // No retries: busy storage fails groups.
  await failsOn('uc-161', 'Run: Blob storage is busy', (d) => set(d, 'sysB', { retries: undefined }))
  // The export job reads Oracle directly.
  await failsOn('uc-161', 'Oracle is reached only through a System API', (d) => draw(d, 'exp -> ora'))
  // The planning platform is not linked to storage.
  await failsOn('uc-161', 'exchanges files with blob storage', (d) => cut(d, 'plan -> blob'))
  // Three retries and a one minute timeout.
  await passes('uc-161', (d) => {
    set(d, 'sysB', { retries: 3 })
    for (const id of ['exp', 'res', 'sysO']) set(d, id, { timeoutMs: 60000 })
  })

  // UC-162
  // One replica of each API: a zone outage stops the case workers.
  await failsOn('uc-162', 'Run: A zone fails during the busy half hour', (d) => {
    set(d, 'exp', { replicas: 1 })
    set(d, 'sysB', { replicas: 1 })
  })
  // No retries: storage pushback fails documents.
  await failsOn('uc-162', 'Run: Storage pushes back', (d) => set(d, 'sysB', { retries: undefined }))
  // The case worker app saves to the old share.
  await failsOn('uc-162', 'never wait on the old share', (d) => draw(d, 'exp -> share'))
  // The migration job writes to storage directly.
  await failsOn('uc-162', 'only through a System API', (d) => draw(d, 'job -> blob'))
  // Three replicas of the blob System API, and other names.
  await passes('uc-162', (d) => {
    set(d, 'sysB', { replicas: 3, retries: 3 })
    rename(d, 'job', 'thornbury-archive-copy')
  })
}
