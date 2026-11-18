// Wrong and other correct designs for batch P (fl-271 to fl-290): a second set on the ten project topics. See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, step }) => {
  const unwrap = (list, node, branch) => list.splice(list.indexOf(node), 1, ...branch)
  const top = (d) => d.flows[0].steps
  const moveBefore = (list, type, beforeType) => {
    const node = list.splice(list.findIndex((n) => n.type === type), 1)[0]
    list.splice(list.findIndex((n) => n.type === beforeType), 0, node)
  }

  // FL-271
  // On Error Propagate: the notice is also redelivered, again and again while Oracle is down.
  await failsOn('fl-271', 'Run: Oracle is down', (d) => {
    d.flows[0].errorHandlers[0].type = 'on-error-propagate'
  })
  // The failure message carries the row, not the notice the restart app replays.
  await failsOn('fl-271', 'Run: Oracle is down', (d) => {
    one(d, 'set-payload').config.value = '#[output application/json --- { message: payload, errorType: error.errorType.asString, reason: error.description }]'
  })
  // One consumer and no time stamp.
  await passes('fl-271', (d) => {
    d.flows[0].source.config.numberOfConsumers = 1
    one(d, 'set-payload').config.value = '#[output application/json --- { message: vars.original, errorType: error.errorType.asString, reason: error.description }]'
  })

  // FL-272
  // No version guard: a late event puts the old price back.
  await failsOn('fl-272', 'Run: An older price arrives late', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE item_price SET price = :price, version = :version WHERE item_id = :itemId'
  })
  // The insert's key error is not handled: a late event fails and is redelivered.
  await failsOn('fl-272', 'Run: An older price arrives late', (d) => {
    one(d, 'on-error-continue').type = 'on-error-propagate'
  })
  // A new item is inserted but never published.
  await failsOn('fl-272', 'Run: A new item', (d) => {
    const t = one(d, 'try')
    t.steps = t.steps.filter((n) => n.type !== 'jms-publish')
  })
  // The guard written the other way round, and eight consumers.
  await passes('fl-272', (d) => {
    one(d, 'db-update').config.sql = 'UPDATE item_price SET price = :price, version = :version WHERE item_id = :itemId AND :version > version'
    d.flows[0].source.config.numberOfConsumers = 8
  })

  // FL-273
  // Known by name only: an overwritten blob is never loaded again.
  await failsOn('fl-273', 'Run: A blob overwritten with new costs', (d) => {
    Object.assign(one(d, 'db-select').config, { sql: 'SELECT blob_name FROM dbo.processed_blob WHERE blob_name = :name', inputParameters: '#[{ name: vars.blob.name }]' })
  })
  // No delete: the old rows stay next to the new ones.
  await failsOn('fl-273', 'Run: A blob overwritten with new costs', (d) => {
    const t = one(d, 'try')
    t.steps = t.steps.filter((n) => n.type !== 'db-delete')
  })
  // No Try: one bad blob stops the run.
  await failsOn('fl-273', 'Run: One download fails', (d) => {
    const r = one(d, 'choice').routes[0]
    const t = r.steps[0]
    unwrap(r.steps, t, t.steps)
  })
  // Every five minutes.
  await passes('fl-273', (d) => {
    d.flows[0].source.config.frequency = 5
  })

  // FL-274
  // No attempt limit: a blob that never comes keeps the notice going round for ever.
  await failsOn('fl-274', 'Run: Still missing on the fifth try', (d) => {
    all(d, 'choice')[1].routes[0].config.expression = '#[isEmpty(payload)]'
  })
  // No existence check: the download fails for a notice that came early.
  await failsOn('fl-274', 'Run: The blob is not there yet', (d) => {
    const o = one(d, 'choice').otherwise
    o.splice(o.findIndex((n) => n.type === 'azure-list-blobs'), 1)
  })
  // On Error Propagate: the notice is redelivered after the FAILED ACK.
  await failsOn('fl-274', 'Run: Oracle refuses the lines', (d) => {
    one(d, 'on-error-continue').type = 'on-error-propagate'
  })
  // Four consumers.
  await passes('fl-274', (d) => {
    d.flows[0].source.config.numberOfConsumers = 4
  })

  // FL-275
  // No transaction: a failed insert leaves the stores with no grades.
  await failsOn('fl-275', 'Run: SQL Server refuses the load', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The oldest snapshot is loaded.
  await failsOn('fl-275', 'Run: Three snapshots waiting', (d) => {
    one(d, 'file-read').config.path = '#[vars.files[0].attributes.path]'
  })
  // Sorted by path, and half an hour earlier.
  await passes('fl-275', (d) => {
    one(d, 'set-variable', (x) => x.config.variableName === 'files').config.value = '#[payload orderBy $.attributes.path]'
    d.flows[0].source.config.expression = '0 30 5 * * ?'
  })

  // FL-276
  // One handler for everything: an outage moves a good plan to the error folder.
  await failsOn('fl-276', 'Run: SQL Server cannot be reached', (d) => {
    d.flows[0].errorHandlers = d.flows[0].errorHandlers.filter((h) => h.type === 'on-error-continue')
  })
  // The result is written under its final name: the monitor can read half of it.
  await failsOn('fl-276', '.tmp name and renamed', (d) => {
    one(d, 'file-write', (x) => x.config.path.includes('.tmp')).config.path = '#["/mnt/planning/inbound/alloc-results/" ++ vars.fileName ++ ".result"]'
    d.flows[0].steps = top(d).filter((n) => n.type !== 'file-rename')
  })
  // The plan is archived before its result exists.
  await failsOn('fl-276', 'archived after the result', (d) => {
    moveBefore(top(d), 'file-move', 'set-payload')
  })
  // A longer size check.
  await passes('fl-276', (d) => {
    d.flows[0].source.config.timeBetweenSizeCheck = 10000
  })

  // FL-277
  // OVERWRITE: a rerun replaces a file the platform may be reading.
  await failsOn('fl-277', 'Run: A rerun after the file was sent', (d) => {
    one(d, 'sftp-write').config.mode = 'OVERWRITE'
  })
  // The alert holds up the job.
  await failsOn('fl-277', 'Async scope', (d) => {
    const r = one(d, 'choice').routes[0]
    const a = r.steps.find((n) => n.type === 'async')
    unwrap(r.steps, a, a.steps)
  })
  // Listed after the write: tonight's own file raises an alert every night.
  await failsOn('fl-277', 'Run: A normal night', (d) => {
    const s = top(d)
    const list = s.splice(s.findIndex((n) => n.type === 'sftp-list'), 2)
    s.splice(s.findIndex((n) => n.type === 'sftp-write') + 1, 0, ...list)
  })
  // A quarter of an hour later.
  await passes('fl-277', (d) => {
    d.flows[0].source.config.expression = '0 15 2 * * ?'
  })

  // FL-278
  // No ONLY_FAILURES step: refused lines are lost.
  await failsOn('fl-278', 'An ONLY_FAILURES step', (d) => {
    const b = one(d, 'batch-job')
    b.routes = b.routes.slice(0, 1)
  })
  // Always ACCEPTED.
  await failsOn('fl-278', 'Run: A line with a quantity of 0', (d) => {
    one(d, 'set-payload').config.value = '#[vars.fileName ++ "|ACCEPTED|" ++ (payload.successfulRecords as String) ++ "|" ++ (payload.failedRecords as String)]'
  })
  // Groups of 1,000 and blocks of 100.
  await passes('fl-278', (d) => {
    one(d, 'batch-aggregator').config.size = 1000
    one(d, 'batch-job').config.blockSize = 100
  })

  // FL-279
  // A plain move: the resent week replaces the first copy.
  await failsOn('fl-279', 'Run: The same week resent', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'ftp-rename')
    one(d, 'ftp-move').config.sourcePath = '#[vars.filePath]'
  })
  // Renamed before the insert: a failed load leaves the file under a name the listener ignores.
  await failsOn('fl-279', 'Run: SQL Server is down', (d) => {
    moveBefore(top(d), 'ftp-rename', 'transform')
  })
  // Milliseconds in the name.
  await passes('fl-279', (d) => {
    one(d, 'set-variable', (x) => x.config.variableName === 'archiveName').config.value = '#[attributes.fileName ++ "." ++ (now() as String {format: "yyyyMMddHHmmssSSS"})]'
  })

  // FL-280
  // A CSV Transform: a quiet region gets a file with no header.
  await failsOn('fl-280', 'Run: Three regions, one quiet', (d) => {
    const f = one(d, 'foreach')
    f.steps.splice(f.steps.findIndex((n) => n.type === 'set-payload'), 1, step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }))
  })
  // Every region, closed ones too.
  await failsOn('fl-280', 'Run: Three regions, one quiet', (d) => {
    one(d, 'db-select').config.sql = 'SELECT region_code FROM dbo.region ORDER BY region_code'
  })
  // The control file before the region files.
  await failsOn('fl-280', 'after every region file', (d) => {
    const s = top(d)
    const at = s.findIndex((n) => n.type === 'foreach')
    s.splice(at, 0, ...s.splice(at + 1, 2))
  })
  // A quarter of an hour later.
  await passes('fl-280', (d) => {
    d.flows[0].source.config.expression = '0 45 23 * * ?'
  })

  // FL-281
  // OFFSET from the start: the next page repeats the first.
  await failsOn('fl-281', 'OFFSET', (d) => {
    one(d, 'db-select').config.sql = 'SELECT item_id, description, category FROM dbo.item ORDER BY item_id OFFSET 0 ROWS FETCH NEXT :limit ROWS ONLY'
  })
  // next is never null: the platform asks for one page too many for ever.
  await failsOn('fl-281', 'Run: The last page', (d) => {
    one(d, 'set-payload').config.value = '#[output application/json --- { items: payload, next: payload[-1].item_id }]'
  })
  // No limit check.
  await failsOn('fl-281', 'Run: A limit too large', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'choice')
  })
  // A smaller default page.
  await passes('fl-281', (d) => {
    one(d, 'set-variable', (x) => x.config.variableName === 'limit').config.value = '#[(attributes.queryParams.limit default "200") as Number]'
  })

  // FL-282
  // The procedure runs before the answer: the console waits 40 minutes.
  await failsOn('fl-282', 'inside an Async scope', (d) => {
    const s = top(d)
    const a = s.find((n) => n.type === 'async')
    unwrap(s, a, a.steps)
  })
  // No 409: a second click gets 500.
  await failsOn('fl-282', 'Run: An item run is already going', (d) => {
    d.flows[0].errorHandlers = []
  })
  // No handler in the Async scope: a failed run stays RUNNING.
  await failsOn('fl-282', 'Run: The generation fails', (d) => {
    one(d, 'try').errorHandlers = []
  })
  // The message type taken as given.
  await passes('fl-282', (d) => {
    one(d, 'set-variable', (x) => x.config.variableName === 'messageType').config.value = '#[attributes.uriParams.messageType]'
  })

  // FL-283
  // No retry: a busy answer fails the batch at once.
  await failsOn('fl-283', 'Run: Busy twice, then free', (d) => {
    const s = top(d)
    const u = s.find((n) => n.type === 'until-successful')
    unwrap(s, u, u.steps)
  })
  // Every code that is not 0 or 1 is retried: a real error is called five times.
  await failsOn('fl-283', 'Run: A real error', (d) => {
    all(d, 'choice')[0].routes[0].config.expression = '#[vars.result.p_status != 0 and vars.result.p_status != 1]'
  })
  // On Error Propagate: the request is redelivered after the batch is marked FAILED.
  await failsOn('fl-283', 'Run: Busy the whole time', (d) => {
    d.flows[0].errorHandlers[0].type = 'on-error-propagate'
  })
  // Five retries 20 seconds apart.
  await passes('fl-283', (d) => {
    Object.assign(one(d, 'until-successful').config, { maxRetries: 5, millisBetweenRetries: 20000 })
  })

  // FL-284
  // No clean up: a failed archive leaves the staged lines behind.
  await failsOn('fl-284', 'Run: The archive upload fails', (d) => {
    const h = one(d, 'on-error-continue')
    h.steps = h.steps.filter((n) => n.type !== 'db-delete')
  })
  // The source blob deleted inside the archive route: gone even when staging fails.
  await failsOn('fl-284', 'Run: Oracle refuses the lines', (d) => {
    const s = top(d)
    const del = s.splice(s.findIndex((n) => n.type === 'azure-delete-blob'), 1)[0]
    one(d, 'scatter-gather').routes[0].steps.push(del)
  })
  // A longer timeout.
  await passes('fl-284', (d) => {
    one(d, 'scatter-gather').config.timeout = 300000
  })

  // FL-285
  // A written address.
  await failsOn('fl-285', 'from the data', (d) => {
    one(d, 'email-send').config.toAddresses = 'stock-team@fenwick.example'
  })
  // Inactive recipients are mailed too.
  await failsOn('fl-285', 'Run: Two active recipients', (d) => {
    one(d, 'db-select').config.sql = 'SELECT email FROM job_recipient WHERE job_name = :jobName'
  })
  // No ORDER BY.
  await passes('fl-285', (d) => {
    one(d, 'db-select').config.sql = 'SELECT email FROM job_recipient WHERE job_name = :jobName AND active = 1'
  })

  // FL-286
  // Soft bounces marked too: a full mailbox stops the reports.
  await failsOn('fl-286', 'Run: A soft bounce', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.recipient != null]'
  })
  // The bounce is filed before the update.
  await failsOn('fl-286', 'updated before its bounce is filed', (d) => {
    const r = one(d, 'choice').routes[0]
    moveBefore(r.steps, 'email-move', 'db-update')
  })
  // Folders created when missing.
  await passes('fl-286', (d) => {
    for (const m of all(d, 'email-move')) m.config.createTargetFolder = 'true'
  })

  // FL-287
  // No step for unknown types: a PRICE record counts as loaded.
  await failsOn('fl-287', 'Run: A short barcode and an unknown type', (d) => {
    const b = one(d, 'batch-job')
    b.routes = b.routes.filter((r) => r.config.name !== 'unknown')
  })
  // Items shaped without their type: they fall into the unknown step.
  await failsOn('fl-287', 'Run: A mixed message', (d) => {
    one(d, 'batch-job').routes[0].steps.find((n) => n.type === 'set-payload').config.value = '#[{ message_id: vars.messageId, item_id: payload.itemId, description: payload.description, dept: payload.dept }]'
  })
  // Groups of 1,000.
  await passes('fl-287', (d) => {
    for (const a of all(d, 'batch-aggregator')) a.config.size = 1000
  })

  // FL-288
  // Groups of 5,000: messages over the partner's limit.
  await failsOn('fl-288', 'at most 1,000', (d) => {
    one(d, 'batch-aggregator').config.size = 5000
  })
  // Always COMPLETED.
  await failsOn('fl-288', 'Run: The second upload fails', (d) => {
    one(d, 'db-update').config.inputParameters = '#[{ jobId: vars.jobId, sent: payload.successfulRecords, failed: payload.failedRecords, status: "COMPLETED" }]'
  })
  // Every NEW item marked SENT by the next group, the failed group too.
  await failsOn('fl-288', 'Run: The second upload fails', (d) => {
    one(d, 'db-bulk-update').config.sql = "UPDATE outbound_item SET status = 'SENT', job_id = :job_id WHERE status = 'NEW'"
  })
  // Blocks of 1,000.
  await passes('fl-288', (d) => {
    one(d, 'batch-job').config.blockSize = 1000
  })

  // FL-289
  // The hand-off before the body is on disk.
  await failsOn('fl-289', 'before the hand-off', (d) => {
    const s = top(d)
    const publish = s.splice(s.findIndex((n) => n.type === 'vm-publish'), 1)[0]
    s.splice(s.findIndex((n) => n.type === 'file-write'), 0, publish)
  })
  // No RECEIVED row: an upload whose load fails leaves no trace.
  await failsOn('fl-289', 'Run: SQL Server is down while loading', (d) => {
    d.flows[0].steps = top(d).filter((n) => n.type !== 'db-insert')
  })
  // No handler: an empty body gets 500.
  await failsOn('fl-289', 'Run: An empty upload', (d) => {
    d.flows[0].errorHandlers = []
  })
  // OVERWRITE on the landing file.
  await passes('fl-289', (d) => {
    one(d, 'file-write').config.mode = 'OVERWRITE'
  })

  // FL-290
  // No append: each batch replaces the store's earlier lines.
  await failsOn('fl-290', 'Run: A day of three stores', (d) => {
    for (const w of all(d, 'sftp-write')) if (w.config.mode === 'APPEND') w.config.mode = 'OVERWRITE'
  })
  // Renamed at the end of each batch: the platform sees a store file that is still growing.
  await failsOn('fl-290', 'Run: A day of three stores', (d) => {
    const s = top(d)
    const at = s.findIndex((n) => n.type === 'set-variable' && n.config.variableName === 'totals')
    const moved = s.splice(at, 2)
    all(d, 'foreach')[0].steps.push(...moved)
  })
  // Batches of 20,000.
  await passes('fl-290', (d) => {
    all(d, 'foreach')[0].config.batchSize = 20000
  })
}
