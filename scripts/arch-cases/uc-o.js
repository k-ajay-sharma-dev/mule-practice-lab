// Wrong and other correct diagrams for use cases batch O (uc-211 to uc-220): the focus topics, second set. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, draw, swap, unbox, rename, set }) => {
  // UC-211
  // A queue that is not persistent: the broker restart loses the waiting ACKs.
  await failsOn('uc-211', 'Run: The broker restarts with ACKs waiting', (d) => set(d, 'q', { persistent: 'no' }))
  // The relay keeps the default timeout: ACKs pile up while the portal is slow.
  await failsOn('uc-211', 'Run: A slow portal', (d) => set(d, 'relay', { timeoutMs: undefined }))
  // A limit of 10: good ACKs go to the DLQ during the upgrade.
  await failsOn('uc-211', "Run: The portal's monthly upgrade", (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: an ACK the portal refuses circles for ever.
  await failsOn('uc-211', 'Run: An ACK the portal always refuses', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The adapter also posts to the portal and waits.
  await failsOn('uc-211', 'The adapter never waits on the portal', (d) => draw(d, 'prc -> portal'))
  // No DLQ.
  await failsOn('uc-211', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A longer timeout, a limit of 120 and other names.
  await passes('uc-211', (d) => {
    set(d, 'relay', { timeoutMs: 45000 })
    set(d, 'q', { maxRedelivery: 120 })
    rename(d, 'portal', 'Supplier portal ACK endpoint')
  })

  // UC-212
  // The box spreads reads over both regions: half of them hit the secondary on a normal day.
  await failsOn('uc-212', 'Run: A normal day', (d) => set(d, 'lb', { mode: 'spread' }))
  // One replica of the System API: a zone outage stops the reads.
  await failsOn('uc-212', 'Run: A zone fails at the morning peak', (d) => set(d, 'sys', { replicas: undefined }))
  // The System API keeps the default timeout: large notes fail.
  await failsOn('uc-212', 'Run: Large notes on a slow morning', (d) => set(d, 'sys', { timeoutMs: undefined }))
  // The Experience API keeps the default size: it runs out of threads on a slow morning.
  await failsOn('uc-212', 'Run: Large notes on a slow morning', (d) => set(d, 'exp', { vCores: undefined }))
  // The System API reads the primary directly.
  await failsOn('uc-212', 'Both endpoints are reached only through the failover box', (d) => draw(d, 'sys -> blob1'))
  // No line to the secondary.
  await failsOn('uc-212', 'The failover box has a line to the primary and to the secondary', (d) => cut(d, 'lb -> blob2'))
  // Three replicas and longer timeouts.
  await passes('uc-212', (d) => {
    set(d, 'exp', { replicas: 3, timeoutMs: 25000 })
    set(d, 'sys', { replicas: 3, timeoutMs: 20000 })
  })

  // UC-213
  // No limit: a file the share refuses circles for ever.
  await failsOn('uc-213', 'Run: A file the share refuses', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The Experience API writes the share writer and waits.
  await failsOn('uc-213', 'The handhelds never wait on the share writer', (d) => draw(d, 'exp -> sys'))
  // The Experience API writes the share itself.
  await failsOn('uc-213', 'Only the share writer writes to the file share', (d) => draw(d, 'exp -> afs'))
  // No DLQ.
  await failsOn('uc-213', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A limit of 80 and other names.
  await passes('uc-213', (d) => {
    set(d, 'q', { maxRedelivery: 80 })
    rename(d, 'sys', 'sys-count-share-writer')
  })

  // UC-214
  // The sender keeps the default timeout: files pile up while the hub is slow.
  await failsOn('uc-214', 'Run: A slow hub', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // A limit of 5: good files go to the DLQ while the hub restarts.
  await failsOn('uc-214', 'Run: The hub restarts', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No limit: a file for a missing folder circles for ever.
  await failsOn('uc-214', 'Run: A store folder that is gone', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The release job uploads to the hub itself.
  await failsOn('uc-214', 'The release job never waits on the SFTP server', (d) => draw(d, 'job -> hub'))
  // No DLQ.
  await failsOn('uc-214', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A longer timeout and a limit of 60.
  await passes('uc-214', (d) => {
    set(d, 'prc', { timeoutMs: 45000 })
    set(d, 'q', { maxRedelivery: 60 })
  })

  // UC-215
  // The exporter keeps the default timeout: month end writes fail.
  await failsOn('uc-215', 'Run: Month end on the FTP server', (d) => set(d, 'exp', { timeoutMs: undefined }))
  // The poller keeps the default timeout: month end reads fail.
  await failsOn('uc-215', 'Run: Month end on the FTP server', (d) => set(d, 'poll', { timeoutMs: undefined }))
  // No retries in the ERP System API: lock timeouts wait a minute on the queue.
  await failsOn('uc-215', 'Run: Lock timeouts in the ERP', (d) => set(d, 'serp', { retries: undefined }))
  // A limit of 10: good ACKs go to the DLQ during ERP maintenance.
  await failsOn('uc-215', 'Run: ERP maintenance', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: an ACK for an unknown file circles for ever.
  await failsOn('uc-215', 'Run: An ACK for a file the ERP never sent', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The Process API writes the ERP directly.
  await failsOn('uc-215', 'The ERP is reached only through a System API', (d) => draw(d, 'prc -> erp'))
  // The poller does not read the FTP server.
  await failsOn('uc-215', 'The poller reads the FTP server', (d) => cut(d, 'poll -> ftp'))
  // Longer timeouts, three retries and a limit of 120.
  await passes('uc-215', (d) => {
    set(d, 'exp', { timeoutMs: 90000 })
    set(d, 'poll', { timeoutMs: 90000 })
    set(d, 'serp', { retries: 3 })
    set(d, 'q', { maxRedelivery: 120 })
  })

  // UC-216
  // No rate limit for the platform: forty threads take the tills' share of SQL Server.
  await failsOn('uc-216', 'Run: The platform pulls with forty threads', (d) => set(d, 'expP', { rateLimit: undefined }))
  // No retries in the System API: deadlock victims fail.
  await failsOn('uc-216', 'Run: Deadlocks at closing time', (d) => set(d, 'sys', { retries: undefined }))
  // One replica of the tills' API: a zone outage stops the tills.
  await failsOn('uc-216', 'Run: A zone fails in the evening', (d) => set(d, 'expT', { replicas: undefined }))
  // The System API at the default size: it is over capacity every evening.
  await failsOn('uc-216', 'Run: A normal evening', (d) => set(d, 'sys', { vCores: undefined }))
  // The platform calls the tills' API.
  await failsOn('uc-216', 'The platform never reaches the tills\' Experience API', (d) => draw(d, 'plat -> expT'))
  // The platform's API reads SQL Server directly.
  await failsOn('uc-216', 'SQL Server is reached only through the System API', (d) => draw(d, 'expP -> sql'))
  // Three replicas of the tills' API and three retries.
  await passes('uc-216', (d) => {
    set(d, 'expT', { replicas: 3 })
    set(d, 'sys', { retries: 3 })
  })

  // UC-217
  // No rate limit on the replayer: Oracle gets more than the DBA team allows.
  await failsOn('uc-217', 'Run: A replay while notices keep coming', (d) => set(d, 'prcR', { rateLimit: undefined }))
  // A limit of 40 on the replayer: still too much next to the live notices.
  await failsOn('uc-217', 'Run: A replay while notices keep coming', (d) => set(d, 'prcR', { rateLimit: 40 }))
  // The restart job at the default size: it cannot queue the replays.
  await failsOn('uc-217', 'Run: The whole replay goes through', (d) => set(d, 'restart', { vCores: undefined }))
  // The adapter keeps the default timeout: month end bodies pile up.
  await failsOn('uc-217', 'Run: Month end bodies', (d) => set(d, 'prcL', { timeoutMs: undefined }))
  // No retries in the System API: lock timeouts wait a minute on the queue.
  await failsOn('uc-217', 'Run: Lock timeouts in Oracle', (d) => set(d, 'sys', { retries: undefined }))
  // One replica of the System API: a zone outage stops the writes.
  await failsOn('uc-217', 'Run: A zone fails during the replay', (d) => set(d, 'sys', { replicas: undefined }))
  // A limit of 10 on the live queue: good notices go to the DLQ during maintenance.
  await failsOn('uc-217', 'Run: Oracle maintenance', (d) => set(d, 'qL', { maxRedelivery: 10 }))
  // No limit on the replay queue: replays of purged blobs circle for ever.
  await failsOn('uc-217', 'Run: Replays that point nowhere', (d) => set(d, 'qR', { maxRedelivery: undefined }))
  // The restart job puts replays on the live queue.
  await failsOn('uc-217', 'Replays never go through the live queue', (d) => draw(d, 'restart ~> qL'))
  // The replay queue has no DLQ.
  await failsOn('uc-217', 'Every queue has a dead-letter queue', (d) => unbox(d, 'dR'))
  // A rate limit of 20, three replicas and longer timeouts.
  await passes('uc-217', (d) => {
    set(d, 'prcR', { rateLimit: 20, timeoutMs: 90000 })
    set(d, 'prcL', { replicas: 3, timeoutMs: 90000 })
  })

  // UC-218
  // The webhook API at the default size: the campaign burst gets 503s.
  await failsOn('uc-218', 'Run: A campaign to an old list', (d) => set(d, 'exp', { vCores: undefined }))
  // A limit of 10: good events go to the DLQ during patching.
  await failsOn('uc-218', 'Run: The contacts database is patched', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: an event for an unknown address circles for ever.
  await failsOn('uc-218', 'Run: An event for an address that is not a contact', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The webhook API updates the contact before it answers.
  await failsOn('uc-218', 'The provider never waits on SQL Server', (d) => draw(d, 'exp -> sys'))
  // The handler writes SQL Server directly.
  await failsOn('uc-218', 'SQL Server is reached only through a System API', (d) => draw(d, 'prc -> sql'))
  // Three replicas of 1 vCore and a limit of 90.
  await passes('uc-218', (d) => {
    set(d, 'exp', { replicas: 3, vCores: '1' })
    set(d, 'q', { maxRedelivery: 90 })
  })

  // UC-219
  // The job at the default size: it cannot publish 100 changes a second.
  await failsOn('uc-219', 'Run: The nightly item batch', (d) => set(d, 'job', { vCores: undefined }))
  // The WMS System API keeps the default timeout: slow updates fail and wait.
  await failsOn('uc-219', 'Run: A slow warehouse system', (d) => set(d, 'sW', { timeoutMs: undefined }))
  // A limit of 10: the warehouse's copies go to the DLQ during its upgrade.
  await failsOn('uc-219', 'Run: The data warehouse is down for an hour', (d) => set(d, 't', { maxRedelivery: 10 }))
  // No limit: a change nobody can take circles for ever.
  await failsOn('uc-219', 'Run: An item nobody can take', (d) => set(d, 't', { maxRedelivery: undefined }))
  // The job also calls the shop and waits.
  await failsOn('uc-219', 'The batch job never waits on the three systems', (d) => draw(d, 'job -> shop'))
  // The WMS Process API calls the WMS directly.
  await failsOn('uc-219', 'The WMS is reached only through a System API', (d) => draw(d, 'pW -> wms'))
  // 1 vCore, longer timeouts and a limit of 120.
  await passes('uc-219', (d) => {
    set(d, 'job', { vCores: '1' })
    set(d, 'pW', { timeoutMs: 45000 })
    set(d, 'sW', { timeoutMs: 45000 })
    set(d, 't', { maxRedelivery: 120 })
  })

  // UC-220
  // The splitter keeps the default timeout: reads during the index rebuild fail.
  await failsOn('uc-220', 'Run: A busy sales database', (d) => set(d, 'job', { timeoutMs: undefined }))
  // The uploader keeps the default timeout: uploads on a busy link fail and pile up.
  await failsOn('uc-220', 'Run: Uploads on a busy link', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // No retries in the uploader: dropped sessions wait a minute on the queue.
  await failsOn('uc-220', 'Run: Dropped sessions', (d) => set(d, 'prc', { retries: undefined }))
  // One replica of the sales API: a zone outage stops the splitter.
  await failsOn('uc-220', 'Run: A zone fails mid transfer', (d) => set(d, 'sys', { replicas: undefined }))
  // A limit of 10: good parts go to the DLQ during maintenance.
  await failsOn('uc-220', "Run: The platform's maintenance window", (d) => set(d, 'q', { maxRedelivery: 10 }))
  // The splitter uploads to the SFTP server itself.
  await failsOn('uc-220', 'The splitter never uploads to the SFTP server itself', (d) => draw(d, 'job -> sftp'))
  // The uploader does not read the landed parts.
  await failsOn('uc-220', 'The uploader reads its part from the file store', (d) => cut(d, 'prc -> store'))
  // Three replicas of the uploader, three retries and a limit of 170.
  await passes('uc-220', (d) => {
    set(d, 'prc', { replicas: 3, retries: 3 })
    set(d, 'q', { maxRedelivery: 170 })
  })
}
