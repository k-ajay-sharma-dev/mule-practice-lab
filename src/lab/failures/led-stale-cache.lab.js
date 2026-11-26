// The guided lab led-stale-cache. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, viewMessages } from '../platform.js'
import { app, ask, call, called, change, CLIENTS, OPS, propsValue, sawLogs, until } from '../platform-kit.js'
import { LAYER_PROPERTY } from '../platform-led.js'
import { jarOf, LED, ledProject, patchApp, PRIVATE_SPACE } from '../platform-project.js'
import { addressAt, CHANGES, CHANGES_QUEUE, CUSTOMER_ID, lastChangeAt, OLD_ADDRESS, ttlOf } from './led-stale-cache.pkg.js'

const PAPI = LED.process.app
const PARTNER = LED.partner.app
const PARTNER_PORTAL = CLIENTS[1]
const RELAY = 'customer-change-relay'
const PATH = '/partner-orders/O-1002'
const LIMIT = 15 * MINUTE // how stale a delivery address may be, as the delivery team agreed
const DOCS = 'https://docs.mulesoft.com/mule-runtime/latest/cache-scope'

const papi = (s) => app(s, PAPI)
const running = (s) => papi(s)?.status === 'Running'
const ttlOk = (s) => {
  const ttl = ttlOf({ ...papi(s)?.props, ...papi(s)?.secrets })
  return ttl !== null && ttl >= MINUTE && ttl <= LIMIT
}
const listening = (s) => propsValue(papi(s), 'customers.cache.invalidation.queue') === CHANGES_QUEUE
const fixed = (s) => running(s) && ttlOk(s) && listening(s)
// The address the Process API put in each traced answer, read back from its log
const answers = (s) => {
  const a = papi(s)
  return (a?.logs ?? []).flatMap((l) => {
    const m = l.config === a.config && l.text.match(/Delivery address of C-7 in the answer: (.+)$/)
    return m ? [{ t: l.t, address: m[1] }] : []
  })
}
// A change in the CRM after the fix was deployed, and an answer after it with the address of that moment
const proved = (s) => fixed(s) && answers(s).some((x) => (lastChangeAt(x.t)?.t ?? -1) > papi(s).updated && x.address === addressAt(x.t))

