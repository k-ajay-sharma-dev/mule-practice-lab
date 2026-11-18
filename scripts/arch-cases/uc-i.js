// Wrong and other correct diagrams for use cases batch I (uc-141 to uc-150). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // UC-141
  // No client ID policy: unknown sites book tables.
  await failsOn('uc-141', 'Run: A caller with no client ID', (d) => set(d, 'gw', { auth: undefined }))
  // The partners call the Experience API around the gateway.
  await failsOn('uc-141', 'reached only through the gateway', (d) => draw(d, 'ptn -> exp'))
  // The Experience API calls the booking system directly.
  await failsOn('uc-141', 'only through a System API', (d) => draw(d, 'exp -> tbs'))
  // The APIs on the smallest size cannot take a Friday evening.
  await failsOn('uc-141', 'Run: Friday evening', (d) => {
    set(d, 'exp', { vCores: undefined })
    set(d, 'sys', { vCores: undefined })
  })
  // A rate limit on the gateway as well, and other names.
  await passes('uc-141', (d) => {
    set(d, 'gw', { rateLimit: 200 })
    rename(d, 'exp', 'exp-restaurant-partners')
  })

  // UC-142
  // A queue instead of a topic: each warning reaches only one of the three systems.
  await failsOn('uc-142', 'Run: A stormy morning', (d) => {
    const t = d.nodes.find((n) => n.id === 't')
    t.type = 'queue'
  })
  // No redelivery limit: an unreadable warning is tried for ever.
  await failsOn('uc-142', 'Run: A warning that cannot be read', (d) => set(d, 't', { maxRedelivery: undefined }))
  // A limit of 5: good warnings go to the DLQ while the lift system restarts.
  await failsOn('uc-142', 'Run: The lift control system is down for 20 minutes', (d) => set(d, 't', { maxRedelivery: 5 }))
  // No DLQ.
  await failsOn('uc-142', 'has a dead-letter queue', (d) => unbox(d, 'dlq'))
  // The Experience API also calls the lift system directly.
  await failsOn('uc-142', 'only through a System API', (d) => draw(d, 'exp -> lift'))
  // A limit of 90 and other names.
  await passes('uc-142', (d) => {
    set(d, 't', { maxRedelivery: 90 })
    rename(d, 't', 'resort-weather-warnings')
  })

  // UC-143
  // No token check: scripts post reports.
  await failsOn('uc-143', 'Run: A report without a token', (d) => set(d, 'gw', { auth: undefined }))
  // No queue: reports fail while the works system is off.
  await failsOn('uc-143', 'Run: The works system is off for the night', (d) => {
    unbox(d, 'q')
    unbox(d, 'dlq')
    draw(d, 'prc -> wrk')
  })
  // A limit of 30: good reports go to the DLQ during the backup.
  await failsOn('uc-143', 'Run: The works system is off for the night', (d) => set(d, 'q', { maxRedelivery: 30 }))
  // The app calls the Experience API around the gateway.
  await failsOn('uc-143', 'reached only through the gateway', (d) => draw(d, 'app -> exp'))
  // The Experience API creates the job itself while the resident waits.
  await failsOn('uc-143', 'The app never waits on the works system', (d) => draw(d, 'exp -> sysW'))
  // A longer limit, and other names.
  await passes('uc-143', (d) => {
    set(d, 'q', { maxRedelivery: 480 })
    rename(d, 'fs', 'Photo storage bucket')
  })

  // UC-144
  // The boards asked one after another: a search takes nearly two seconds.
  await failsOn('uc-144', 'Run: Booking opens for a new age group', (d) => set(d, 'prc', { calls: undefined }))
  // No partial answer: a hanging board fails every search.
  await failsOn('uc-144', 'Run: The south board\'s system hangs', (d) => set(d, 'prc', { onFailure: undefined }))
  // The default ten second timeout: searches wait far past the budget.
  await failsOn('uc-144', 'Run: The south board\'s system hangs', (d) => set(d, 'prc', { timeoutMs: undefined }))
  // One System API for all three boards.
  await failsOn('uc-144', 'Each System API calls one booking system', (d) => {
    unbox(d, 'sysN')
    unbox(d, 'sysC')
    draw(d, 'sysS -> n', 'sysS -> c')
  })
  // The Process API calls a board directly.
  await failsOn('uc-144', 'only through a System API', (d) => draw(d, 'prc -> s'))
  // A 1.2 second timeout and two replicas of the Process API.
  await passes('uc-144', (d) => set(d, 'prc', { timeoutMs: 1200, replicas: 2 }))

  // UC-145
  // No cache: the screens swamp the database.
  await failsOn('uc-145', 'Run: A busy winter morning', (d) => unbox(d, 'c'))
  // The bed status API calls the national service itself: its outage fails the tablets.
  await failsOn('uc-145', 'Run: The national service is down for two hours', (d) => draw(d, 'expW -> sysN'))
  // One replica for the screens API: a zone outage blanks the board.
  await failsOn('uc-145', 'Run: An availability zone goes down', (d) => set(d, 'expB', { replicas: 1 }))
  // The screens read through the bed status API, the write path.
  await failsOn('uc-145', 'never wait on the national service', (d) => draw(d, 'scr -> expW'))
  // Three replicas for the screens API, and other names.
  await passes('uc-145', (d) => {
    set(d, 'expB', { replicas: 3 })
    rename(d, 't', 'bed-changes')
  })

  // UC-146
  // No queue: the 18:00 burst swamps the ERP.
  await failsOn('uc-146', 'Run: The evening return to the depot', (d) => {
    unbox(d, 'q')
    unbox(d, 'dlq')
    draw(d, 'exp -> prc')
  })
  // The Experience API on the smallest size cannot take the burst.
  await failsOn('uc-146', 'Run: The evening return to the depot', (d) => set(d, 'exp', { replicas: undefined, vCores: undefined }))
  // No redelivery limit: refused records are tried for ever.
  await failsOn('uc-146', 'Run: A record for a farm that left the co-op', (d) => set(d, 'q', { maxRedelivery: undefined }))
  // The tablets call the ERP's System API directly.
  await failsOn('uc-146', 'The tablets never wait on the ERP', (d) => draw(d, 'exp -> sys'))
  // One replica of 1 vCore, and a limit of 45 deliveries.
  await passes('uc-146', (d) => {
    set(d, 'exp', { replicas: 1, vCores: '1' })
    set(d, 'q', { maxRedelivery: 45 })
  })

  // UC-147
  // The smallest size: threads run out on a normal morning.
  await failsOn('uc-147', 'Run: A Monday morning', (d) => {
    for (const id of ['exp', 'prc', 'sys']) set(d, id, { replicas: undefined, vCores: undefined })
  })
  // No timeout: a 15 second bureau holds every thread.
  await failsOn('uc-147', 'Run: The bureau slows to 15 seconds', (d) => {
    set(d, 'prc', { timeoutMs: undefined })
    set(d, 'sys', { timeoutMs: undefined })
  })
  // No referral: a slow bureau gives errors instead of an answer.
  await failsOn('uc-147', 'Run: The bureau slows to 15 seconds', (d) => set(d, 'prc', { onFailure: undefined }))
  // One replica each: a zone outage stops the decisions.
  await failsOn('uc-147', 'Run: An availability zone goes down', (d) => {
    for (const id of ['exp', 'prc', 'sys']) set(d, id, { replicas: 1, vCores: '1' })
  })
  // No client ID policy: unknown platforms run up the bill.
  await failsOn('uc-147', 'Run: A platform without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  // Two replicas of 1 vCore each, and a 5 second timeout.
  await passes('uc-147', (d) => {
    for (const id of ['exp', 'prc', 'sys']) set(d, id, { vCores: '1' })
    set(d, 'prc', { timeoutMs: 5000 })
  })

  // UC-148
  // No cache: owners use up the mainframe.
  await failsOn('uc-148', 'Run: An ordinary day', (d) => unbox(d, 'c'))
  // No rate limit: the news spike swamps the mainframe and the dealers with it.
  await failsOn('uc-148', 'Run: A recall on the evening news', (d) => set(d, 'expP', { rateLimit: undefined }))
  // No client ID policy on the dealer path.
  await failsOn('uc-148', 'Run: A dealer system without a client ID', (d) => set(d, 'gw', { auth: undefined }))
  // Dealers sent to the public API.
  await failsOn('uc-148', 'dealer Experience API is reached only through the gateway', (d) => {
    unbox(d, 'expD')
    draw(d, 'gw -> expP')
  })
  // A two hour cache, and other names.
  await passes('uc-148', (d) => {
    set(d, 'c', { ttlSec: 7200 })
    rename(d, 'expD', 'exp-dealer-recall-check')
  })

  // UC-149
  // A non-persistent queue: a broker restart loses answer sheets.
  await failsOn('uc-149', 'Run: The broker restarts with a backlog', (d) => set(d, 'q', { persistent: 'no' }))
  // One replica of the Experience API: a zone outage at 12:00 fails the rush.
  await failsOn('uc-149', 'Run: An availability zone goes down at the deadline', (d) => set(d, 'exp', { replicas: 1 }))
  // No queue: the answer store is swamped at the deadline.
  await failsOn('uc-149', 'Run: The 12:00 deadline', (d) => {
    unbox(d, 'q')
    unbox(d, 'dlq')
    draw(d, 'exp -> prc')
  })
  // No token check.
  await failsOn('uc-149', 'Run: A submission without a token', (d) => set(d, 'gw', { auth: undefined }))
  // The Experience API saves straight into the store as well as queueing.
  await failsOn('uc-149', 'Students never wait on the answer store', (d) => draw(d, 'exp -> sys'))
  // Three replicas of the Experience API, and a limit of 60 deliveries.
  await passes('uc-149', (d) => {
    set(d, 'exp', { replicas: 3 })
    set(d, 'q', { maxRedelivery: 60 })
  })

  // UC-150
  // No cache: the lookers swamp the slot system.
  await failsOn('uc-150', 'Run: Christmas slots open at 08:00', (d) => unbox(d, 'c'))
  // 2 vCores per replica: one zone cannot take the rush.
  await failsOn('uc-150', 'Run: A zone goes down in the rush', (d) => set(d, 'exp', { vCores: '2' }))
  // No timeout and no partial answer: a slow slot system makes every page spin.
  await failsOn('uc-150', 'Run: The slot system slows to 12 seconds', (d) => set(d, 'exp', { timeoutMs: undefined, onFailure: undefined }))
  // The Experience API calls the slot system directly.
  await failsOn('uc-150', 'only through a System API', (d) => draw(d, 'exp -> wms'))
  // A 30 second cache and three replicas of the booking Process API.
  await passes('uc-150', (d) => {
    set(d, 'c', { ttlSec: 30 })
    set(d, 'prc', { replicas: 3 })
  })
}
