// Wrong and other correct designs for batch O (fl-247 to fl-270): batch jobs and large files. See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, step }) => {
  const unwrap = (list, node, branch) => list.splice(list.indexOf(node), 1, ...branch)
  const top = (d) => d.flows[0].steps
  const moveBefore = (list, type, beforeType) => {
    const node = list.splice(list.findIndex((n) => n.type === type), 1)[0]
    list.splice(list.findIndex((n) => n.type === beforeType), 0, node)
  }

  // FL-247
  // The default limit of 0: the first bad row stops the job.
  await failsOn('fl-247', 'Run: A file with one bad row', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 0
  })
  // No On Complete: nobody knows the counts.
  await failsOn('fl-247', 'On Complete logs', (d) => {
    one(d, 'batch-job').onComplete = []
  })
  // No size check: a file still uploading is read.
  await failsOn('fl-247', 'size is stable', (d) => {
    d.flows[0].source.config.timeBetweenSizeCheck = 0
  })
  // A limit of 1,000 and blocks of 200.
  await passes('fl-247', (d) => {
    Object.assign(one(d, 'batch-job').config, { maxFailedRecords: 1000, blockSize: 200 })
  })

  // FL-248
  // The reject step takes every record: good items are rejected too.
  await failsOn('fl-248', 'Run: A clean file', (d) => {
    one(d, 'batch-job').routes[1].config.acceptPolicy = 'ALL'
  })
  // The reject step keeps the default policy, so it never sees a failed record.
  await failsOn('fl-248', 'ONLY_FAILURES writes', (d) => {
    one(d, 'batch-job').routes[1].config.acceptPolicy = 'NO_FAILURES'
  })
  // Max failed records 0: the job stops and the reject step never runs.
  await failsOn('fl-248', 'Run: An item with no cost', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 0
  })
  // Blocks of 500.
  await passes('fl-248', (d) => {
    one(d, 'batch-job').config.blockSize = 500
  })

  // FL-249
  // Two statuses only: a file where nothing loads says COMPLETED_WITH_ERRORS.
  await failsOn('fl-249', 'Run: Nothing loads', (d) => {
    one(d, 'db-update').config.inputParameters = '#[{ jobId: vars.jobId, loaded: payload.successfulRecords, failed: payload.failedRecords, status: if (payload.failedRecords == 0) "COMPLETED" else "COMPLETED_WITH_ERRORS" }]'
  })
  // Max failed records 0: the job stops at E-502.
  await failsOn('fl-249', 'Run: One event has no delivery time', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 0
  })
  // The job row started after the Batch Job: the records have no job ID.
  await failsOn('fl-249', 'started before the Batch Job', (d) => {
    const s = top(d)
    s.push(...s.splice(0, 2))
  })
  // The same three statuses, tested in another order.
  await passes('fl-249', (d) => {
    one(d, 'db-update').config.inputParameters =
      '#[{ jobId: vars.jobId, loaded: payload.successfulRecords, failed: payload.failedRecords, status: if (payload.successfulRecords == 0 and payload.failedRecords > 0) "FAILED" else if (payload.failedRecords > 0) "COMPLETED_WITH_ERRORS" else "COMPLETED" }]'
  })

  // FL-250
  // The lock is taken whether it is free or not.
  await failsOn('fl-250', 'Run: The last run is still going', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE dbo.job_lock SET locked = 1, locked_at = :lockedAt WHERE job_name = :jobName'
  })
  // The lock is released right after the Batch Job step, while the job still runs.
  await failsOn('fl-250', 'On Complete releases', (d) => {
    const b = one(d, 'batch-job')
    const release = b.onComplete.find((n) => n.type === 'db-update')
    b.onComplete = b.onComplete.filter((n) => n !== release)
    all(d, 'choice')[1].otherwise.push(release)
  })
  // No error handler: a failed run keeps the lock.
  await failsOn('fl-250', 'Run: The inbox read fails', (d) => {
    d.flows[0].errorHandlers = []
  })
  // Nothing new and the lock is kept: the next run is skipped for nothing.
  await failsOn('fl-250', 'Run: Nothing new', (d) => {
    all(d, 'choice')[1].routes[0].steps = [step('logger', { level: 'INFO', message: 'Nothing new' })]
  })
  // Every 15 minutes.
  await passes('fl-250', (d) => {
    d.flows[0].source.config.frequency = 15
  })

  // FL-251
  // A plain bulk insert: the known store and SKU fail the group on the key.
  await failsOn('fl-251', 'Run: A snapshot with known and new rows', (d) => {
    const u = one(d, 'db-bulk-update')
    u.type = 'db-bulk-insert'
    u.config.sql = 'INSERT INTO dbo.store_stock (store, sku, on_hand, snapshot_date) VALUES (:store, :sku, :on_hand, :snapshot_date)'
  })
  // Groups of 10.
  await failsOn('fl-251', 'at least 100', (d) => {
    one(d, 'batch-aggregator').config.size = 10
  })
  // Groups and blocks of 1,000.
  await passes('fl-251', (d) => {
    one(d, 'batch-aggregator').config.size = 1000
    one(d, 'batch-job').config.blockSize = 1000
  })

  // FL-252
  // No accept expression: the restart loads lines 1 and 2 again and fails on the key.
  await failsOn('fl-252', 'Run: A restart after a crash', (d) => {
    one(d, 'batch-job').routes[0].config.acceptExpression = ''
  })
  // No transaction: staging keeps the group when the checkpoint update fails.
  await failsOn('fl-252', 'Run: The checkpoint update fails', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The checkpoint is never read.
  await failsOn('fl-252', 'read before the Batch Job', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'db-select')
    one(d, 'set-variable', (x) => x.config.variableName === 'done').config.value = '#[0]'
  })
  // Groups of 1,000.
  await passes('fl-252', (d) => {
    one(d, 'batch-aggregator').config.size = 1000
  })

  // FL-253
  // The ACK published right after the Batch Job step: it cannot know the counts.
  await failsOn('fl-253', 'On Complete publishes', (d) => {
    const b = one(d, 'batch-job')
    top(d).push(...b.onComplete.splice(0))
  })
  // Always LOADED.
  await failsOn('fl-253', 'Run: Oracle refuses the group', (d) => {
    one(d, 'set-payload').config.value = '#[output application/json --- { messageId: vars.messageId, status: "LOADED", loaded: payload.successfulRecords, failed: payload.failedRecords }]'
  })
  // Four consumers and groups of 200.
  await passes('fl-253', (d) => {
    d.flows[0].source.config.numberOfConsumers = 4
    one(d, 'batch-aggregator').config.size = 200
  })

  // FL-254
  // All rejects are counted, last night's too.
  await failsOn('fl-254', 'Run: A clean file', (d) => {
    const sel = one(d, 'db-select', (x) => x.config.sql.includes('invoice_rejects'))
    sel.config.sql = 'SELECT COUNT(*) AS n FROM dbo.invoice_rejects'
    sel.config.inputParameters = ''
  })
  // The batch counts: a rejected line counts as successful.
  await failsOn('fl-254', 'Run: One line with no amount', (d) => {
    one(d, 'db-update').config.inputParameters = '#[{ jobId: vars.jobId, loaded: payload.successfulRecords, rejected: payload.failedRecords, status: if (payload.failedRecords == 0) "COMPLETED" else "COMPLETED_WITH_REJECTS" }]'
  })
  // No transaction on the bulk insert.
  await failsOn('fl-254', 'Run: One line with no amount', (d) => {
    one(d, 'try', (x) => x.config.transactionalAction === 'ALWAYS_BEGIN').config.transactionalAction = 'INDIFFERENT'
  })
  // Groups of 200.
  await passes('fl-254', (d) => {
    one(d, 'batch-aggregator').config.size = 200
  })

  // FL-255
  // No health check: a dead database fails with 500, after nothing useful.
  await failsOn('fl-255', 'Run: The database is down', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'try')
  })
  // No ONLY_FAILURES step: failed republishes stay FAILED, as if never tried.
  await failsOn('fl-255', 'Run: The broker refuses the messages', (d) => {
    const b = one(d, 'batch-job')
    b.routes = b.routes.slice(0, 1)
  })
  // Every failed message is replayed, whatever its type.
  await failsOn('fl-255', 'Run: A replay after the fix', (d) => {
    const sel = one(d, 'db-select', (x) => x.config.sql.includes('message_failures'))
    sel.config.sql = "SELECT message_id, message_type, body FROM dbo.message_failures WHERE status = 'FAILED' ORDER BY message_id"
    sel.config.inputParameters = ''
  })
  // Blocks of 50.
  await passes('fl-255', (d) => {
    one(d, 'batch-job').config.blockSize = 50
  })

  // FL-256
  // No limit: a broken file runs for three hours.
  await failsOn('fl-256', 'Max failed records is a limit', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = -1
  })
  // A limit of 0: one bad row stops a good file.
  await failsOn('fl-256', 'Run: One price is missing', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 0
  })
  // FAILED only when nothing loaded: a mostly broken file passes as COMPLETED_WITH_ERRORS.
  await failsOn('fl-256', 'Run: A broken file', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[payload.successfulRecords == 0]'
  })
  // A broken file stays in the input folder.
  await failsOn('fl-256', 'On Complete moves the file', (d) => {
    const r = one(d, 'choice').routes[0]
    r.steps = r.steps.filter((n) => n.type !== 'sftp-move')
  })
  // A limit of 500.
  await passes('fl-256', (d) => {
    one(d, 'batch-job').config.maxFailedRecords = 500
  })

  // FL-257
  // No duplicate check: the same notice is loaded again.
  await failsOn('fl-257', 'Run: The same notice again', (d) => {
    const c = one(d, 'choice')
    unwrap(top(d), c, c.otherwise)
  })
  // The email holds up On Complete.
  await failsOn('fl-257', 'Async scope', (d) => {
    const b = one(d, 'batch-job')
    const a = b.onComplete.find((n) => n.type === 'async')
    unwrap(b.onComplete, a, a.steps)
  })
  // No cost check: an item with no cost is staged.
  await failsOn('fl-257', 'Run: An item with no cost', (d) => {
    const r = one(d, 'batch-job').routes[0]
    r.steps = r.steps.filter((n) => n.type !== 'validation')
  })
  // No RECEIVED ACK.
  await failsOn('fl-257', 'Run: A new message', (d) => {
    const c = one(d, 'choice')
    c.otherwise.splice(c.otherwise.findIndex((n) => n.type === 'jms-publish'), 1)
  })
  // Groups of 1,000.
  await passes('fl-257', (d) => {
    one(d, 'batch-aggregator').config.size = 1000
  })

  // FL-258
  // The lock is taken whether it is free or not.
  await failsOn('fl-258', 'Run: Last night\'s run is still going', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE dbo.job_lock SET locked = 1, locked_at = :lockedAt WHERE job_name = :jobName'
  })
  // No file and the lock is kept.
  await failsOn('fl-258', 'Run: No file tonight', (d) => {
    const r = all(d, 'choice')[1].routes[0]
    r.steps = r.steps.filter((n) => n.type !== 'db-update')
  })
  // No error handler: a failure before the job keeps the lock.
  await failsOn('fl-258', 'Run: The job row cannot be started', (d) => {
    d.flows[0].errorHandlers = []
  })
  // No weight band check: the bad rate fails the whole group in the MERGE, or is stored.
  await failsOn('fl-258', 'Run: A row with no weight band', (d) => {
    const r = one(d, 'batch-job').routes[0]
    r.steps = r.steps.filter((n) => n.type !== 'validation')
  })
  // Half an hour earlier.
  await passes('fl-258', (d) => {
    d.flows[0].source.config.expression = '0 30 1 * * ?'
  })

  // FL-259
  // The old sort before the job.
  await failsOn('fl-259', 'Nothing in the flow sorts', (d) => {
    const s = top(d)
    s.splice(s.findIndex((n) => n.type === 'batch-job'), 0, step('transform', { script: '%dw 2.0\noutput application/java\n---\npayload orderBy $.store' }))
  })
  // The old row count in the log.
  await failsOn('fl-259', 'Nothing in the flow sorts', (d) => {
    one(d, 'logger').config.message = '#["rows=" ++ (sizeOf(payload) as String)]'
  })
  // No size check.
  await failsOn('fl-259', 'size is stable', (d) => {
    d.flows[0].source.config.timeBetweenSizeCheck = 0
  })
  // No size log and groups of 500.
  await passes('fl-259', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'logger')
    one(d, 'batch-aggregator').config.size = 500
  })

  // FL-260
  // A fixed limit in the expression: the property is ignored.
  await failsOn('fl-260', 'Run: A feed over the limit', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[attributes.size > 2000000000]'
  })
  // The oversized file is parked but nobody is told.
  await failsOn('fl-260', 'emailed to the feed team', (d) => {
    const r = one(d, 'choice').routes[0]
    r.steps = r.steps.filter((n) => n.type !== 'email-send')
  })
  // At or over the limit.
  await passes('fl-260', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[attributes.size >= (p("feed.maxBytes") as Number)]'
  })

  // FL-261
  // The whole file published as the message.
  await failsOn('fl-261', 'Run: A nightly export', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'set-payload')
  })
  // The notice before the upload.
  await failsOn('fl-261', 'after the upload', (d) => {
    const s = top(d)
    moveBefore(s, 'jms-publish', 'azure-upload-blob')
    moveBefore(s, 'set-payload', 'jms-publish')
  })
  // A plain text content type.
  await passes('fl-261', (d) => {
    one(d, 'azure-upload-blob').config.contentType = 'text/plain'
  })

  // FL-262
  // The control file before the parts.
  await failsOn('fl-262', 'after every part is renamed', (d) => {
    const s = top(d)
    const at = s.findIndex((n) => n.type === 'foreach')
    s.splice(at, 0, ...s.splice(at + 1, 2))
  })
  // No fetch size: the whole table is read into one list.
  await failsOn('fl-262', 'fetch size', (d) => {
    delete one(d, 'db-select').config.fetchSize
  })
  // Parts written under the final name: the platform can load half a part.
  await failsOn('fl-262', '.tmp and renamed', (d) => {
    const f = one(d, 'foreach')
    one(d, 'ftp-write').config.path = '#["/inbound/history/" ++ vars.fileName]'
    f.steps = f.steps.filter((n) => n.type !== 'ftp-rename')
  })
  // One row per pass: millions of files.
  await failsOn('fl-262', 'batches of at least 100,000', (d) => {
    one(d, 'foreach').config.batchSize = 1
  })
  // Parts of 500,000.
  await passes('fl-262', (d) => {
    one(d, 'foreach').config.batchSize = 500000
  })

  // FL-263
  // No count check: a short part is released.
  await failsOn('fl-263', 'Run: A part is short', (d) => {
    const t = one(d, 'try')
    t.steps = t.steps.filter((n) => n.type !== 'choice')
  })
  // No handler: a missing part fails the flow and nobody is told.
  await failsOn('fl-263', 'Run: A part is missing', (d) => {
    one(d, 'try').errorHandlers = []
  })
  // Another subject.
  await passes('fl-263', (d) => {
    one(d, 'email-send').config.subject = '#["Forecast set held back: " ++ attributes.fileName]'
  })

  // FL-264
  // Read and written through the worker.
  await failsOn('fl-264', 'no step reads or rewrites its content', (d) => {
    const s = top(d)
    s.splice(s.findIndex((n) => n.type === 'sftp-copy'), 1, step('sftp-read', { path: '#[attributes.path]' }), step('sftp-write', { path: '#["/archive/weekly/" ++ vars.fileName]', mode: 'OVERWRITE' }))
  })
  // The archive copy refuses to replace the old one.
  await failsOn('fl-264', 'Run: The same week again', (d) => {
    one(d, 'sftp-copy').config.overwrite = 'false'
  })
  // The marker before the file is in place.
  await failsOn('fl-264', 'marker is written after the move', (d) => {
    const s = top(d)
    moveBefore(s, 'set-payload', 'sftp-move')
    moveBefore(s, 'sftp-write', 'sftp-move')
  })
  // No log line.
  await passes('fl-264', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'logger')
  })

  // FL-265
  // Groups of two, each overwriting the file.
  await failsOn('fl-265', 'Run: A customs set', (d) => {
    Object.assign(one(d, 'batch-aggregator').config, { streaming: 'false', size: 2 })
  })
  // JSON instead of CSV.
  await failsOn('fl-265', 'into CSV', (d) => {
    all(d, 'transform')[1].config.script = '%dw 2.0\noutput application/json\n---\npayload'
  })
  // Blocks of 200.
  await passes('fl-265', (d) => {
    one(d, 'batch-job').config.blockSize = 200
  })

  // FL-266
  // Only the row count is checked: a garbled part is released.
  await failsOn('fl-266', 'Run: A garbled part', (d) => {
    all(d, 'choice')[1].routes[0].config.expression = '#[vars.rows != vars.part.rows]'
  })
  // No set log check: the same set is released twice.
  await failsOn('fl-266', 'Run: The same set again', (d) => {
    const c = one(d, 'choice')
    unwrap(top(d), c, c.otherwise)
  })
  // Parts read as CSV, so the bytes are not hashed as written.
  await failsOn('fl-266', 'read as text', (d) => {
    one(d, 'ftp-read').config.outputMimeType = 'application/csv'
  })
  // Any control file name.
  await passes('fl-266', (d) => {
    d.flows[0].source.config.matcher = '*.ctl'
  })

  // FL-267
  // Merged whatever the count.
  await failsOn('fl-267', 'Run: A part is short', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.count[0].n > 0]'
  })
  // A short set leaves its staging rows behind.
  await failsOn('fl-267', 'Run: A part is short', (d) => {
    const c = one(d, 'choice')
    c.otherwise = c.otherwise.filter((n) => n.type !== 'db-delete')
  })
  // No handler: a failed MERGE leaves the job STARTED.
  await failsOn('fl-267', 'Run: The MERGE fails', (d) => {
    d.flows[0].errorHandlers = []
  })
  // Moves that do not overwrite.
  await passes('fl-267', (d) => {
    for (const m of all(d, 'sftp-move')) m.config.overwrite = 'false'
  })

  // FL-268
  // The old groupBy in a Transform.
  await failsOn('fl-268', 'groups the lines', (d) => {
    const s = top(d)
    s.splice(s.findIndex((n) => n.type === 'batch-job'), 0, step('transform', { target: 'variable', variableName: 'byStore', script: '%dw 2.0\noutput application/java\n---\npayload groupBy $.store' }))
  })
  // A rerun stages the lines twice.
  await failsOn('fl-268', 'Run: The same file again', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'db-delete')
  })
  // A rerun adds the totals again.
  await failsOn('fl-268', 'Run: The same file again', (d) => {
    const b = one(d, 'batch-job')
    b.onComplete = b.onComplete.filter((n) => n.type !== 'db-delete')
  })
  // Groups of 500.
  await passes('fl-268', (d) => {
    one(d, 'batch-aggregator').config.size = 500
  })

  // FL-269
  // The report email holds up the run.
  await failsOn('fl-269', 'Async scope', (d) => {
    const s = top(d)
    const a = s.find((n) => n.type === 'async')
    unwrap(s, a, a.steps)
  })
  // No handler: a failed run stays STARTED and nobody is told.
  await failsOn('fl-269', 'Run: The FTP server is down', (d) => {
    d.flows[0].errorHandlers = []
  })
  // The control file before the parts.
  await failsOn('fl-269', 'after every part is renamed', (d) => {
    const s = top(d)
    const at = s.findIndex((n) => n.type === 'foreach')
    s.splice(at, 0, ...s.splice(at + 1, 3))
  })
  // No checksum.
  await failsOn('fl-269', 'MD5 is worked out', (d) => {
    one(d, 'set-variable', (x) => x.config.variableName === 'md5').config.value = '#[""]'
  })
  // Parts of 250,000.
  await passes('fl-269', (d) => {
    one(d, 'foreach').config.batchSize = 250000
  })

  // FL-270
  // No size limit: an oversized part is read.
  await failsOn('fl-270', 'Run: A part over the size limit', (d) => {
    const c = all(d, 'choice')[0]
    c.routes = c.routes.filter((r) => !r.config.expression.includes('maxPartBytes'))
  })
  // A bad set leaves its staging rows behind.
  await failsOn('fl-270', 'Run: A garbled part', (d) => {
    const c = all(d, 'choice')[2]
    c.otherwise = c.otherwise.filter((n) => n.type !== 'db-delete')
  })
  // The checksum is never compared.
  await failsOn('fl-270', 'Run: A garbled part', (d) => {
    all(d, 'choice')[1].routes[0].config.expression = '#[false]'
  })
  // The report email holds up the flow.
  await failsOn('fl-270', 'Async scope', (d) => {
    const r = all(d, 'choice')[2].routes[0]
    const a = r.steps.find((n) => n.type === 'async')
    unwrap(r.steps, a, a.steps)
  })
  // Another report text.
  await passes('fl-270', (d) => {
    one(d, 'email-send').config.content = '#["Merged " ++ (sizeOf(vars.parts) as String) ++ " parts"]'
  })
}
