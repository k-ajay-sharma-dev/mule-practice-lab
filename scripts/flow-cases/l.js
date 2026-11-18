// Wrong and other correct designs for batch L (fl-175 to fl-198): Azure File Share and SFTP. See scripts/check-strict.js for the helpers.
export default async ({ failsOn, passes, one, all, flowOf, step, scope, handler }) => {
  // FL-175
  // Archived before the upload: a failed upload loses the file from the in folder.
  await failsOn('fl-175', 'only after the SFTP write', (d) => {
    const s = d.flows[0].steps
    ;[s[2], s[3]] = [s[3], s[2]]
  })
  // No size check: a half copied file is sent.
  await failsOn('fl-175', 'size stops changing', (d) => {
    d.flows[0].source.config.timeBetweenSizeCheck = 0
  })
  // The archive name carries a timestamp.
  await passes('fl-175', (d) => {
    one(d, 'file-move').config.renameTo = '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.fileName]'
  })

  // FL-176
  // A catch-all handler hides an expired token.
  await failsOn('fl-176', 'Run: The SAS token has expired', (d) => {
    one(d, 'on-error-continue').config.type = 'ANY'
  })
  // No handler: a late file fails the run.
  await failsOn('fl-176', 'Run: The file is not there yet', (d) => {
    d.flows[0].errorHandlers = []
  })
  // Weekdays only, and a longer timeout.
  await passes('fl-176', (d) => {
    d.flows[0].source.config.expression = '0 15 6 ? * MON-FRI'
    one(d, 'http-request').config.responseTimeout = 60000
  })

  // FL-177
  // No handler: an orphan marker is picked up on every poll.
  await failsOn('fl-177', 'Run: A marker with no data file', (d) => {
    d.flows[0].errorHandlers = []
  })
  // The marker deleted before the data file is moved.
  await failsOn('fl-177', 'marker is deleted after the data file is moved', (d) => {
    const s = d.flows[0].steps
    ;[s[4], s[5]] = [s[5], s[4]]
  })
  // Listening for the data file instead of the marker.
  await failsOn('fl-177', 'watches for .ready marker files', (d) => {
    d.flows[0].source.config.matcher = '*.json'
  })
  // The handler also names FILE:ACCESS_DENIED.
  await passes('fl-177', (d) => {
    one(d, 'on-error-continue').config.type = 'FILE:ILLEGAL_PATH, FILE:ACCESS_DENIED'
  })

  // FL-178
  // The watermark moved first: a failed write loses a day of changes.
  await failsOn('fl-178', 'Run: The share cannot be written', (d) => {
    const o = one(d, 'choice').otherwise
    const store = o.pop()
    o.unshift(store)
  })
  // Written under the final name, no rename: the platform can take half a file.
  await failsOn('fl-178', '.tmp name', (d) => {
    const o = one(d, 'choice').otherwise
    one(d, 'file-write').config.path = '#["/mnt/plan-share/outbound/items/" ++ vars.fileName]'
    o.splice(o.findIndex((n) => n.type === 'file-rename'), 1)
  })
  // No Choice: an empty file is written when nothing changed.
  await failsOn('fl-178', 'Run: Nothing changed', (d) => {
    const c = one(d, 'choice')
    const s = d.flows[0].steps
    s.splice(s.indexOf(c), 1, ...c.otherwise)
  })
  // Changes at or after the watermark, so a same second change is never missed.
  await passes('fl-178', (d) => {
    const sel = one(d, 'db-select')
    sel.config.sql = sel.config.sql.replace('updated_at > :since', 'updated_at >= :since')
  })

  // FL-179
  // No quiet time: a file still being copied is posted.
  await failsOn('fl-179', 'Run: One finished, one copying, one empty', (d) => {
    one(d, 'choice').routes.splice(1, 1)
  })
  // No handler in the Try: one rejected file stops the run.
  await failsOn('fl-179', 'Run: The LIMS rejects a file', (d) => {
    one(d, 'try').errorHandlers = []
  })
  // A three minute quiet time.
  await passes('fl-179', (d) => {
    const r = one(d, 'choice').routes[1]
    r.config.expression = r.config.expression.replace('PT2M', 'PT3M')
  })

  // FL-180
  // No Create File: the range is written to a file that does not exist.
  await failsOn('fl-180', 'Run: The morning export', (d) => {
    const s = d.flows[0].steps
    s.splice(s.findIndex((n) => n.type === 'http-request'), 1)
  })
  // The range written before the file is created.
  await failsOn('fl-180', 'created with a PUT before', (d) => {
    const [create, range] = all(d, 'http-request')
    ;[create.config.path, range.config.path] = [range.config.path, create.config.path]
  })
  // Longer timeouts on both calls.
  await passes('fl-180', (d) => {
    for (const h of all(d, 'http-request')) h.config.responseTimeout = 120000
  })

  // FL-181
  // Any non empty file is sent.
  await failsOn('fl-181', 'Run: The data file is short', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[sizeOf(payload) >= 1]'
  })
  // The control file left behind in the in folder.
  await failsOn('fl-181', 'A short file and its control file go to the error folder', (d) => {
    const c = one(d, 'choice')
    c.otherwise = c.otherwise.filter((n) => !(n.type === 'file-move' && n.config.sourcePath.includes('ctlPath')))
  })
  // The comparison written the other way round.
  await passes('fl-181', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.expected == sizeOf(payload)]'
  })

  // FL-182
  // No duplicate route: a resent plan is loaded twice.
  await failsOn('fl-182', 'Run: The platform sends the same file again', (d) => {
    const c = one(d, 'choice')
    const s = d.flows[0].steps
    s.splice(s.indexOf(c), 1, ...c.otherwise)
  })
  // No transaction: the plan rows stay when the log insert fails.
  await failsOn('fl-182', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // No handler: a failed file stays in the in folder.
  await failsOn('fl-182', 'Run: The file log insert fails', (d) => {
    d.flows[0].errorHandlers = []
  })
  // On Error Propagate: the file still goes to error, and the run is marked failed.
  await passes('fl-182', (d) => {
    d.flows[0].errorHandlers[0].type = 'on-error-propagate'
  })

  // FL-183
  // Each file in its own Try: a refused file is skipped for good once a later one succeeds.
  await failsOn('fl-183', 'Run: The journey planner refuses the first file', (d) => {
    const loop = one(d, 'foreach')
    loop.steps = [scope('try', {}, loop.steps, { errorHandlers: [handler('on-error-continue', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: 'failed' })])] })]
  })
  // The watermark stored once after the loop.
  await failsOn('fl-183', 'one file at a time', (d) => {
    const loop = one(d, 'foreach')
    const store = loop.steps.pop()
    d.flows[0].steps.push(store)
  })
  // Every 10 minutes.
  await passes('fl-183', (d) => {
    d.flows[0].source.config.frequency = 10
  })

  // FL-184
  // Deleting before the snapshot: a refused snapshot leaves no way back.
  await failsOn('fl-184', 'Run: The snapshot is refused', (d) => {
    const s = d.flows[0].steps
    const [blank, snap] = s.splice(0, 2)
    s.push(blank, snap)
  })
  // Three days instead of thirty.
  await failsOn('fl-184', 'Run: A normal Sunday', (d) => {
    const r = one(d, 'choice').routes[0]
    r.config.expression = r.config.expression.replace('P30D', 'P3D')
  })
  // The age worked out in days.
  await passes('fl-184', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[daysBetween((payload.attributes.timestamp as LocalDateTime) as Date, now() as Date) > 30]'
  })

  // FL-185
  // No wait for missing stores: a partial day is sent.
  await failsOn('fl-185', 'Run: A store is late', (d) => {
    const inner = all(d, 'choice')[1]
    inner.routes.splice(1, 1)
  })
  // No check of sales_runs: a day is sent twice.
  await failsOn('fl-185', 'Run: The day was already sent', (d) => {
    const inner = all(d, 'choice')[1]
    inner.routes.splice(0, 1)
  })
  // Written under the final name: the platform can load half a file.
  await failsOn('fl-185', '.tmp name, then renamed', (d) => {
    const inner = all(d, 'choice')[1]
    one(d, 'sftp-write').config.path = '#["/inbound/sales/STORE_SALES_" ++ vars.businessDate ++ ".csv"]'
    inner.otherwise = inner.otherwise.filter((n) => n.type !== 'sftp-rename')
  })
  // The two selects in the other order.
  await passes('fl-185', (d) => {
    const o = one(d, 'choice').otherwise
    const i = o.findIndex((n) => n.type === 'db-select')
    ;[o[i], o[i + 1]] = [o[i + 1], o[i]]
  })

  // FL-186
  // The handler only logs: a failed file stays claimed for ever.
  await failsOn('fl-186', 'Run: Dispatch is down', (d) => {
    const h = all(d, 'on-error-continue').find((x) => x.config.type === 'ANY')
    h.steps = h.steps.filter((n) => n.type !== 'file-rename')
  })
  // No sweeper.
  await failsOn('fl-186', 'second scheduled flow', (d) => {
    d.flows = d.flows.filter((f) => f.name !== 'claim-sweeper')
  })
  // A one minute limit: a live claim is taken away.
  await failsOn('fl-186', 'Run: A worker crashed holding a claim', (d) => {
    const r = flowOf(d, 'sweeper').steps[1].steps[0].routes[0]
    r.config.expression = r.config.expression.replace('PT30M', 'PT1M')
  })
  // The sweeper runs every 5 minutes.
  await passes('fl-186', (d) => {
    flowOf(d, 'sweeper').source.config.frequency = 5
  })

  // FL-187
  // Every store, closed ones too.
  await failsOn('fl-187', 'Open and planned stores', (d) => {
    one(d, 'db-select').config.sql = 'SELECT store_id, store_name, region, open_date, status FROM stores ORDER BY store_id'
  })
  // The wrong folder.
  await failsOn('fl-187', 'Run: The nightly export', (d) => {
    one(d, 'sftp-write').config.path = '/inbound/LOCATIONS.csv'
  })
  // An hour early.
  await failsOn('fl-187', '23:15', (d) => {
    d.flows[0].source.config.expression = '0 15 22 * * ?'
  })
  // No logger.
  await passes('fl-187', (d) => {
    d.flows[0].steps = d.flows[0].steps.filter((n) => n.type !== 'logger')
  })

  // FL-188
  // A catch-all: an outage parks a good order in the error folder.
  await failsOn('fl-188', 'Run: The order API is down', (d) => {
    one(d, 'on-error-continue').config.type = 'ANY'
  })
  // No handler: a refused file is tried for ever.
  await failsOn('fl-188', 'Run: The order is refused', (d) => {
    d.flows[0].errorHandlers = []
  })
  // Archived before the post.
  await failsOn('fl-188', 'after the post', (d) => {
    const s = d.flows[0].steps
    const move = s.pop()
    s.splice(1, 0, move)
  })
  // A 404 from the API is parked too.
  await passes('fl-188', (d) => {
    one(d, 'on-error-continue').config.type = 'HTTP:BAD_REQUEST, HTTP:NOT_FOUND'
  })

  // FL-189
  // The size test never matches: an empty file goes to the load.
  await failsOn('fl-189', 'Run: An empty file', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[attributes.size < 0]'
  })
  // The empty file is only logged and stays in /audit/in.
  await failsOn('fl-189', 'An empty file is moved to /audit/empty', (d) => {
    const r = one(d, 'choice').routes[0]
    r.steps = r.steps.filter((n) => n.type !== 'sftp-move')
  })
  // A header only file is treated as empty too.
  await passes('fl-189', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[attributes.size == 0 or isEmpty(payload)]'
  })

  // FL-190
  // No transaction: a failed insert leaves the week empty.
  await failsOn('fl-190', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // Insert first, then delete: the new rows are deleted too.
  await failsOn('fl-190', 'The delete comes before the insert', (d) => {
    one(d, 'try').steps.reverse()
  })
  // No handler: a failed file is read again on every poll.
  await failsOn('fl-190', 'Run: The insert fails', (d) => {
    d.flows[0].errorHandlers = []
  })
  // The delete keeps rows already from this run.
  await passes('fl-190', (d) => {
    const del = one(d, 'db-delete')
    del.config.sql = 'DELETE FROM forecast_staging WHERE forecast_week = :week AND run_id <> :runId'
    del.config.inputParameters = '#[{ week: vars.week, runId: vars.runId }]'
  })

  // FL-191
  // No handler: one bad file stops every grower after it.
  await failsOn('fl-191', 'Run: One grower sends a bad quantity', (d) => {
    one(d, 'try').errorHandlers = []
  })
  // Inactive growers are read too.
  await failsOn('fl-191', 'Run: Two active growers have sent stock', (d) => {
    one(d, 'db-select').config.sql = 'SELECT grower_id FROM growers ORDER BY grower_id'
  })
  // No ORDER BY.
  await passes('fl-191', (d) => {
    one(d, 'db-select').config.sql = 'SELECT grower_id FROM growers WHERE active = 1'
  })

  // FL-192
  // A correction only adds rows: the old readings stay.
  await failsOn('fl-192', 'Run: A corrected file', (d) => {
    const t = all(d, 'try')[1]
    t.steps = t.steps.filter((n) => n.type !== 'db-delete')
  })
  // Every known name treated as a correction: a repeat is loaded again.
  await failsOn('fl-192', 'Run: The same file again', (d) => {
    one(d, 'choice').routes[1].config.expression = '#[false]'
  })
  // The size test written the other way round.
  await passes('fl-192', (d) => {
    one(d, 'choice').routes[1].config.expression = '#[vars.fileSize == vars.seen[0].file_size]'
  })

  // FL-193
  // The control file written first: the platform starts on a missing data file.
  await failsOn('fl-193', 'before the control file', (d) => {
    const [data, ctl] = all(d, 'sftp-write')
    ;[data.config.path, ctl.config.path] = [ctl.config.path, data.config.path]
  })
  // Rows marked sent before the files are written.
  await failsOn('fl-193', 'Run: The SFTP server is down', (d) => {
    const o = one(d, 'choice').otherwise
    const update = o.pop()
    o.splice(o.findIndex((n) => n.type === 'set-payload'), 1)
    o.unshift(update)
  })
  // A quarter of an hour later.
  await passes('fl-193', (d) => {
    d.flows[0].source.config.expression = '0 45 2 * * ?'
  })

  // FL-194
  // The whole file in memory.
  await failsOn('fl-194', 'does not keep the whole file in memory', (d) => {
    d.flows[0].source.config.streamingStrategy = 'repeatable-in-memory-stream'
  })
  // No report from On Complete.
  await failsOn('fl-194', 'On Complete logs', (d) => {
    one(d, 'batch-job').onComplete = []
  })
  // A non repeatable stream, read once by the job.
  await passes('fl-194', (d) => {
    d.flows[0].source.config.streamingStrategy = 'non-repeatable-stream'
  })

  // FL-195
  // Any newer number is applied: 43 goes before 42.
  await failsOn('fl-195', 'Run: A gap in the numbers', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[vars.file.seq > vars.lastSeq]'
  })
  // No replay route: an old file waits for ever.
  await failsOn('fl-195', 'Run: An old file is sent again', (d) => {
    one(d, 'choice').routes.splice(1, 1)
  })
  // lastSeq not moved inside the loop: 42 waits for the next run.
  await failsOn('fl-195', 'Run: Two files in order', (d) => {
    const r = one(d, 'choice').routes[0]
    r.steps = r.steps.filter((n) => !(n.type === 'set-variable' && n.config.variableName === 'lastSeq'))
  })
  // orderBy with $.
  await passes('fl-195', (d) => {
    const t = one(d, 'transform')
    t.config.script = t.config.script.replace('orderBy ((f) -> f.seq)', 'orderBy $.seq')
  })

  // FL-196
  // A missing trailer counts as a pass.
  await failsOn('fl-196', 'Run: The file has no trailer', (d) => {
    const t = one(d, 'transform')
    t.config.script = t.config.script.replace('ok: trailer != null and expected == sizeOf(details)', 'ok: trailer == null or expected == sizeOf(details)')
  })
  // No check at all.
  await failsOn('fl-196', 'Run: The trailer disagrees', (d) => {
    one(d, 'choice').routes[0].config.expression = '#[true]'
  })
  // No ACK for a rejected file.
  await failsOn('fl-196', 'An ACK file is written to /bureau/ack for both outcomes', (d) => {
    const c = one(d, 'choice')
    c.otherwise = c.otherwise.filter((n) => n.type !== 'sftp-write')
  })
  // The file moved before the ACK is written.
  await passes('fl-196', (d) => {
    const s = one(d, 'choice').routes[0].steps
    const n = s.length
    ;[s[n - 2], s[n - 1]] = [s[n - 1], s[n - 2]]
  })

  // FL-197
  // The response written before the commit.
  await failsOn('fl-197', 'after the commit', (d) => {
    const s = d.flows[0].steps
    const t = s.findIndex((n) => n.type === 'try')
    const [resp, write] = s.splice(t + 1, 2)
    s.splice(t, 0, resp, write)
  })
  // Quantity not checked: a zero line is staged.
  await failsOn('fl-197', 'Run: Good and bad lines', (d) => {
    const t = one(d, 'transform', (x) => x.config.variableName === 'checked')
    t.config.script = t.config.script.replace('else if ((r.qty as Number default 0) <= 0) "QTY_NOT_POSITIVE" ', '')
  })
  // No transaction around the staging and the file record.
  await failsOn('fl-197', 'one transaction', (d) => {
    one(d, 'try').config.transactionalAction = 'INDIFFERENT'
  })
  // Suppliers read in order.
  await passes('fl-197', (d) => {
    one(d, 'db-select').config.sql = 'SELECT supplier_id FROM suppliers WHERE active = 1 ORDER BY supplier_id'
  })

  // FL-198
  // The ACK update ignores the status.
  await failsOn('fl-198', "Only orders still SENT", (d) => {
    one(d, 'db-update').config.sql = "UPDATE orders SET status = 'ACKED' WHERE order_id = :orderId"
  })
  // Written under the final name: the 3PL can take half a file.
  await failsOn('fl-198', '.tmp name and renamed', (d) => {
    const r = flowOf(d, 'send').steps[1].routes[0]
    one(d, 'sftp-write').config.path = '#["/to3pl/orders/ORD_" ++ vars.stamp ++ ".csv"]'
    r.steps = r.steps.filter((n) => n.type !== 'sftp-rename')
  })
  // No Choice: an empty email every half hour.
  await failsOn('fl-198', 'Run: Nothing is overdue', (d) => {
    const f = flowOf(d, 'overdue')
    const c = f.steps.find((n) => n.type === 'choice')
    f.steps.splice(f.steps.indexOf(c), 1, ...c.routes[0].steps)
  })
  // The overdue check every 15 minutes.
  await passes('fl-198', (d) => {
    flowOf(d, 'overdue').source.config.frequency = 15
  })
}
