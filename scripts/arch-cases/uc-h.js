// Wrong and other correct diagrams for use cases batch H (uc-136 to uc-140). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // UC-136
  // No cache: every check reaches the platform, which refuses what is over 50 a second.
  await failsOn('uc-136', 'Run: The 06:00 rush', (d) => unbox(d, 'c'))
  // The same, seen in the drawing.
  await failsOn('uc-136', 'The Experience API reads a cache', (d) => unbox(d, 'c'))
  // The turnstiles call the platform directly.
  await failsOn('uc-136', 'only through a System API', (d) => draw(d, 'gate -> mem'))
  // A cache with no time to live keeps nothing.
  await failsOn('uc-136', 'Run: The membership platform is down for 10 minutes', (d) => set(d, 'c', { ttlSec: 0 }))
  // The Experience API on the smallest size.
  await failsOn('uc-136', 'Run: The 06:00 rush', (d) => set(d, 'exp', { vCores: undefined }))
  // Two replicas of 0.5 vCore, and other names.
  await passes('uc-136', (d) => {
    set(d, 'exp', { replicas: 2 })
    rename(d, 'c', 'Member access cache')
  })

  // UC-137
  // No client authentication at the gateway.
  await failsOn('uc-137', 'Run: A caller with no certificate', (d) => set(d, 'gw', { auth: undefined }))
  // The surgeries call the Experience API around the gateway.
  await failsOn('uc-137', 'reached only through the gateway', (d) => draw(d, 'gp -> exp'))
  // The Experience API writes to the dispensing system while the surgery waits.
  await failsOn('uc-137', 'No GP system waits on the dispensing system', (d) => draw(d, 'exp -> sys'))
  // A redelivery limit of 10: good prescriptions go to the DLQ during the patch window.
  await failsOn('uc-137', 'Run: The dispensing system is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // No redelivery limit: an unknown drug code is tried for ever.
  await failsOn('uc-137', 'Run: A drug code the pharmacy does not know', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // No DLQ.
  await failsOn('uc-137', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A limit of 45 deliveries, a rate limit on the gateway and other names.
  await passes('uc-137', (d) => {
    set(d, 'q', { maxRedelivery: 45 })
    set(d, 'gw', { rateLimit: 200 })
    rename(d, 'gw', 'Partner gateway (mutual TLS)')
  })

  // UC-138
  // One subscriber updates all three systems: the badge outage holds up the directory and payroll.
  await failsOn('uc-138', 'Run: The badge system is down all afternoon', (d) => {
    unbox(d, 'subB')
    unbox(d, 'subP')
    draw(d, 'subD -> sysB', 'subD -> sysP')
  })
  // The same, seen in the drawing.
  await failsOn('uc-138', 'No subscriber calls more than one System API', (d) => draw(d, 'subD -> sysB'))
  // The HR flow calls the badge system itself.
  await failsOn('uc-138', 'never waits on the badge system', (d) => draw(d, 'exp -> sysB'))
  // A redelivery limit of 60: leavers' badges go to the DLQ during a 3 hour outage.
  await failsOn('uc-138', 'Run: The badge system is down all afternoon', (d) => set(d, 't', { maxRedelivery: 60 }))
  // No redelivery limit: a broken record is tried for ever.
  await failsOn('uc-138', 'Run: A leaver record that cannot be read', (d) => set(d, 't', { maxRedelivery: undefined }))
  // No DLQ.
  await failsOn('uc-138', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // A fourth subscriber for the laptop asset register.
  await passes('uc-138', (d) => {
    box(d, 'subA', 'process-api', 'prc-leaver-assets')
    box(d, 'sysA', 'system-api', 'sys-asset-register')
    box(d, 'assets', 'saas', 'Asset register')
    draw(d, 't ~> subA', 'subA -> sysA', 'sysA -> assets')
  })

  // UC-139
  // One consumer for both: an airline outage stops bag status too.
  await failsOn('uc-139', 'Run: The airline systems are down for half an hour', (d) => {
    unbox(d, 'prcA')
    draw(d, 'prcS -> sysA')
  })
  // The same, seen in the drawing.
  await failsOn('uc-139', 'The bag status writer never waits on an airline', (d) => draw(d, 'prcS -> sysA'))
  // No cache: the passengers flood the database.
  await failsOn('uc-139', 'Run: Morning departures', (d) => unbox(d, 'c'))
  // The passenger API on the smallest size.
  await failsOn('uc-139', 'Run: Morning departures', (d) => set(d, 'expP', { replicas: undefined, vCores: undefined }))
  // The scanner API calls the database through the System API while the scanner waits.
  await failsOn('uc-139', 'only through a System API', (d) => draw(d, 'expS -> db'))
  // A longer time to live, and a monitoring box for the airline consumer's lag.
  await passes('uc-139', (d) => {
    set(d, 'c', { ttlSec: 60 })
    box(d, 'mon', 'monitoring', 'Consumer lag alerts')
    draw(d, 'prcA -> mon')
  })

  // UC-140
  // The default 10 second timeout: during the slow spell the app waits 8 seconds.
  await failsOn('uc-140', 'Run: The card processor slows to 8 seconds', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // No pending queue: an outage fails every freeze.
  await failsOn('uc-140', 'Run: The card processor is down for 20 minutes', (d) => {
    unbox(d, 'q')
    unbox(d, 'dlq')
  })
  // No token check at the gateway.
  await failsOn('uc-140', 'Run: A call with no token', (d) => set(d, 'gw', { auth: undefined }))
  // A redelivery limit of 10: freezes go to the DLQ during a 20 minute outage.
  await failsOn('uc-140', 'Run: The card processor is down for 20 minutes', (d) => set(d, 'q', { maxRedelivery: 10 }))
  // The pending queue drawn as sync lines.
  await failsOn('uc-140', 'puts unfinished freezes on a queue', (d) => swap(d, 'prc ~> q'))
  // The app calls the Experience API around the gateway.
  await failsOn('uc-140', 'reached only through the gateway', (d) => draw(d, 'app -> exp'))
  // A one second timeout, and other names.
  await passes('uc-140', (d) => {
    set(d, 'prc', { timeoutMs: 1000 })
    rename(d, 'q', 'card-controls-retry')
  })
}
