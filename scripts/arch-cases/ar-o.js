// Wrong and other correct diagrams for batch O (ar-140 to ar-144). See scripts/check-arch-strict.js for the helpers.
export default async ({ failsOn, passes, cut, swap, draw, box, unbox, rename, set }) => {
  // AR-140
  // The Process API also calls the carrier, so retries and timeouts live in two places.
  await failsOn('ar-140', 'Only the System API calls the carrier', (d) => draw(d, 'prc -> car'))
  // The quote drawn as a message.
  await failsOn('ar-140', 'every line is a sync call', (d) => swap(d, 'sys -> car'))
  // No retries: 1 quote in 5 fails while the carrier is flaky.
  await failsOn('ar-140', 'Run: The carrier drops 1 call in 5', (d) => set(d, 'sys', { retries: undefined }))
  // The default 10 second timeout: shoppers wait 8 seconds for a price.
  await failsOn('ar-140', 'Run: The carrier is slow for 10 minutes', (d) => set(d, 'sys', { timeoutMs: undefined }))
  // Three retries and a 1 second timeout.
  await passes('ar-140', (d) => set(d, 'sys', { retries: 3, timeoutMs: 1000 }))
  // Monitoring drawn beside the System API, and other names.
  await passes('ar-140', (d) => {
    box(d, 'mon', 'monitoring', 'Carrier error dashboard')
    draw(d, 'sys -> mon')
    rename(d, 'car', 'Parcel carrier pricing API')
  })

  // AR-141
  // The Experience API still calls the generator chain directly.
  await failsOn('ar-141', 'No chain of sync calls', (d) => draw(d, 'exp -> sys'))
  // The Experience API calls the worker over HTTP, with no queue.
  await failsOn('ar-141', 'hands each request to a queue', (d) => {
    cut(d, 'exp ~> q')
    draw(d, 'exp -> wrk')
  })
  // The worker calls the SaaS generator itself.
  await failsOn('ar-141', 'only through a System API', (d) => draw(d, 'wrk -> gen'))
  // Nobody can ask for the status of a job.
  await failsOn('ar-141', 'reads job status', (d) => cut(d, 'exp -> status'))
  // No callback: dealers must poll.
  await failsOn('ar-141', 'calls the dealer back', (d) => cut(d, 'wrk -> dlr'))
  // No dead-letter queue.
  await failsOn('ar-141', 'dead-letter queue', (d) => unbox(d, 'dlq'))
  // The worker keeps the default 10 second timeout and gives up on every 30 second PDF.
  await failsOn('ar-141', 'Run: Month end', (d) => set(d, 'wrk', { timeoutMs: undefined }))
  // A redelivery limit of 5 sends good requests to the DLQ during the maintenance window.
  await failsOn('ar-141', 'Run: The generator is down for 30 minutes', (d) => set(d, 'q', { maxRedelivery: 5 }))
  // Job status in Object Store v2 and PDFs in Azure Blob Storage.
  await passes('ar-141', (d) => {
    d.nodes.find((n) => n.id === 'status').type = 'cache'
    rename(d, 'status', 'Job status (Object Store v2)')
    d.nodes.find((n) => n.id === 'files').type = 'azure-blob'
  })
  // An email to the dealer as well as the callback.
  await passes('ar-141', (d) => {
    box(d, 'mail', 'notification', 'Dealer email')
    draw(d, 'wrk -> mail')
  })

  // AR-142
  // The current design: one queue for everything.
  await failsOn('ar-142', 'separate queue for bulk orders', (d) => {
    unbox(d, 'qB')
    unbox(d, 'dlqB')
    unbox(d, 'prcB')
    draw(d, 'load ~> qU')
  })
  // The urgent consumer also drains the bulk queue.
  await failsOn('ar-142', 'No consumer reads both queues', (d) => draw(d, 'qB ~> prcU'))
  // The app sends large orders to the bulk queue.
  await failsOn('ar-142', 'never puts orders on the bulk queue', (d) => draw(d, 'exp ~> qB'))
  // The loader puts some lines on the urgent queue.
  await failsOn('ar-142', 'never puts orders on the urgent queue', (d) => draw(d, 'load ~> qU'))
  // The loader calls the System API directly.
  await failsOn('ar-142', 'never calls the WMS with sync calls', (d) => draw(d, 'load -> sys'))
  // No DLQ for bulk lines.
  await failsOn('ar-142', 'Every queue has a dead-letter queue', (d) => unbox(d, 'dlqB'))
  // The loader on the smallest size drops half the burst.
  await failsOn('ar-142', 'Run: The 06:00 bulk drop', (d) => set(d, 'load', { vCores: undefined }))
  // No redelivery limit: rejected lines are tried for ever and never reach the DLQ.
  await failsOn('ar-142', 'Run: Some hospital lines are rejected', (d) => set(d, 'qB', { maxRedelivery: undefined }))
  // Other names and a monitoring box.
  await passes('ar-142', (d) => {
    rename(d, 'qU', 'orders-express')
    box(d, 'mon', 'monitoring', 'Queue age alerts')
    draw(d, 'prcU -> mon')
  })
  // Each consumer has its own System API in front of the WMS.
  await passes('ar-142', (d) => {
    box(d, 'sys2', 'system-api', 'sys-wms-bulk-orders')
    cut(d, 'prcB -> sys')
    draw(d, 'prcB -> sys2', 'sys2 -> wms')
  })

  // AR-143
  // Cells B and C share a database.
  await failsOn('ar-143', 'No payroll database is shared', (d) => {
    cut(d, 'prcC -> dbC')
    draw(d, 'prcC -> dbB')
  })
  // Cell A calls into cell B.
  await failsOn('ar-143', 'No cell calls another', (d) => draw(d, 'expA -> prcB'))
  // The app calls a cell directly.
  await failsOn('ar-143', 'Channels never call a cell directly', (d) => draw(d, 'staff -> expB'))
  // The router has no directory to read.
  await failsOn('ar-143', 'reads the tenant directory', (d) => cut(d, 'rtr -> dir'))
  // Three sets of APIs, one shared database: the schema change still takes everyone down.
  await failsOn('ar-143', 'Run: A schema change locks the cell A database', (d) => {
    unbox(d, 'dbB')
    unbox(d, 'dbC')
    draw(d, 'prcB -> dbA', 'prcC -> dbA')
  })
  // A cell on the smallest size cannot carry its third of payday.
  await failsOn('ar-143', 'Run: Payday peak', (d) => set(d, 'expA', { vCores: undefined }))
  // The router is an API gateway.
  await passes('ar-143', (d) => {
    d.nodes.find((n) => n.id === 'rtr').type = 'api-gateway'
  })
  // The tenant directory kept in a database, no monitoring box, and the cells named by region.
  await passes('ar-143', (d) => {
    d.nodes.find((n) => n.id === 'dir').type = 'database'
    d.nodes.find((n) => n.id === 'dir').config = undefined
    rename(d, 'dir', 'Tenant directory database')
    unbox(d, 'mon')
    rename(d, 'dbB', 'Payroll database (cell north)')
  })

  // AR-144
  // A consumer still asks the PIM for details.
  await failsOn('ar-144', 'Only the change publisher talks to the PIM', (d) => draw(d, 'prcW -> pim'))
  // The web shop API calls the PIM on a cache miss.
  await failsOn('ar-144', 'No channel reaches the PIM', (d) => draw(d, 'expW -> pim'))
  // Two consumers share one read copy.
  await failsOn('ar-144', 'No read copy is shared', (d) => {
    cut(d, 'prcS -> dbS')
    draw(d, 'prcS -> dbW')
  })
  // The marketplace consumer is not subscribed.
  await failsOn('ar-144', 'At least three consumers read the product stream', (d) => cut(d, 'topic ~> prcM'))
  // A consumer drawn as calling Kafka synchronously.
  await failsOn('ar-144', 'Every line into or out of Kafka is async', (d) => swap(d, 'topic ~> prcW'))
  // The web shop API on the smallest size.
  await failsOn('ar-144', 'Run: Saturday peak', (d) => set(d, 'expW', { vCores: undefined }))
  // The publisher on the smallest size cannot keep up with a full price change.
  await failsOn('ar-144', 'Run: A price change for the whole range', (d) => set(d, 'pub', { vCores: undefined }))
  // The publisher drawn as a System API over the PIM.
  await passes('ar-144', (d) => {
    d.nodes.find((n) => n.id === 'pub').type = 'system-api'
    rename(d, 'pub', 'sys-pim-change-publisher')
  })
  // A fourth consumer for search.
  await passes('ar-144', (d) => {
    box(d, 'prcX', 'process-api', 'prc-search-indexer (consumer)', { vCores: '1' })
    box(d, 'dbX', 'database', 'Search catalogue copy')
    draw(d, 'topic ~> prcX', 'prcX -> dbX')
  })
}