const lab = {
  id: 'p-fail-led-stale-cache',
  group: 'API-led failures',
  title: 'Old addresses from the Process API cache',
  minutes: 20,
  scenario: `It is 09:30. To protect the Customers System API, the team added a Cache scope around the customer lookup in order-fulfilment-papi yesterday. At 07:10 Harbor Deli changed its delivery address in the CRM. Bay Couriers reads the address from the Partner Orders API and still drove to ${OLD_ADDRESS} this morning.`,
  start() {
    let s = ledProject({ clock: at(1, 6) })
    s.jars.push(
      { pkg: 'order-fulfilment-papi-cache', autodiscovery: jarOf('process').autodiscovery, jar: 'order-fulfilment-papi-1.4.0-mule-application.jar' },
      { pkg: 'customers-sapi-crm', autodiscovery: jarOf('customers').autodiscovery, jar: 'customers-sapi-1.2.0-mule-application.jar' },
      RELAY,
    )
    s.queues.push({ name: CHANGES_QUEUE, type: 'Standard queue', dlq: '', attempts: 5, messages: [] })
    s = patchApp(s, 'process', { pkg: 'order-fulfilment-papi-cache', jar: 'order-fulfilment-papi-1.4.0-mule-application.jar', updated: at(0, 18), props: { 'customers.cache.entryTtl': '24', 'customers.cache.entryTtlUnit': 'HOURS' } })
    s = patchApp(s, 'customers', { pkg: 'customers-sapi-crm', jar: 'customers-sapi-1.2.0-mule-application.jar' })
    s.apps.push(newApp(RELAY, { target: PRIVATE_SPACE, publicEndpoint: false, props: { [LAYER_PROPERTY]: 'System', 'mq.queue': CHANGES_QUEUE } }))
    s = until(s, at(1, 9, 30))
    const body = `Harbor Deli called us at 08:50. They moved their delivery dock to ${CHANGES[0].address} and changed it in your system at 07:10. Your Partner Orders API still gives us ${OLD_ADDRESS} for order O-1002, so our driver went there twice today. Please fix this before the afternoon round. Their address changes again today: they add a unit number at 12:00.`
    s.mail = [...s.mail, { t: at(1, 9, 20), to: OPS, subject: 'Deliveries to Harbor Deli went to the old address', body, source: 'Bay Couriers' }]
    return s
  },
  steps: [
    { title: 'Read the mail of Bay Couriers', how: 'Open the Inbox from the menu. Note the old and the new address and the time of the change.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'See the old address in the Experience layer',
      how: `API client, ${PARTNER} as Partner Portal, GET ${PATH}. customer.deliveryAddress is still ${OLD_ADDRESS}.`,
      done: (s) => called(s, PARTNER, 200, 'GET', /^\/partner-orders\/O-1002/),
    },
    {
      title: 'See that the system of record has the new one',
      how: `MQ, ${CHANGES_QUEUE}, Message Browser, Get Messages. ${RELAY} published a CustomerChanged event for ${CUSTOMER_ID} at 07:10. The Customers System API reads SQL Server, where the CRM wrote the new address at once. Nothing consumes this queue yet. The System APIs are private, so you see their side here and in the logs, not in the API client.`,
      done: (s) => Boolean(s.seen[`mq:${CHANGES_QUEUE}`]),
    },
    { ...sawLogs(PAPI), how: `Runtime Manager, Applications, ${PAPI}, Logs. Find the lines of your call: Cache hit for key customer:C-7, the time the entry was stored and its entryTtl. The Customers API was not called.` },
    ask(
      'Find the cause',
      'Why does the partner get the old address?',
      ['The Customers System API still returns the old address', 'The entry for C-7 was stored at 18:00 yesterday with entryTtl 24 HOURS, so the Cache scope answers from it until 18:00 today', 'Bay Couriers caches the answer on its side', 'The CRM did not save the change'],
      1,
      'The Cache scope found the key and did not run its content, so the call to the System API never happened. An entry is only as fresh as the moment it was stored. With 24 hours, a change can stay hidden for up to a day.',
    ),
    ask(
      'Choose the fix',
      'An address changes a few times a year per customer, and the delivery team accepts at most 15 minutes of delay. What do you set?',
      ['Keep 24 hours and restart the application when someone complains', 'entryTtl of 10 minutes, and Invalidate Key for the customer each time a CustomerChanged event comes in', 'Remove the cache, so every call goes to SQL Server', 'entryTtl of 10 seconds and no event'],
      1,
      'The event makes a change visible within seconds. The TTL is the safety net for an event that is lost or late, so it is set to the staleness the business accepts. The cache still takes most of the load from the System API.',
    ),
    {
      title: 'Give the entries a TTL that fits',
      how: `Runtime Manager, ${PAPI}, Settings, Properties. Set customers.cache.entryTtl to 10 and customers.cache.entryTtlUnit to MINUTES. They feed entryTtl and entryTtlUnit of the private object store of the caching strategy. Anything from 1 to 15 minutes passes. Apply Changes.`,
      done: (s) => running(s) && ttlOk(s),
    },
    {
      title: 'Remove the entry when the customer changes',
      how: `Set customers.cache.invalidation.queue to ${CHANGES_QUEUE}. In this release it starts a listener flow on that queue with an Invalidate Key operation that uses the same caching strategy and the key expression of the customer ID. Apply Changes. The cache is in memory, so the redeploy also starts it empty.`,
      done: (s) => running(s) && listening(s),
    },
    {
      title: 'Prove a change shows up in time',
      how: `Move the clock past the next change in the CRM, 12:00 (then 15:00). Call GET ${PATH} as Partner Portal right after. The address has the unit number, and the log of ${PAPI} says Invalidate Key removed customer:C-7.`,
      done: proved,
    },
    ask(
      'What is safe to cache',
      'Which of these suits a long TTL in the Process API?',
      ['The list of country codes and units of measure', 'The status of an order', 'The stock of a product', 'The delivery address of a customer'],
      0,
      'Reference data changes rarely and is the same for every caller, so hours are fine. Transactional data such as status and stock changes with each order and should not be cached, or only for seconds. Customer data sits in between: a short TTL and invalidation on change.',
    ),
    ask(
      'Choose the key',
      'A teammate wants to key the customer cache on the client ID of the caller, to save a lookup. What goes wrong?',
      ['Nothing, the client ID is unique', 'All customers seen by one partner share one entry, so they get the address of whichever customer was stored first', 'The cache uses more memory'],
      1,
      'The key must hold everything the answer depends on, here the customer ID. A key that leaves it out mixes customers and leaks one customer\'s data to another. Invalidate Key must use the same key expression to find the entry.',
    ),
  ],
  why: 'A cache trades freshness for load. Cache reference data for long, keep transactional data out, and give per customer data a key with the customer ID, a TTL as long as the business accepts, and an Invalidate Key on each change event. The lab simplifies: the expiration thread of the object store runs every minute by default, so a real entry can live up to a minute past its TTL; each CloudHub replica has its own in memory cache, so with more replicas the event must reach each one or the store must be shared; and with steady traffic the lab loads an entry the moment it expires.',
  docs: DOCS,
  solve(start) {
    let s = mark(start, 'inbox')
    s = call(s, PARTNER, PARTNER_PORTAL, PATH).state
    s = mark(viewMessages(s, CHANGES_QUEUE), `logs:${PAPI}`)
    s = change(s, PAPI, { props: { ...papi(s).props, 'customers.cache.entryTtl': '10', 'customers.cache.entryTtlUnit': 'MINUTES', 'customers.cache.invalidation.queue': CHANGES_QUEUE } })
    s = until(s, at(1, 12, 5))
    return advance(call(s, PARTNER, PARTNER_PORTAL, PATH).state, MINUTE)
  },
  answers: { 4: 1, 5: 1, 9: 0, 10: 1 },
}

export const LABS = [lab]
