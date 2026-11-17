// Wrong and other correct diagrams for use cases batch G (uc-131 to uc-135). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // UC-131
  // The trackers write straight to the database through the Experience API.
  await failsOn('uc-131', 'Positions wait on a queue before they are saved', (d) => {
    cut(d, 'expT ~> q')
    draw(d, 'expT -> db')
  })
  // Parents and trackers share one Experience API.
  await failsOn('uc-131', 'each have their own Experience API', (d) => {
    unbox(d, 'expP')
    draw(d, 'app -> expT', 'expT -> sys')
  })
  // The parents' app reads through the queue's consumer.
  await failsOn('uc-131', 'never goes through the queue', (d) => draw(d, 'expP ~> q'))
  // The line into the queue drawn as a sync call.
  await failsOn('uc-131', 'Every line to or from a queue is an async message', (d) => swap(d, 'expT ~> q'))
  // The parents' path on the smallest size cannot take 400 reads a second.
  await failsOn('uc-131', 'Run: The morning school run', (d) => {
    set(d, 'expP', { vCores: undefined })
    set(d, 'sys', { vCores: undefined })
  })
  // A cache in front of the positions, and other names.
  await passes('uc-131', (d) => {
    box(d, 'c', 'cache', 'Latest position cache', { ttlSec: 5 })
    draw(d, 'expP -> c')
    rename(d, 'q', 'gps-positions')
  })

  // UC-132
  // One subscriber calls all three targets: a slow Vendor B holds up the others.
  await failsOn('uc-132', 'three subscribers', (d) => {
    unbox(d, 'subB')
    unbox(d, 'subW')
    draw(d, 'subA -> sysB', 'subA -> sysW')
  })
  // The ERP calls a label cloud itself.
  await failsOn('uc-132', 'never waits on a label cloud', (d) => draw(d, 'erp -> sysA'))
  // No DLQ.
  await failsOn('uc-132', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A redelivery limit of 5 sends Vendor A's waiting copies to the DLQ during its outage.
  await failsOn('uc-132', 'Run: Vendor A is down for 30 minutes', (d) => set(d, 't', { maxRedelivery: 5 }))
  // No redelivery limit: refused changes are tried for ever.
  await failsOn('uc-132', 'Run: Products with no label', (d) => set(d, 't', { maxRedelivery: undefined }))
  // The publisher on the smallest size cannot take the 06:00 run.
  await failsOn('uc-132', 'Run: The 06:00 price run', (d) => set(d, 'pub', { vCores: undefined }))
  // A fourth subscriber for the price history, with its own store.
  await passes('uc-132', (d) => {
    box(d, 'subH', 'process-api', 'prc-price-history')
    box(d, 'hist', 'data-warehouse', 'Price history')
    draw(d, 't ~> subH', 'subH -> hist')
  })

  // UC-133
  // The boards call the Experience API around the gateway.
  await failsOn('uc-133', 'reached only through the gateway', (d) => draw(d, 'jb -> exp'))
  // The Experience API calls the hiring system while the board waits.
  await failsOn('uc-133', 'No job board waits on the hiring system', (d) => draw(d, 'exp -> sys'))
  // No DLQ.
  await failsOn('uc-133', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // No rate limit: the broken board's loop reaches Mule.
  await failsOn('uc-133', 'Run: A board stuck in a retry loop', (d) => set(d, 'gw', { rateLimit: undefined }))
  // No redelivery limit: an unreadable CV is tried for ever.
  await failsOn('uc-133', 'Run: A CV the hiring system cannot read', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The Experience API on the smallest size.
  await failsOn('uc-133', 'Run: Monday morning', (d) => set(d, 'exp', { vCores: undefined }))
  // A tighter rate limit of 90 and a monitoring box on the DLQ.
  await passes('uc-133', (d) => {
    set(d, 'gw', { rateLimit: 90 })
    box(d, 'mon', 'monitoring', 'DLQ alerts')
    draw(d, 'prc -> mon')
  })

  // UC-134
  // Guests share the partner gateway's Experience API.
  await failsOn('uc-134', 'each have their own Experience API', (d) => {
    unbox(d, 'expG')
    draw(d, 'app -> expP')
  })
  // Partners call the partner Experience API around the gateway.
  await failsOn('uc-134', 'never reach an Experience API around the gateway', (d) => draw(d, 'ptn -> expP'))
  // Sensor events written straight to the System API.
  await failsOn('uc-134', 'through an event stream', (d) => {
    cut(d, 'expS ~> es')
    draw(d, 'expS -> sys')
  })
  // No cache: guests flood the database.
  await failsOn('uc-134', 'Run: Opening time', (d) => {
    unbox(d, 'c')
  })
  // No rate limit for partners.
  await failsOn('uc-134', 'Run: A partner\'s app polls in a loop', (d) => set(d, 'gw', { rateLimit: undefined }))
  // The guest Experience API on the smallest size.
  await failsOn('uc-134', 'Run: Opening time', (d) => set(d, 'expG', { replicas: undefined, vCores: undefined }))
  // Two caches, one per channel, and a longer time to live for partners.
  await passes('uc-134', (d) => {
    cut(d, 'expP -> c')
    box(d, 'c2', 'cache', 'Partner feed cache', { ttlSec: 120 })
    draw(d, 'expP -> c2')
  })

  // UC-135
  // The digital Experience API calls the claims core while the customer waits.
  await failsOn('uc-135', 'No customer or agent waits on the claims core', (d) => draw(d, 'expD -> sysC'))
  // The policy is checked in the core.
  await failsOn('uc-135', 'checked in a policy copy', (d) => {
    unbox(d, 'sysP')
    unbox(d, 'pol')
    draw(d, 'fnol -> sysC')
  })
  // The call centre has its own Process API.
  await failsOn('uc-135', 'call the same claims Process API', (d) => {
    cut(d, 'expA -> fnol')
    box(d, 'fnolA', 'process-api', 'prc-agent-claims')
    draw(d, 'expA -> fnolA', 'fnolA ~> q')
  })
  // No DLQ.
  await failsOn('uc-135', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A redelivery limit of 10 sends good claims to the DLQ during an hour's outage.
  await failsOn('uc-135', 'Run: The claims core is down during the storm', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // The accepting side on the smallest size cannot take the storm.
  await failsOn('uc-135', 'Run: The storm', (d) => {
    set(d, 'expD', { vCores: undefined })
    set(d, 'fnol', { vCores: undefined })
  })
  // A notification System API for the claim SMS, and other names.
  await passes('uc-135', (d) => {
    box(d, 'sysN', 'system-api', 'sys-sms')
    box(d, 'sms', 'notification', 'SMS provider')
    draw(d, 'intake -> sysN', 'sysN -> sms')
    rename(d, 'q', 'fnol-claims')
  })
}
