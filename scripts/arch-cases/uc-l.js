// Wrong and other correct diagrams for use cases batch L (uc-175 to uc-186): FTP and SQL Server. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, draw, unbox, rename, set }) => {
  // UC-175
  // The default ten second timeout: 18 second uploads fail.
  await failsOn('uc-175', 'Run: A normal night', (d) => set(d, 'job', { timeoutMs: undefined }))
  // No retries: refused logins lose files.
  await failsOn('uc-175', 'Run: The FTP server turns connections away', (d) => set(d, 'job', { retries: undefined }))
  // The job does not read SQL Server.
  await failsOn('uc-175', 'A scheduled job reads SQL Server', (d) => cut(d, 'job -> sql'))
  // SQL Server pushes to the FTP server itself.
  await failsOn('uc-175', 'Only the job talks to the FTP server', (d) => draw(d, 'sql -> ftp'))
  // A longer timeout, three retries, and other names.
  await passes('uc-175', (d) => {
    set(d, 'job', { timeoutMs: 90000, retries: 3 })
    rename(d, 'ftp', 'Planning FTP server')
  })

  // UC-176
  // The collector keeps the default timeout: the monthly full plan fails.
  await failsOn('uc-176', 'Run: The monthly full plan', (d) => set(d, 'job', { timeoutMs: undefined }))
  // A limit of 10: good allocations go to the DLQ during WMS maintenance.
  await failsOn('uc-176', 'Run: WMS maintenance', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: an allocation for a closed store circles for ever.
  await failsOn('uc-176', 'Run: An allocation for a closed store', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // No DLQ.
  await failsOn('uc-176', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // The Process API calls the WMS directly.
  await failsOn('uc-176', 'The WMS is reached only through a System API', (d) => draw(d, 'prc -> wms'))
  // A longer timeout and a limit of 100.
  await passes('uc-176', (d) => {
    set(d, 'job', { timeoutMs: 90000 })
    set(d, 'q', { maxRedelivery: 100 })
  })

  // UC-177
  // The default timeout: Monday's large files fail.
  await failsOn('uc-177', 'Run: Monday\'s weekend files', (d) => set(d, 'job', { timeoutMs: undefined }))
  // One replica: a zone outage stops the relay.
  await failsOn('uc-177', 'Run: A zone fails during the night', (d) => set(d, 'job', { replicas: undefined }))
  // The tills upload to the planning platform themselves.
  await failsOn('uc-177', 'The tills never reach the planning platform\'s server', (d) => draw(d, 'pos -> plan'))
  // The relay does not read the hub.
  await failsOn('uc-177', 'The relay job reads the hub', (d) => cut(d, 'job -> hub'))
  // Three replicas and a longer timeout.
  await passes('uc-177', (d) => set(d, 'job', { replicas: 3, timeoutMs: 60000 }))

  // UC-178
  // No retries in the System API: lock timeouts wait a minute on the queue.
  await failsOn('uc-178', 'Run: The ERP is busy', (d) => set(d, 'sys', { retries: undefined }))
  // A limit of 10: good lines go to the DLQ during patching.
  await failsOn('uc-178', 'Run: ERP patching', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: a line for a blocked supplier circles for ever.
  await failsOn('uc-178', 'Run: A line for a blocked supplier', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The collector calls the ERP API and waits.
  await failsOn('uc-178', 'The collector never calls the ERP and waits for it', (d) => draw(d, 'job -> sys'))
  // The Process API calls the ERP directly.
  await failsOn('uc-178', 'The ERP is reached only through a System API', (d) => draw(d, 'prc -> erp'))
  // Three retries and a limit of 120.
  await passes('uc-178', (d) => {
    set(d, 'sys', { retries: 3 })
    set(d, 'q', { maxRedelivery: 120 })
  })

  // UC-179
  // The sender keeps the default timeout: year end uploads fail.
  await failsOn('uc-179', 'Run: Year end files', (d) => set(d, 'snd', { timeoutMs: undefined }))
  // A limit of 10: files go to the DLQ during the maintenance window.
  await failsOn('uc-179', 'Run: The nightly maintenance window', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: a refused file circles for ever.
  await failsOn('uc-179', 'Run: A file the server refuses', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The export writes to the FTP server itself.
  await failsOn('uc-179', 'The export job never talks to the FTP server', (d) => draw(d, 'job -> ftp'))
  // A longer timeout and a limit of 80.
  await passes('uc-179', (d) => {
    set(d, 'snd', { timeoutMs: 90000 })
    set(d, 'q', { maxRedelivery: 80 })
  })

  // UC-180
  // The outbound job keeps the default timeout: month end files fail.
  await failsOn('uc-180', 'Run: Month end files', (d) => set(d, 'out', { timeoutMs: undefined }))
  // The collector has no retries: refused logins lose plan files.
  await failsOn('uc-180', 'Run: Busy logins on the FTP server', (d) => set(d, 'col', { retries: undefined }))
  // One replica of the outbound job: a zone outage stops the night run.
  await failsOn('uc-180', 'Run: A zone fails during the night run', (d) => set(d, 'out', { replicas: undefined }))
  // A limit of 20: plan lines go to the DLQ during WMS maintenance.
  await failsOn('uc-180', 'Run: WMS maintenance', (d) => set(d, 'q', { maxRedelivery: 20 }))
  // The outbound job reads SQL Server directly.
  await failsOn('uc-180', 'SQL Server is reached only through a System API', (d) => draw(d, 'out -> sql'))
  // More room everywhere.
  await passes('uc-180', (d) => {
    for (const id of ['out', 'col']) set(d, id, { timeoutMs: 90000, retries: 3 })
    set(d, 'q', { maxRedelivery: 75 })
  })

  // UC-181
  // The default timeout: 12 second queries fail.
  await failsOn('uc-181', 'Run: The nightly extract', (d) => set(d, 'job', { timeoutMs: undefined }))
  // No retries: a busy replica loses files.
  await failsOn('uc-181', 'Run: The replica is catching up', (d) => set(d, 'job', { retries: undefined }))
  // The job reads the primary.
  await failsOn('uc-181', 'The extract job never reads the primary', (d) => draw(d, 'job -> prim'))
  // A longer timeout and three retries.
  await passes('uc-181', (d) => set(d, 'job', { timeoutMs: 45000, retries: 3 }))

  // UC-182
  // No retries: lock timeouts wait a minute on the queue.
  await failsOn('uc-182', 'Run: Lock timeouts after the failover', (d) => set(d, 'sys', { retries: undefined }))
  // No limit: a request for a closed store circles for ever.
  await failsOn('uc-182', 'Run: A transfer for a closed store', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The Experience API writes SQL Server while the app waits.
  await failsOn('uc-182', 'SQL Server is reached only through a System API', (d) => draw(d, 'exp -> sql'))
  // A sync line into the queue.
  await failsOn('uc-182', 'Every line into or out of the queue is async', (d) => {
    cut(d, 'exp ~> q')
    draw(d, 'exp -> q')
  })
  // Three retries and a limit of 10.
  await passes('uc-182', (d) => {
    set(d, 'sys', { retries: 3 })
    set(d, 'q', { maxRedelivery: 10 })
  })

  // UC-183
  // A limit of 30: good allocations go to the DLQ during WMS maintenance.
  await failsOn('uc-183', 'Run: WMS maintenance', (d) => set(d, 'q', { maxRedelivery: 30 }))
  // No limit: an allocation for an unknown location circles for ever.
  await failsOn('uc-183', 'Run: An allocation for an unknown location', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The allocations API reads SQL Server itself.
  await failsOn('uc-183', 'SQL Server is reached only through a System API', (d) => draw(d, 'alloc -> sql'))
  // The Process API calls the WMS directly.
  await failsOn('uc-183', 'The WMS is reached only through a System API', (d) => draw(d, 'prc -> wms'))
  // A limit of 100 and other names.
  await passes('uc-183', (d) => {
    set(d, 'q', { maxRedelivery: 100 })
    rename(d, 'relay', 'allocation-outbox-relay')
  })

  // UC-184
  // No retries: deadlock victims wait a minute on the queue.
  await failsOn('uc-184', 'Run: Deadlocks with the stock update', (d) => set(d, 'sys', { retries: undefined }))
  // The System API keeps the default timeout: writes fail during the rebuild.
  await failsOn('uc-184', 'Run: The weekly index rebuild', (d) => set(d, 'sys', { timeoutMs: undefined }))
  // The Process API keeps the default timeout.
  await failsOn('uc-184', 'Run: The weekly index rebuild', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // No limit: a line for a missing item circles for ever.
  await failsOn('uc-184', 'Run: A line for an item that is not set up', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The collector writes SQL Server itself and waits.
  await failsOn('uc-184', 'The collector never writes SQL Server and waits for it', (d) => draw(d, 'job -> sys'))
  // Longer timeouts, three retries and a limit of 5.
  await passes('uc-184', (d) => {
    set(d, 'sys', { timeoutMs: 90000, retries: 3 })
    set(d, 'prc', { timeoutMs: 90000 })
    set(d, 'q', { maxRedelivery: 5 })
  })

  // UC-185
  // The smallest size: the 02:00 peak is refused.
  await failsOn('uc-185', 'Run: The 02:00 peak', (d) => {
    set(d, 'exp', { vCores: undefined })
    set(d, 'sys', { vCores: undefined })
  })
  // One replica of 1 vCore each: a zone outage takes the APIs away.
  await failsOn('uc-185', 'Run: A zone fails at 02:00', (d) => {
    set(d, 'exp', { replicas: undefined, vCores: '1' })
    set(d, 'sys', { replicas: undefined, vCores: '1' })
  })
  // Two replicas of 1 vCore each: over the budget.
  await failsOn('uc-185', 'Run: The 02:00 peak', (d) => {
    set(d, 'exp', { vCores: '1' })
    set(d, 'sys', { vCores: '1' })
  })
  // The planning platform reads SQL Server directly.
  await failsOn('uc-185', 'SQL Server is reached only through a System API', (d) => draw(d, 'plat -> sql'))
  // Four replicas of 0.2 vCore on the Experience API: still under budget and survives a zone.
  await passes('uc-185', (d) => set(d, 'exp', { replicas: 4, vCores: '0.2' }))

  // UC-186
  // The read API keeps the default timeout: 12 second queries fail.
  await failsOn('uc-186', 'Run: A normal night', (d) => set(d, 'sysR', { timeoutMs: undefined }))
  // The outbound job keeps the default timeout.
  await failsOn('uc-186', 'Run: A normal night', (d) => set(d, 'out', { timeoutMs: undefined }))
  // No retries on the read API: a busy replica loses files.
  await failsOn('uc-186', 'Run: The replica is catching up', (d) => set(d, 'sysR', { retries: undefined }))
  // No retries on the data API: deadlock victims wait on the queue.
  await failsOn('uc-186', 'Run: Deadlocks on the primary', (d) => set(d, 'sysD', { retries: undefined }))
  // A limit of 20: good lines go to the DLQ during patching.
  await failsOn('uc-186', 'Run: Patching the primary', (d) => set(d, 'q', { maxRedelivery: 20 }))
  // No limit: a line for a missing item circles for ever.
  await failsOn('uc-186', 'Run: A plan line for an item that is not set up', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The read API points at the primary.
  await failsOn('uc-186', 'The outbound job never reads the primary', (d) => draw(d, 'sysR -> prim'))
  // The outbound job reads the replica itself.
  await failsOn('uc-186', 'only through System APIs', (d) => draw(d, 'out -> rep'))
  // More room everywhere.
  await passes('uc-186', (d) => {
    set(d, 'sysR', { timeoutMs: 45000, retries: 3 })
    set(d, 'out', { timeoutMs: 90000 })
    set(d, 'sysD', { retries: 3 })
    set(d, 'q', { maxRedelivery: 90 })
  })
}
