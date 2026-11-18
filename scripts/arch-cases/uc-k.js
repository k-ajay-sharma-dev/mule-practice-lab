// Wrong and other correct diagrams for use cases batch K (uc-163 to uc-174): Azure File Share and SFTP. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, draw, unbox, rename, set }) => {
  // UC-163
  // The default ten second timeout: big stores' uploads fail.
  await failsOn('uc-163', 'Run: A normal night', (d) => set(d, 'job', { timeoutMs: undefined }))
  // No retries: a busy share loses files for a day.
  await failsOn('uc-163', 'Run: The share is busy', (d) => set(d, 'job', { retries: undefined }))
  // The tills upload to the platform themselves.
  await failsOn('uc-163', 'never talk to the planning platform directly', (d) => draw(d, 'pos -> sftp'))
  // The job does not read the share.
  await failsOn('uc-163', 'A scheduled job reads the share', (d) => cut(d, 'job -> share'))
  // A longer timeout, three retries, and other names.
  await passes('uc-163', (d) => {
    set(d, 'job', { timeoutMs: 90000, retries: 3 })
    rename(d, 'share', 'Store sales file share')
  })

  // UC-164
  // The smallest Experience API cannot take Monday morning.
  await failsOn('uc-164', 'Run: Monday morning', (d) => set(d, 'exp', { vCores: undefined }))
  // No retries in the System API.
  await failsOn('uc-164', 'Run: The share is busy', (d) => set(d, 'sys', { retries: undefined }))
  // The Experience API reads the share itself.
  await failsOn('uc-164', 'never reads the share itself', (d) => draw(d, 'exp -> share'))
  // One vCore each and two replicas.
  await passes('uc-164', (d) => {
    set(d, 'exp', { vCores: '1', replicas: 2 })
    set(d, 'sys', { vCores: '1', replicas: 2 })
  })

  // UC-165
  // A limit of 5: good plans go to the DLQ during WMS maintenance.
  await failsOn('uc-165', 'Run: WMS maintenance', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No limit: a plan that can never load circles for ever.
  await failsOn('uc-165', 'Run: A plan file that can never load', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // No DLQ.
  await failsOn('uc-165', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // The Process API calls the WMS directly.
  await failsOn('uc-165', 'The WMS is reached only through a System API', (d) => draw(d, 'prc -> wms'))
  // A limit of 120, and other names.
  await passes('uc-165', (d) => {
    set(d, 'q', { maxRedelivery: 120 })
    rename(d, 'job', 'plan-file-watcher')
  })

  // UC-166
  // The Process API keeps the default timeout: 200 MB models fail.
  await failsOn('uc-166', 'Run: A batch of 200 MB models', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // A limit of 10: drawings go to the DLQ while the runtime is patched.
  await failsOn('uc-166', 'Run: The share System API restarts', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // The CloudHub Process API reads the share directly.
  await failsOn('uc-166', 'Nothing on CloudHub reads the share directly', (d) => draw(d, 'prc -> share'))
  // Longer timeouts and a limit of 90.
  await passes('uc-166', (d) => {
    set(d, 'q', { maxRedelivery: 90 })
    for (const id of ['prc', 'sysF', 'sysP']) set(d, id, { timeoutMs: 120000 })
  })

  // UC-167
  // A five minute cache: too many polls reach the share at 06:00.
  await failsOn('uc-167', 'Run: The 06:00 rush', (d) => set(d, 'cache', { ttlSec: undefined }))
  // No client ID policy.
  await failsOn('uc-167', 'Run: A shop without its client ID', (d) => set(d, 'gw', { auth: undefined }))
  // No cache.
  await failsOn('uc-167', 'The Experience API has a cache', (d) => unbox(d, 'cache'))
  // Bigger APIs and a 30 minute cache.
  await passes('uc-167', (d) => {
    set(d, 'exp', { vCores: '4' })
    set(d, 'cache', { ttlSec: 1800 })
  })

  // UC-168
  // One replica of the outbound job: a zone outage stops the night run.
  await failsOn('uc-168', 'Run: A zone fails during the night run', (d) => set(d, 'out', { replicas: 1 }))
  // The default timeout on the outbound job: month end files fail.
  await failsOn('uc-168', 'Run: Month end files', (d) => set(d, 'out', { timeoutMs: undefined }))
  // A limit of 10: plans go to the DLQ during WMS maintenance.
  await failsOn('uc-168', 'Run: WMS maintenance', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: a plan for an unknown store circles for ever.
  await failsOn('uc-168', 'Run: A plan for a store the WMS does not know', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The outbound job reads SQL Server directly.
  await failsOn('uc-168', 'SQL Server is reached only through a System API', (d) => draw(d, 'out -> sql'))
  // Three replicas and longer timeouts.
  await passes('uc-168', (d) => {
    set(d, 'out', { replicas: 3, timeoutMs: 90000 })
    set(d, 'col', { timeoutMs: 90000 })
    set(d, 'sysD', { replicas: 3 })
  })

  // UC-169
  // No retries: busy ERP calls fail.
  await failsOn('uc-169', 'Run: The ERP is busy', (d) => set(d, 'sys', { retries: undefined }))
  // The job posts to the ERP directly.
  await failsOn('uc-169', 'The ERP is reached only through a System API', (d) => draw(d, 'job -> erp'))
  // The job does not read the haulier's server.
  await failsOn('uc-169', 'reads the haulier', (d) => cut(d, 'job -> sftp'))
  // Three retries, and other names.
  await passes('uc-169', (d) => {
    set(d, 'sys', { retries: 3 })
    rename(d, 'job', 'milk-ticket-collector')
  })

  // UC-170
  // The default timeout: Sunday's full files fail.
  await failsOn('uc-170', 'Run: The weekly full sales file', (d) => set(d, 'sales', { timeoutMs: undefined }))
  // A limit of 10: orders go to the DLQ during ERP patching.
  await failsOn('uc-170', 'Run: ERP patching', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: orders for a closed supplier circle for ever.
  await failsOn('uc-170', 'Run: Orders for a supplier the ERP has closed', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The Process API calls the ERP directly.
  await failsOn('uc-170', 'The ERP is reached only through a System API', (d) => draw(d, 'prc -> erp'))
  // A limit of 75 and a longer timeout.
  await passes('uc-170', (d) => {
    set(d, 'q', { maxRedelivery: 75 })
    set(d, 'sales', { timeoutMs: 90000 })
  })

  // UC-171
  // One queue for both types.
  await failsOn('uc-171', 'Orders and invoices go to separate queues', (d) => {
    unbox(d, 'qI')
    unbox(d, 'dI')
  })
  // No limit on orders: bad orders circle for ever.
  await failsOn('uc-171', 'Run: Orders with an unknown item', (d) => set(d, 'qO', { maxRedelivery: undefined }))
  // A limit of 10 on invoices: they go to the DLQ during the finance outage.
  await failsOn('uc-171', 'Run: The finance system is down for an hour', (d) => set(d, 'qI', { maxRedelivery: 10 }))
  // Limits of 90 on both.
  await passes('uc-171', (d) => {
    set(d, 'qO', { maxRedelivery: 90 })
    set(d, 'qI', { maxRedelivery: 90 })
  })

  // UC-172
  // The default timeout: year end uploads fail.
  await failsOn('uc-172', 'Run: Year end files', (d) => set(d, 'job', { timeoutMs: undefined }))
  // A limit of 30: sends go to the DLQ during the maintenance window.
  await failsOn('uc-172', 'Run: The provider\'s Sunday maintenance', (d) => set(d, 'q', { maxRedelivery: 30 }))
  // The Process API uploads while payroll waits.
  await failsOn('uc-172', 'Payroll never waits on a provider\'s SFTP server', (d) => draw(d, 'prc -> sftp'))
  // A limit of 200 and a two minute timeout.
  await passes('uc-172', (d) => {
    set(d, 'q', { maxRedelivery: 200 })
    set(d, 'job', { timeoutMs: 120000 })
  })

  // UC-173
  // Greystone's sender also uploads to Pelham.
  await failsOn('uc-173', 'Each sender job uploads to one retailer only', (d) => draw(d, 'jG -> sP'))
  // A limit of 5: Greystone's notices go to the DLQ while its server hangs.
  await failsOn('uc-173', 'Run: Greystone\'s server hangs', (d) => set(d, 'qG', { maxRedelivery: 5 }))
  // The smallest Process API cannot take both retailers.
  await failsOn('uc-173', 'Run: A busy afternoon', (d) => set(d, 'prc', { vCores: undefined }))
  // Limits of 90 and a bigger Process API.
  await passes('uc-173', (d) => {
    set(d, 'qG', { maxRedelivery: 90 })
    set(d, 'qP', { maxRedelivery: 90 })
    set(d, 'prc', { vCores: '1' })
  })

  // UC-174
  // One replica: a zone outage at closing fails the tills.
  await failsOn('uc-174', 'Run: A zone fails at closing time', (d) => set(d, 'exp', { replicas: 1 }))
  // The smallest writer never catches up.
  await failsOn('uc-174', 'Run: Closing time', (d) => set(d, 'wr', { vCores: undefined }))
  // The Experience API writes to the SFTP server while tills wait.
  await failsOn('uc-174', 'Tills never wait on the SFTP server', (d) => draw(d, 'exp -> sftp'))
  // A limit of 10: sales go to the DLQ during SFTP maintenance.
  await failsOn('uc-174', 'Run: SFTP server maintenance', (d) => set(d, 'qS', { maxRedelivery: 10 }))
  // Three replicas, and other limits.
  await passes('uc-174', (d) => {
    set(d, 'exp', { replicas: 3 })
    set(d, 'qS', { maxRedelivery: 120 })
    set(d, 'qA', { maxRedelivery: 75 })
  })
}
