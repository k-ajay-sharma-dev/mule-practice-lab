// Wrong and other correct designs for batch M (fl-199 to fl-222): FTP and SQL Server. See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, flowOf, step }) => {
  const swap = (list, a, b) => {
    ;[list[a], list[b]] = [list[b], list[a]]
  }
  const unwrap = (list, node, branch) => list.splice(list.indexOf(node), 1, ...branch)

  // FL-199
  // Written under the final name, no rename: the platform can load half a file.
  await failsOn('fl-199', '.tmp name', (d) => {
    one(d, 'ftp-write').config.path = '#["/inbound/items/" ++ vars.fileName]'
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type !== 'ftp-rename')
  })
  // Drafts go out too.
  await failsOn('fl-199', 'leaving out drafts', (d) => {
    one(d, 'db-select').config.sql = 'SELECT item_id, description, dept, unit_cost, status FROM dbo.items ORDER BY item_id'
  })
  // The rename before the write.
  await failsOn('fl-199', 'renamed to its final name after the write', (d) => swap(d.flows[0].steps, 3, 4))
  // An hour earlier, and no logger.
  await passes('fl-199', (d) => {
    d.flows[0].source.config.expression = '0 30 22 * * ?'
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type !== 'logger')
  })

  // FL-200
  // No handler: a bad file stays in /stockcount/in.
  await failsOn('fl-200', 'Run: A count that is not a number', (d) => {
    d.flows[0].errorHandlers = []
  })
  // No size check: a file still uploading is read.
  await failsOn('fl-200', 'size is stable', (d) => {
    d.flows[0].source.config.timeBetweenSizeCheck = 0
  })
  // Archived before the insert.
  await failsOn('fl-200', 'archive after the load', (d) => swap(d.flows[0].steps, 3, 4))
  // On Error Propagate also parks the file.
  await passes('fl-200', (d) => {
    d.flows[0].errorHandlers[0].type = 'on-error-propagate'
  })

  // FL-201
  // Deleted before the local copy is written.
  await failsOn('fl-201', 'Run: The landing disk is full', (d) => swap(one(d, 'foreach').steps, 3, 4))
  // Every file is listed, the readme too.
  await failsOn('fl-201', 'are listed', (d) => {
    one(d, 'ftp-list').config.matcher = '*'
  })
  // Every 10 minutes.
  await passes('fl-201', (d) => {
    d.flows[0].source.config.frequency = 10
  })

  // FL-202
  // Any file with details is loaded.
  await failsOn('fl-202', 'Run: The trailer says 3', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[sizeOf(vars.parsed.details) > 0]'
  })
  // A bad file is only logged and stays.
  await failsOn('fl-202', 'goes to /wms/receipts/error', (d) => {
    const c = one(d, 'choice')
    c.otherwise = c.otherwise.filter((n) => n.type !== 'ftp-move')
  })
  // The comparison written the other way round.
  await passes('fl-202', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[sizeOf(vars.parsed.details) == vars.parsed.trailerCount]'
  })

  // FL-203
  // A catch-all handler parks good files during a database outage.
  await failsOn('fl-203', 'Run: SQL Server is down', (d) => {
    one(d, 'on-error-continue').config.type = 'ANY'
  })
  // Listening for the data file instead of the marker.
  await failsOn('fl-203', '.ok marker files', (d) => {
    d.flows[0].source.config.matcher = 'FCST_*.csv'
  })
  // The marker archived before the data file.
  await failsOn('fl-203', 'marker is archived after the data file', (d) => swap(d.flows[0].steps, 6, 7))
  // Moves that do not overwrite.
  await passes('fl-203', (d) => {
    for (const m of all(d, 'ftp-move')) m.config.overwrite = 'false'
  })

  // FL-204
  // The watermark moved before the write: a failed write loses changes.
  await failsOn('fl-204', 'Run: The FTP server is down', (d) => {
    const s = d.flows[0].steps
    s.splice(4, 0, s.pop())
  })
  // No upper bound.
  await failsOn('fl-204', 'upper bound fixed before the query', (d) => {
    const sel = all(d, 'db-select')[1]
    sel.config.sql = 'SELECT change_id, store, sku, on_hand, changed_at_utc FROM dbo.inventory_changes WHERE changed_at_utc > :since ORDER BY change_id'
    sel.config.inputParameters = '#[{ since: vars.since }]'
  })
  // Every 15 minutes.
  await passes('fl-204', (d) => {
    d.flows[0].source.config.frequency = 15
  })

  // FL-205
  // A catch-all handler parks a file when the database is down.
  await failsOn('fl-205', 'Run: SQL Server is down', (d) => {
    one(d, 'on-error-continue').config.type = 'ANY'
  })
  // One retry is not enough for the window.
  await failsOn('fl-205', 'retried at least 3 times', (d) => {
    one(d, 'until-successful').config.maxRetries = 1
  })
  // No handler: nothing is parked and nothing is logged.
  await failsOn('fl-205', 'Run: The server stays in maintenance', (d) => {
    d.flows[0].errorHandlers = []
  })
  // Six retries two minutes apart.
  await passes('fl-205', (d) => {
    Object.assign(one(d, 'until-successful').config, { maxRetries: 6, millisBetweenRetries: 120000 })
  })

  // FL-206
  // No transaction: staging keeps rows when the reject insert fails.
  await failsOn('fl-206', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The reject file written every time.
  await failsOn('fl-206', 'Run: Every line is good', (d) => {
    const s = d.flows[0].steps
    const c = s.find((n) => n.type === 'choice')
    unwrap(s, c, c.routes[0].steps)
  })
  // No handler: a failed file stays in the in folder.
  await failsOn('fl-206', 'Run: The reject insert fails', (d) => {
    d.flows[0].errorHandlers = []
  })
  // Stores read in order.
  await passes('fl-206', (d) => {
    one(d, 'db-select').config.sql = 'SELECT store FROM dbo.stores WHERE is_open = 1 ORDER BY store'
  })

  // FL-207
  // The key is the name only: a resend is loaded again.
  await failsOn('fl-207', 'Run: The same file again', (d) => {
    one(d, 'set-variable', (x) => x.config.variableName === 'fileKey').config.value = '#[attributes.fileName]'
  })
  // No transaction around the key and the rows.
  await failsOn('fl-207', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // No duplicate route: the key insert fails and the file is left behind.
  await failsOn('fl-207', 'Run: The same file again', (d) => {
    const s = d.flows[0].steps
    const c = one(d, 'choice')
    unwrap(s, c, c.otherwise)
  })
  // No WARN log for a duplicate.
  await passes('fl-207', (d) => {
    const r = one(d, 'choice').routes[0]
    r.steps = r.steps.filter((n) => n.type !== 'logger')
  })

  // FL-208
  // Written under the final name: the WMS can pick half a wave.
  await failsOn('fl-208', '.part name', (d) => {
    const c = one(d, 'choice')
    one(d, 'ftp-write').config.path = '#["/wms/in/waves/" ++ vars.fileName]'
    c.otherwise = c.otherwise.filter((n) => n.type !== 'ftp-rename')
  })
  // The source archived before the copy.
  await failsOn('fl-208', 'Run: The WMS FTP server is down', (d) => {
    const o = one(d, 'choice').otherwise
    o.unshift(o.pop())
  })
  // A Transform in the middle.
  await failsOn('fl-208', 'no Transform', (d) => {
    one(d, 'choice').otherwise.unshift(step('transform', { script: '%dw 2.0\noutput text/plain\n---\npayload' }))
  })
  // No WARN log for an empty file.
  await passes('fl-208', (d) => {
    const r = one(d, 'choice').routes[0]
    r.steps = r.steps.filter((n) => n.type !== 'logger')
  })

  // FL-209
  // The control file before the data files.
  await failsOn('fl-209', 'after every data file is renamed', (d) => {
    const s = d.flows[0].steps
    const at = s.findIndex((n) => n.type === 'foreach')
    const moved = s.splice(at + 1, 2)
    s.splice(at, 0, ...moved)
  })
  // The email holds up the run.
  await failsOn('fl-209', 'Async scope', (d) => {
    const s = d.flows[0].steps
    const a = s.find((n) => n.type === 'async')
    unwrap(s, a, a.steps)
  })
  // No handler: the job stays STARTED and nobody is told.
  await failsOn('fl-209', 'Run: The FTP server is down', (d) => {
    d.flows[0].errorHandlers = []
  })
  // Half an hour earlier.
  await passes('fl-209', (d) => {
    d.flows[0].source.config.expression = '0 0 23 * * ?'
  })

  // FL-210
  // The word LOADED is trusted, not the count.
  await failsOn('fl-210', 'Run: An ACK with fewer rows', (d) => {
    flowOf(d, 'ack-in').steps.find((n) => n.type === 'choice').routes[0].config.expression = '#[(not isEmpty(vars.sent)) and vars.ack.status == "LOADED"]'
  })
  // No transaction: the log and the sales can disagree.
  await failsOn('fl-210', 'committed together', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // No overdue check.
  await failsOn('fl-210', 'A second schedule', (d) => {
    d.flows = d.flows.filter((f) => f.name !== 'ack-overdue')
  })
  // The overdue check every 15 minutes.
  await passes('fl-210', (d) => {
    flowOf(d, 'ack-overdue').source.config.frequency = 15
  })

  // FL-211
  // Completes every STARTED row, last week's crash too.
  await failsOn('fl-211', 'Run: A normal night', (d) => {
    const u = one(d, 'db-update', (x) => x.config.sql.includes('COMPLETED'))
    u.config.sql = "UPDATE dbo.job_log SET status = 'COMPLETED', row_count = :rowCount WHERE status = 'STARTED'"
    u.config.inputParameters = '#[{ rowCount: vars.generated.row_count }]'
  })
  // No handler: a failed run stays STARTED.
  await failsOn('fl-211', 'Run: The outbound procedure fails', (d) => {
    d.flows[0].errorHandlers = []
  })
  // On Error Continue also marks it FAILED.
  await passes('fl-211', (d) => {
    d.flows[0].errorHandlers[0].type = 'on-error-continue'
  })

  // FL-212
  // The new value stored before the write.
  await failsOn('fl-212', 'Run: The FTP server is down', (d) => swap(one(d, 'choice').routes[0].steps, 2, 3))
  // A file every hour, even an empty one.
  await failsOn('fl-212', 'Run: Nothing changed', (d) => {
    const s = d.flows[0].steps
    const c = one(d, 'choice')
    unwrap(s, c, c.routes[0].steps)
  })
  // No ORDER BY: the maximum is still worked out.
  await passes('fl-212', (d) => {
    const sel = all(d, 'db-select')[1]
    sel.config.sql = sel.config.sql.replace(' ORDER BY rv', '')
  })

  // FL-213
  // Bad lines are dropped instead of recorded.
  await failsOn('fl-213', 'Run: A file with one bad line', (d) => {
    const s = d.flows[0].steps
    s.splice(s.indexOf(all(d, 'choice')[1]), 1)
  })
  // No size check.
  await failsOn('fl-213', 'size is stable', (d) => {
    d.flows[0].source.config.timeBetweenSizeCheck = 0
  })
  // The empty check written another way.
  await passes('fl-213', (d) => {
    all(d, 'choice')[1].routes[0].config.expression = '#[not isEmpty(vars.checked filter ($.reason != ""))]'
  })

  // FL-214
  // A plain bulk insert: the first known item clashes on the key.
  await failsOn('fl-214', 'Run: Known and new items', (d) => {
    const u = one(d, 'db-bulk-update')
    u.type = 'db-bulk-insert'
    u.config.sql = 'INSERT INTO dbo.supplier_item (supplier_id, sku, unit_cost, lead_days, updated_file) VALUES (:supplier_id, :sku, :unit_cost, :lead_days, :file_name)'
  })
  // No transaction: the first row stays changed when the second fails.
  await failsOn('fl-214', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // No ERROR log in the handler.
  await passes('fl-214', (d) => {
    const h = d.flows[0].errorHandlers[0]
    h.steps = h.steps.filter((n) => n.type !== 'logger')
  })

  // FL-215
  // No transaction: a failed order leaves its header.
  await failsOn('fl-215', 'Run: One order has a line with no quantity', (d) => {
    one(d, 'try', (x) => x.config.transactionalAction === 'ALWAYS_BEGIN').config.transactionalAction = 'INDIFFERENT'
  })
  // One Try with the transaction and On Error Continue: the half order is committed.
  await failsOn('fl-215', 'Run: One order has a line with no quantity', (d) => {
    const outer = one(d, 'try', (x) => x.config.transactionalAction !== 'ALWAYS_BEGIN')
    outer.steps = outer.steps[0].steps
    outer.config.transactionalAction = 'ALWAYS_BEGIN'
  })
  // The archive move does not overwrite.
  await passes('fl-215', (d) => {
    one(d, 'sftp-move').config.overwrite = 'false'
  })

  // FL-216
  // Every database error is rejected, deadlocks too.
  await failsOn('fl-216', 'Run: A deadlock on every try', (d) => {
    one(d, 'on-error-continue').config.when = ''
  })
  // No Try handler: a data error is retried for nothing.
  await failsOn('fl-216', 'Run: A store the database does not know', (d) => {
    one(d, 'try').errorHandlers = []
  })
  // A minute between retries holds a consumer far too long.
  await failsOn('fl-216', 'a few seconds apart', (d) => {
    one(d, 'until-successful').config.millisBetweenRetries = 60000
  })
  // Five retries.
  await passes('fl-216', (d) => {
    one(d, 'until-successful').config.maxRetries = 5
  })

  // FL-217
  // On Complete does nothing: the job stays STARTED.
  await failsOn('fl-217', 'On Complete writes', (d) => {
    one(d, 'batch-job').onComplete = []
  })
  // Groups of 10.
  await failsOn('fl-217', 'at least 100 records', (d) => {
    one(d, 'batch-aggregator').config.size = 10
  })
  // Always COMPLETED: failed groups go unseen.
  await failsOn('fl-217', 'Run: SQL Server refuses the group', (d) => {
    const u = one(d, 'db-update')
    u.config.inputParameters = '#[{ jobId: vars.jobId, loaded: payload.successfulRecords, failed: payload.failedRecords, status: "COMPLETED" }]'
  })
  // Groups and blocks of 1,000.
  await passes('fl-217', (d) => {
    one(d, 'batch-aggregator').config.size = 1000
    one(d, 'batch-job').config.blockSize = 1000
  })

  // FL-218
  // No transaction on the bulk insert: the rows before the bad one clash in the fallback.
  await failsOn('fl-218', 'Run: One bad row in the group', (d) => {
    one(d, 'try', (x) => x.config.transactionalAction === 'ALWAYS_BEGIN').config.transactionalAction = 'INDIFFERENT'
  })
  // No fallback: the handler only logs.
  await failsOn('fl-218', 'one by one', (d) => {
    const h = one(d, 'on-error-continue', (x) => x.config.type === 'DB:QUERY_EXECUTION')
    h.steps = h.steps.filter((n) => n.type === 'logger')
  })
  // Groups of 200.
  await passes('fl-218', (d) => {
    one(d, 'batch-aggregator').config.size = 200
  })

  // FL-219
  // No transaction: allocations stay when the outbox insert fails.
  await failsOn('fl-219', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The file flow publishes too.
  await failsOn('fl-219', 'does not publish to the broker itself', (d) => {
    flowOf(d, 'allocations-in').steps.push(step('jms-publish', { destination: 'wms.allocations' }))
  })
  // Marked SENT before the publish: a broker outage loses the event.
  await failsOn('fl-219', 'Run: The broker is down', (d) => swap(one(d, 'foreach').steps, 2, 3))
  // The relay every minute.
  await passes('fl-219', (d) => {
    Object.assign(flowOf(d, 'outbox-relay').source.config, { frequency: 1, timeUnit: 'MINUTES' })
  })

  // FL-220
  // Each page overwrites the last.
  await failsOn('fl-220', 'Run: Five rows in pages of two', (d) => {
    one(d, 'ftp-write', (x) => x.config.mode === 'APPEND').config.mode = 'OVERWRITE'
  })
  // No ORDER BY: pages can overlap or skip rows.
  await failsOn('fl-220', 'stable ORDER BY', (d) => {
    const sel = one(d, 'foreach').steps[0]
    sel.config.sql = sel.config.sql.replace('ORDER BY store, sku', 'ORDER BY (SELECT NULL)')
  })
  // No header line.
  await failsOn('fl-220', 'header is written once', (d) => {
    const o = one(d, 'choice').otherwise
    o.splice(0, 2)
  })
  // An hour later.
  await passes('fl-220', (d) => {
    d.flows[0].source.config.expression = '0 0 4 * * ?'
  })

  // FL-221
  // No transaction: staging and rejects stay when the MERGE fails.
  await failsOn('fl-221', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // The email holds up the flow.
  await failsOn('fl-221', 'Async scope', (d) => {
    const s = d.flows[0].steps
    const a = s.find((n) => n.type === 'async')
    unwrap(s, a, a.steps)
  })
  // Closed stores are not checked.
  await failsOn('fl-221', 'Run: A plan with one bad line', (d) => {
    const t = one(d, 'transform')
    t.config.script = t.config.script.replace('if (not (openStores contains r.store)) "UNKNOWN_STORE" else ', '')
  })
  // Stores read in order.
  await passes('fl-221', (d) => {
    one(d, 'db-select').config.sql = 'SELECT store FROM dbo.stores WHERE is_open = 1 ORDER BY store'
  })

  // FL-222
  // No health check.
  await failsOn('fl-222', 'health check', (d) => {
    d.flows[0].steps.shift()
  })
  // Abandoned one attempt too late.
  await failsOn('fl-222', 'Run: The third failure', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.job.attempts >= 3]'
  })
  // No handler: one failed job stops the run and no attempt is counted.
  await failsOn('fl-222', 'Run: The merge fails again', (d) => {
    one(d, 'try').errorHandlers = []
  })
  // Every hour.
  await passes('fl-222', (d) => {
    Object.assign(d.flows[0].source.config, { frequency: 1, timeUnit: 'HOURS' })
  })
}
