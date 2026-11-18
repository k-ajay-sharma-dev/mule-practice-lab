// Wrong and other correct diagrams for use cases batch N (uc-199 to uc-210): batch jobs and large files. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, draw, swap, unbox, rename, set }) => {
  // UC-199
  // The job keeps the default timeout: MERGEs during the index rebuild fail.
  await failsOn('uc-199', 'Run: The weekly index rebuild', (d) => set(d, 'job', { timeoutMs: undefined }))
  // The System API keeps the default timeout: the same rebuild fails one step lower.
  await failsOn('uc-199', 'Run: The weekly index rebuild', (d) => set(d, 'sys', { timeoutMs: undefined }))
  // No retries in the System API: deadlock victims fail their records.
  await failsOn('uc-199', 'Run: Deadlocks with the stock job', (d) => set(d, 'sys', { retries: undefined }))
  // The job writes SQL Server itself.
  await failsOn('uc-199', 'SQL Server is reached only through a System API', (d) => draw(d, 'job -> sql'))
  // The job does not read the SFTP server.
  await failsOn('uc-199', 'The batch job reads the SFTP server', (d) => cut(d, 'job -> sftp'))
  // The job fires its writes and does not wait.
  await failsOn('uc-199', 'The job waits for each of its calls', (d) => swap(d, 'job -> sys'))
  // Longer timeouts, three retries and other names.
  await passes('uc-199', (d) => {
    set(d, 'job', { timeoutMs: 90000 })
    set(d, 'sys', { timeoutMs: 90000, retries: 3 })
    rename(d, 'sftp', 'Store files SFTP')
  })

  // UC-200
  // No limit: a group with an unknown store circles for ever.
  await failsOn('uc-200', 'Run: A group that never loads', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // A limit of 10: good groups go to the DLQ during patching.
  await failsOn('uc-200', 'Run: SQL Server patching', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No DLQ.
  await failsOn('uc-200', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // The job also calls the System API and waits.
  await failsOn('uc-200', 'The job never waits on SQL Server', (d) => draw(d, 'job -> sys'))
  // The Process API writes SQL Server directly.
  await failsOn('uc-200', 'SQL Server is reached only through a System API', (d) => draw(d, 'prc -> sql'))
  // A limit of 80.
  await passes('uc-200', (d) => set(d, 'q', { maxRedelivery: 80 }))

  // UC-201
  // The loader keeps the default timeout: month end blobs fail.
  await failsOn('uc-201', 'Run: Month end blobs', (d) => set(d, 'job', { timeoutMs: undefined }))
  // One replica of the loader: a zone outage stops it.
  await failsOn('uc-201', 'Run: A zone fails during the night', (d) => set(d, 'job', { replicas: undefined }))
  // One replica of the System API: the loader has nothing to write to.
  await failsOn('uc-201', 'Run: A zone fails during the night', (d) => set(d, 'sys', { replicas: undefined }))
  // The loader does not read the blob store.
  await failsOn('uc-201', 'The loader reads Azure Blob Storage', (d) => cut(d, 'job -> blob'))
  // The loader writes SQL Server itself.
  await failsOn('uc-201', 'SQL Server is reached only through a System API', (d) => draw(d, 'job -> sql'))
  // Three replicas and a longer timeout.
  await passes('uc-201', (d) => {
    set(d, 'job', { replicas: 3, timeoutMs: 60000 })
    set(d, 'sys', { replicas: 3 })
  })

  // UC-202
  // The adapter keeps the default timeout: month end bodies fail.
  await failsOn('uc-202', 'Run: Month end bodies', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // No retries in the System API: lock timeouts wait a minute on the queue.
  await failsOn('uc-202', 'Run: Lock timeouts in Oracle', (d) => set(d, 'sys', { retries: undefined }))
  // A limit of 10: good notices go to the DLQ during maintenance.
  await failsOn('uc-202', 'Run: Oracle maintenance', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: a notice for a missing blob circles for ever.
  await failsOn('uc-202', 'Run: A notice that points nowhere', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The adapter does not download the body.
  await failsOn('uc-202', 'The adapter downloads the body from Azure Blob Storage', (d) => cut(d, 'prc -> blob'))
  // The adapter writes Oracle directly.
  await failsOn('uc-202', 'Oracle is reached only through a System API', (d) => draw(d, 'prc -> ora'))
  // A longer timeout, three retries and a limit of 80.
  await passes('uc-202', (d) => {
    set(d, 'prc', { timeoutMs: 90000 })
    set(d, 'sys', { retries: 3 })
    set(d, 'q', { maxRedelivery: 80 })
  })

  // UC-203
  // No retries: lock timeouts during the replay wait on the queue.
  await failsOn('uc-203', 'Run: Lock timeouts during the replay', (d) => set(d, 'sys', { retries: undefined }))
  // A limit of 10: good messages go to the DLQ while Oracle restarts.
  await failsOn('uc-203', 'Run: Oracle restarts mid replay', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: a message that can never load circles for ever.
  await failsOn('uc-203', 'Run: A message that can never load', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The restart job calls the System API itself.
  await failsOn('uc-203', 'The restart job never writes Oracle or its API itself', (d) => draw(d, 'restart -> sys'))
  // The replays skip the queue.
  await failsOn('uc-203', 'Replays go through the same queue', (d) => cut(d, 'restart ~> q'))
  // No DLQ.
  await failsOn('uc-203', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // Three retries and a limit of 80.
  await passes('uc-203', (d) => {
    set(d, 'sys', { retries: 3 })
    set(d, 'q', { maxRedelivery: 80 })
  })

  // UC-204
  // The load job keeps the default timeout: slow SFTP reads fail.
  await failsOn('uc-204', 'Run: Slow reads on the SFTP server', (d) => set(d, 'load', { timeoutMs: undefined }))
  // No retries in the System API: the report fails on deadlocks.
  await failsOn('uc-204', 'Run: Deadlocks with the stock job', (d) => set(d, 'sys', { retries: undefined }))
  // A limit of 10: good groups go to the DLQ during patching.
  await failsOn('uc-204', 'Run: SQL Server patching', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: a group with an unknown store circles for ever.
  await failsOn('uc-204', 'Run: A group that never loads', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // One replica of each box that answers: a zone outage stops the night.
  await failsOn('uc-204', 'Run: A zone fails during the night', (d) => set(d, 'load', { replicas: undefined }))
  await failsOn('uc-204', 'Run: A zone fails during the night', (d) => set(d, 'sys', { replicas: undefined }))
  await failsOn('uc-204', 'Run: A zone fails during the night', (d) => set(d, 'rep', { replicas: undefined }))
  // The report job reads SQL Server directly.
  await failsOn('uc-204', 'SQL Server is reached only through a System API', (d) => draw(d, 'rep -> sql'))
  // The load job calls the System API and waits.
  await failsOn('uc-204', 'The load job never waits on SQL Server', (d) => draw(d, 'load -> sys'))
  // The report job does not send the email.
  await failsOn('uc-204', 'The report job sends the email', (d) => cut(d, 'rep -> mail'))
  // Three replicas, a longer timeout, three retries and a limit of 80.
  await passes('uc-204', (d) => {
    set(d, 'load', { replicas: 3, timeoutMs: 90000 })
    set(d, 'sys', { replicas: 3, retries: 3 })
    set(d, 'rep', { replicas: 3 })
    set(d, 'q', { maxRedelivery: 80 })
  })

  // UC-205
  // The default ten second timeout: every two minute upload fails.
  await failsOn('uc-205', 'Run: A weekly history', (d) => set(d, 'job', { timeoutMs: undefined }))
  // A timeout of one minute is still below the upload.
  await failsOn('uc-205', 'Run: A weekly history', (d) => set(d, 'job', { timeoutMs: 60000 }))
  // No retries: refused logins lose parts.
  await failsOn('uc-205', 'Run: Refused logins', (d) => set(d, 'job', { retries: undefined }))
  // The relay does not read the landing server.
  await failsOn('uc-205', 'The relay job reads the landing server', (d) => cut(d, 'job -> land'))
  // The landing server pushes to the platform itself.
  await failsOn('uc-205', 'Only the relay job talks to the planning platform\'s server', (d) => draw(d, 'land -> plan'))
  // The relay fires the upload and does not wait for it.
  await failsOn('uc-205', 'The relay waits for both of its calls', (d) => swap(d, 'job -> plan'))
  // A ten minute timeout and three retries.
  await passes('uc-205', (d) => set(d, 'job', { timeoutMs: 600000, retries: 3 }))

  // UC-206
  // The loader keeps the default timeout: season start catalogues fail and pile up.
  await failsOn('uc-206', 'Run: Full catalogues at season start', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // No limit: a notice for an unfinished upload circles for ever.
  await failsOn('uc-206', 'Run: An upload that never finished', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The Experience API loads the catalogue itself and waits.
  await failsOn('uc-206', 'The Experience API queues the work instead of waiting for it', (d) => draw(d, 'exp -> sys'))
  // Partners post the file to the API instead of Blob Storage.
  await failsOn('uc-206', 'Partners upload the file to Azure Blob Storage', (d) => cut(d, 'partner -> blob'))
  // The loader does not download the blob.
  await failsOn('uc-206', 'The loader downloads the blob', (d) => cut(d, 'prc -> blob'))
  // No DLQ.
  await failsOn('uc-206', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A longer timeout and a limit of 10.
  await passes('uc-206', (d) => {
    set(d, 'prc', { timeoutMs: 90000 })
    set(d, 'q', { maxRedelivery: 10 })
  })

  // UC-207
  // The default timeout: year end uploads fail.
  await failsOn('uc-207', 'Run: Year end parts', (d) => set(d, 'job', { timeoutMs: undefined }))
  // No retries: throttled uploads are lost.
  await failsOn('uc-207', 'Run: The storage account throttles', (d) => set(d, 'job', { retries: undefined }))
  // One replica of the job, or of the System API: a zone outage stops the export.
  await failsOn('uc-207', 'Run: A zone fails during the export', (d) => set(d, 'job', { replicas: undefined }))
  await failsOn('uc-207', 'Run: A zone fails during the export', (d) => set(d, 'sys', { replicas: undefined }))
  // The job reads SQL Server directly.
  await failsOn('uc-207', 'SQL Server is reached only through a System API', (d) => draw(d, 'job -> sql'))
  // The job does not upload to the container.
  await failsOn('uc-207', 'The export job uploads to Azure Blob Storage', (d) => cut(d, 'job -> blob'))
  // Three replicas, a longer timeout and three retries.
  await passes('uc-207', (d) => {
    set(d, 'job', { replicas: 3, timeoutMs: 180000, retries: 3 })
    set(d, 'sys', { replicas: 3 })
  })

  // UC-208
  // The loader or the System API keeps the default timeout: MERGEs during the rebuild fail.
  await failsOn('uc-208', 'Run: The weekly index rebuild', (d) => set(d, 'prc', { timeoutMs: undefined }))
  await failsOn('uc-208', 'Run: The weekly index rebuild', (d) => set(d, 'sys', { timeoutMs: undefined }))
  // No retries: deadlock victims wait a minute on the queue.
  await failsOn('uc-208', 'Run: Deadlocks with the buying screens', (d) => set(d, 'sys', { retries: undefined }))
  // No limit: a garbled chunk circles for ever.
  await failsOn('uc-208', 'Run: A garbled chunk', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The loader does not read the file store.
  await failsOn('uc-208', 'The loader reads its chunk from the file store', (d) => cut(d, 'prc -> store'))
  // The collector does not land the parts.
  await failsOn('uc-208', 'The collector lands the parts in the file store', (d) => cut(d, 'job -> store'))
  // The loader writes SQL Server directly.
  await failsOn('uc-208', 'SQL Server is reached only through a System API', (d) => draw(d, 'prc -> sql'))
  // Longer timeouts, three retries and a limit of 30.
  await passes('uc-208', (d) => {
    set(d, 'prc', { timeoutMs: 90000 })
    set(d, 'sys', { timeoutMs: 90000, retries: 3 })
    set(d, 'q', { maxRedelivery: 30 })
  })

  // UC-209
  // Either feed keeps the default timeout: month end downloads fail and pile up.
  await failsOn('uc-209', 'Run: Slow downloads at month end', (d) => set(d, 'pprc', { timeoutMs: undefined }))
  await failsOn('uc-209', 'Run: Slow downloads at month end', (d) => set(d, 'fprc', { timeoutMs: undefined }))
  // A finance limit of 10: good notices go to the DLQ during warehouse maintenance.
  await failsOn('uc-209', 'Run: Warehouse maintenance', (d) => set(d, 'fq', { maxRedelivery: 10 }))
  // No limit on either queue: a notice for a missing part circles for ever.
  await failsOn('uc-209', 'Run: A part that never arrives', (d) => set(d, 'pq', { maxRedelivery: undefined }))
  await failsOn('uc-209', 'Run: A part that never arrives', (d) => set(d, 'fq', { maxRedelivery: undefined }))
  // The finance queue has no DLQ.
  await failsOn('uc-209', 'Each queue has a dead-letter queue', (d) => unbox(d, 'fdlq'))
  // The job loads the warehouse itself.
  await failsOn('uc-209', 'The extract job never waits on the warehouse', (d) => draw(d, 'job -> dw'))
  // The finance feed gets the whole file some other way.
  await failsOn('uc-209', 'Both feeds download the part from Blob Storage', (d) => cut(d, 'fprc -> blob'))
  // Longer timeouts and other limits.
  await passes('uc-209', (d) => {
    set(d, 'pprc', { timeoutMs: 90000 })
    set(d, 'fprc', { timeoutMs: 90000 })
    set(d, 'pq', { maxRedelivery: 20 })
    set(d, 'fq', { maxRedelivery: 100 })
  })

  // UC-210
  // The relay keeps the default timeout: slow uploads fail.
  await failsOn('uc-210', 'Run: Slow uploads after a store refit', (d) => set(d, 'relay', { timeoutMs: undefined }))
  // The loader keeps the default timeout: slow downloads fail and pile up.
  await failsOn('uc-210', 'Run: Slow uploads after a store refit', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // No retries: the export fails on deadlocks.
  await failsOn('uc-210', 'Run: Deadlocks with the replenishment job', (d) => set(d, 'sys', { retries: undefined }))
  // A limit of 10: good files go to the DLQ during patching.
  await failsOn('uc-210', 'Run: SQL Server patching', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: a garbled file circles for ever.
  await failsOn('uc-210', 'Run: A garbled store file', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // One replica of each box that answers.
  await failsOn('uc-210', 'Run: A zone fails during the night', (d) => set(d, 'relay', { replicas: undefined }))
  await failsOn('uc-210', 'Run: A zone fails during the night', (d) => set(d, 'sys', { replicas: undefined }))
  await failsOn('uc-210', 'Run: A zone fails during the night', (d) => set(d, 'exp', { replicas: undefined }))
  // The relay calls the System API and waits.
  await failsOn('uc-210', 'The relay job never waits on SQL Server', (d) => draw(d, 'relay -> sys'))
  // The export job reads SQL Server directly.
  await failsOn('uc-210', 'SQL Server is reached only through a System API', (d) => draw(d, 'exp -> sql'))
  // The loader does not download the file.
  await failsOn('uc-210', 'The loader downloads the file from Blob Storage', (d) => cut(d, 'prc -> blob'))
  // Three replicas, longer timeouts, three retries and a limit of 80.
  await passes('uc-210', (d) => {
    set(d, 'relay', { replicas: 3, timeoutMs: 90000 })
    set(d, 'prc', { timeoutMs: 90000 })
    set(d, 'sys', { replicas: 3, retries: 3 })
    set(d, 'exp', { replicas: 3 })
    set(d, 'q', { maxRedelivery: 80 })
  })
}
