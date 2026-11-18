// Wrong and other correct diagrams for use cases batch M (uc-187 to uc-198): Oracle and email. See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, draw, unbox, rename, set }) => {
  // UC-187
  // No retries: a failover gives the store app errors.
  await failsOn('uc-187', 'Run: Oracle fails over', (d) => set(d, 'sys', { retries: undefined }))
  // The store app calls the System API directly.
  await failsOn('uc-187', 'never calls Oracle or the System API directly', (d) => draw(d, 'app -> sys'))
  // The Experience API reads Oracle itself.
  await failsOn('uc-187', 'Oracle is reached only through a System API', (d) => draw(d, 'exp -> ora'))
  // Three retries and other names.
  await passes('uc-187', (d) => {
    set(d, 'sys', { retries: 3 })
    rename(d, 'ora', 'Store stock Oracle')
  })

  // UC-188
  // A limit of 5: good documents go to the DLQ during Oracle patching.
  await failsOn('uc-188', 'Run: Oracle patching', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No limit: a document that can never load circles for ever.
  await failsOn('uc-188', 'Run: A document that can never load', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The adapter reads the container directly.
  await failsOn('uc-188', 'reads the blob through a System API', (d) => {
    cut(d, 'prc -> sysB')
    draw(d, 'prc -> blob')
  })
  // No DLQ.
  await failsOn('uc-188', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A limit of 120 and longer timeouts.
  await passes('uc-188', (d) => {
    set(d, 'q', { maxRedelivery: 120 })
    set(d, 'prc', { timeoutMs: 60000 })
  })

  // UC-189
  // Dashboards read the primary.
  await failsOn('uc-189', 'Dashboards never reach the Oracle primary', (d) => draw(d, 'sysR -> pri'))
  // The dashboards Experience API reads the standby itself.
  await failsOn('uc-189', 'Each Oracle database is reached only through a System API', (d) => draw(d, 'expD -> stb'))
  // The smallest dashboards Experience API cannot take Monday morning.
  await failsOn('uc-189', 'Run: Monday morning', (d) => set(d, 'expD', { vCores: undefined }))
  // Two replicas of one vCore each.
  await passes('uc-189', (d) => {
    set(d, 'expD', { replicas: 2 })
    set(d, 'sysR', { replicas: 2 })
  })

  // UC-190
  // The job writes to Oracle through the System API, skipping the queue.
  await failsOn('uc-190', 'never writes to Oracle without the queue', (d) => draw(d, 'job -> sysP'))
  // A limit of 2: rows go to the DLQ while Oracle restarts.
  await failsOn('uc-190', 'Run: Oracle restarts mid load', (d) => set(d, 'q', { maxRedelivery: 2 }))
  // The tills write Oracle directly.
  await failsOn('uc-190', 'Oracle is reached only through System APIs', (d) => draw(d, 'pos -> ora'))
  // A limit of 60 and other names.
  await passes('uc-190', (d) => {
    set(d, 'q', { maxRedelivery: 60 })
    rename(d, 'job', 'nightly plan loader')
  })

  // UC-191
  // The checkout writes Oracle while the shopper waits.
  await failsOn('uc-191', 'A checkout never waits on Oracle', (d) => draw(d, 'exp -> sys'))
  // One replica: a zone outage stops checkout.
  await failsOn('uc-191', 'Run: A zone goes down', (d) => set(d, 'exp', { replicas: undefined }))
  // No DLQ.
  await failsOn('uc-191', 'The queue has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A limit of 60 and three replicas.
  await passes('uc-191', (d) => {
    set(d, 'q', { maxRedelivery: 60 })
    set(d, 'exp', { replicas: 3 })
  })

  // UC-192
  // The outbound job reads the container directly.
  await failsOn('uc-192', 'The outbound job writes files through the blob System API', (d) => {
    cut(d, 'out -> sysB')
    draw(d, 'out -> blob')
  })
  // The inbound adapter sends email too.
  await failsOn('uc-192', 'Only the report job sends email', (d) => draw(d, 'inb -> mail'))
  // A limit of 5: good documents go to the DLQ during Oracle patching.
  await failsOn('uc-192', 'Run: Oracle patching', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // The default timeout: slow blob uploads fail.
  await failsOn('uc-192', 'Run: Blob storage is slow', (d) => set(d, 'sysB', { timeoutMs: undefined }))
  // The platform never notifies a queue.
  await failsOn('uc-192', 'The platform notifies a queue', (d) => cut(d, 'plat ~> q'))
  // A limit of 120 and other names.
  await passes('uc-192', (d) => {
    set(d, 'q', { maxRedelivery: 120 })
    rename(d, 'rep', 'daily report job')
  })

  // UC-193
  // The checkout sends the email itself.
  await failsOn('uc-193', 'A checkout never waits on the mail relay', (d) => draw(d, 'exp -> mail'))
  // A limit of 5: confirmations go to the DLQ while the relay is down.
  await failsOn('uc-193', 'Run: The relay is down for half an hour', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // No limit: refused addresses circle for ever.
  await failsOn('uc-193', 'Run: Addresses the relay refuses', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // A limit of 60 and other names.
  await passes('uc-193', (d) => {
    set(d, 'q', { maxRedelivery: 60 })
    rename(d, 'prc', 'prc-confirmation-mailer')
  })

  // UC-194
  // The job sends each notice itself.
  await failsOn('uc-194', 'The job never sends to the relay directly', (d) => draw(d, 'job -> mail'))
  // A limit of 10: notices go to the DLQ during maintenance.
  await failsOn('uc-194', 'Run: Relay maintenance during the run', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No limit: closed stores' notices circle for ever.
  await failsOn('uc-194', 'Run: Closed stores', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // A limit of 90.
  await passes('uc-194', (d) => set(d, 'q', { maxRedelivery: 90 }))

  // UC-195
  // The adapter sends the report while the load waits.
  await failsOn('uc-195', 'The inbound adapter never waits on the mail relay', (d) => draw(d, 'inb -> mail'))
  // A reports limit of 10: reports go to the DLQ during the relay outage.
  await failsOn('uc-195', 'Run: The mail relay is down for an hour', (d) => set(d, 'qRep', { maxRedelivery: 10 }))
  // No inbound limit: broken documents circle for ever.
  await failsOn('uc-195', 'Run: Documents that can never load', (d) => set(d, 'qIn', { maxRedelivery: undefined }))
  // No DLQ on the reports queue.
  await failsOn('uc-195', 'Every queue has a dead-letter queue', (d) => unbox(d, 'dRep'))
  // Other limits and names.
  await passes('uc-195', (d) => {
    set(d, 'qIn', { maxRedelivery: 45 })
    set(d, 'qRep', { maxRedelivery: 120 })
    rename(d, 'rep', 'job-report-service')
  })

  // UC-196
  // The collector writes Oracle itself.
  await failsOn('uc-196', 'The collector never writes to Oracle', (d) => draw(d, 'col -> sysO'))
  // The collector writes the container directly.
  await failsOn('uc-196', 'Attachments are stored in blob storage through a System API', (d) => draw(d, 'col -> blob'))
  // The default timeout: large drawings fail.
  await failsOn('uc-196', 'Run: Month end drawings', (d) => set(d, 'sysB', { timeoutMs: undefined }))
  // A limit of 10: documents go to the DLQ during the Oracle outage.
  await failsOn('uc-196', 'Run: Oracle is down', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // Longer timeouts and a limit of 90.
  await passes('uc-196', (d) => {
    set(d, 'q', { maxRedelivery: 90 })
    set(d, 'sysB', { timeoutMs: 40000 })
    set(d, 'col', { timeoutMs: 50000 })
    set(d, 'prc', { timeoutMs: 50000 })
  })

  // UC-197
  // No rate limit: the campaign takes the whole relay and resets wait.
  await failsOn('uc-197', 'Run: Campaign day', (d) => set(d, 'prcB', { rateLimit: undefined }))
  // One queue for both: campaign emails share the transactional queue.
  await failsOn('uc-197', 'Campaign emails never reach the transactional queue', (d) => draw(d, 'camp ~> qT'))
  // No DLQ on the bulk queue.
  await failsOn('uc-197', 'Every queue has a dead-letter queue', (d) => unbox(d, 'dB'))
  // A lower limit and other names.
  await passes('uc-197', (d) => {
    set(d, 'prcB', { rateLimit: 12 })
    rename(d, 'qT', 'email.transactional.priority')
  })

  // UC-198
  // No client ID policy: an unknown app gets in.
  await failsOn('uc-198', 'Run: An app without its client ID', (d) => set(d, 'gw', { auth: undefined }))
  // No rate limit on the bulk mailer: app notifications wait behind the campaign.
  await failsOn('uc-198', 'Run: Campaign day', (d) => set(d, 'prcB', { rateLimit: undefined }))
  // The Experience API sends the email itself.
  await failsOn('uc-198', 'No caller waits on the mail relay', (d) => draw(d, 'exp -> mail'))
  // The mailers read the suppression list in Oracle directly.
  await failsOn('uc-198', 'Oracle is reached only through a System API', (d) => draw(d, 'prcU -> ora'))
  // Campaigns sent on the urgent queue.
  await failsOn('uc-198', 'never reach the urgent queue', (d) => draw(d, 'camp ~> qU'))
  // A limit of 90 and other names.
  await passes('uc-198', (d) => {
    set(d, 'qU', { maxRedelivery: 90 })
    set(d, 'qB', { maxRedelivery: 90 })
    rename(d, 'camp', 'Marketing campaign tool')
  })
}
