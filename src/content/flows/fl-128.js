import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const before = [
  { branchId: 'BR-014', name: 'Harbour Road', city: 'Portmere', open: 'Mon-Fri 09:00-17:00' },
  { branchId: 'BR-022', name: 'Market Square', city: 'Ashby', open: 'Mon-Sat 09:00-17:30' },
]
const after = [{ branchId: 'BR-022', name: 'Market Square', city: 'Ashby', open: 'Mon-Sat 09:00-17:30' }]
const branchMaster = (responses) => ({ method: 'GET', path: '/branch-master/branches', latencyMs: 1200, responses })
const get = (afterMs = 0) => ({ http: { method: 'GET', path: '/branches' }, afterMs })
const change = (afterMs = 0) => ({ message: { kind: 'mq', destination: 'branch-changes', payload: { branchId: 'BR-014', change: 'CLOSED', changedAt: '2026-11-13T10:02:00Z' } }, afterMs })

export default {
  id: 'fl-128',
  category: 'flows',
  title: 'A Cached Branch List That Is Never Out of Date: Fill on a Miss, Clear on a Change Event',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'caching', 'object-store', 'invalidation', 'anypoint-mq', 'banking'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The API is a GET on /branches', rule: { type: 'source', component: 'http-listener', where: { path: '/branches', allowedMethods: 'GET' } } },
    { label: 'The list is looked up in the Object Store before the branch master is called', rule: { type: 'before', first: 'os-retrieve', then: 'http-request' } },
    {
      label: 'The branch master is called only when nothing is cached',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'http-request', within: 'choice' },
          { type: 'inside', component: 'http-request', within: 'on-error-continue', withinWhere: { type: 'KEY_NOT_FOUND' } },
        ],
      },
    },
    {
      label: 'A fresh list is stored after the call, under the key the lookup reads',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-request', then: 'os-store' },
          { type: 'linked', from: { component: 'os-store', key: 'key' }, to: { component: 'os-retrieve', key: 'key' } },
        ],
      },
    },
    { label: 'A flow listens for change events on the branch-changes queue', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'branch-changes' } } },
    { label: 'That flow removes the same key from the Object Store', rule: { type: 'linked', from: { component: 'os-remove', key: 'key' }, to: { component: 'os-retrieve', key: 'key' } } },
  ],
  simulation: {
    systems: { http: [branchMaster([{ status: 200, body: before }, { status: 200, body: after }])] },
    tests: [
      {
        name: 'The first request fills the cache',
        about: 'Nothing is cached yet. The branch master is called once, the answer is 200 with both branches, and the list is kept in the Object Store.',
        trigger: get(),
        expect: { status: 200, body: before, calls: [{ method: 'GET', path: '/branch-master/branches', count: 1 }], stored: [{ key: 'branches', value: before }] },
      },
      {
        name: 'Later requests come from the cache',
        about: 'Three customers open the branch finder. Only the first request reaches the branch master, and all three get the same list.',
        triggers: [get(), get(5000), get(9000)],
        expect: { status: 200, body: before, calls: [{ method: 'GET', path: '/branch-master/branches', count: 1 }] },
      },
      {
        name: 'A branch closes',
        about: 'Harbour Road closes and the branch master sends a change event. The next request reads the branch master again and no longer shows Harbour Road.',
        triggers: [get(), change(60000), get(65000)],
        expect: { status: 200, body: after, calls: [{ method: 'GET', path: '/branch-master/branches', count: 2 }] },
      },
      {
        name: 'A change arrives when nothing is cached',
        about: 'The app has restarted a moment ago and nobody has asked for branches yet. The change event finds no key, and the message is still acknowledged, not sent back again and again.',
        trigger: change(),
        expect: { noError: true, ack: 'acked' },
      },
    ],
  },
  referenceFlow: design(
    flow('get-branches', source('http-listener', { path: '/branches', allowedMethods: 'GET' }), [
      step('os-retrieve', { key: 'branches', defaultValue: '#[null]', objectStore: 'branch_cache' }),
      router('choice', {}, [
        route({ expression: '#[payload == null]' }, [
          step('http-request', { method: 'GET', path: '/branch-master/branches', responseTimeout: 5000 }),
          step('os-store', { key: 'branches', value: '#[payload]', objectStore: 'branch_cache' }),
        ]),
      ], { otherwise: [step('logger', { level: 'DEBUG', message: 'Branch list served from the cache' })] }),
    ]),
    flow('clear-branch-cache', source('mq-subscriber', { destination: 'branch-changes' }), [
      scope('try', {}, [step('os-remove', { key: 'branches', objectStore: 'branch_cache' })], {
        errorHandlers: [handler('on-error-continue', { type: 'OS:KEY_NOT_FOUND' }, [step('logger', { level: 'DEBUG', message: 'Nothing cached, nothing to clear' })])],
      }),
      step('logger', { level: 'INFO', message: '#["Branch cache cleared after a change to " ++ payload.branchId]' }),
    ]),
  ),
  description: `
A building society shows its branches, with opening hours, in its app and on its website. Both call \`GET /branches\`. The list comes from the **branch master**, an old internal system: \`GET /branch-master/branches\` takes about **1.2 seconds** and has fallen over twice under load.

The list changes a few times a month. When it does, the branch master team publishes a message on the Anypoint MQ queue **branch-changes**, such as \`{ "branchId": "BR-014", "change": "CLOSED" }\`.

The team first put a Cache scope with a 24 hour expiry in front of the call. Customers then saw a closed branch for up to a day, and one drove to it.

**Requirements**
- Answer \`GET /branches\` from a cache in the Object Store when it holds the list. Call the branch master only when it does not.
- After a change event, the very next request must show the new list.
- A change event that finds nothing cached must not fail, or Anypoint MQ will deliver it again and again.
- The app runs on two replicas. A change event is delivered to only one of them.

The Object Store operations: **Retrieve** returns the value for a key, or its Default value when the key is not there. **Store** saves a value under a key. **Remove** deletes a key, and raises **OS:KEY_NOT_FOUND** when there is no such key.

**Facts**
- Use the Object Store \`branch_cache\` and keep the whole list under the key \`branches\`, exactly as the branch master returned it.
- \`GET /branches\` answers 200 with that list as its body.

**Design the flows.** Say which kind of object store you would use and why.
`,
  answerTemplate: `## Reading the branches

## Filling the cache

## Clearing it on a change

## Two replicas

## The store you would use
`,
  keyPoints: [
    'Cache-aside: look up the key, call the source on a miss, store what it returned.',
    'An expiry time alone decides when data may be old. An event from the owner of the data clears the cache when it is old.',
    'The change event removes the key. The next request then misses and reads the fresh list.',
    'Remove raises OS:KEY_NOT_FOUND for a missing key. Catch it with On Error Continue, or the message goes back to the queue and comes again.',
    'Use a persistent object store. On CloudHub its entries are shared by the replicas of the app, so a change event handled by one replica clears the cache for both.',
    'Keep a long expiry as a safety net, in case a change event is ever lost.',
  ],
  solution: `
**Flow 1: get-branches**
1. **HTTP Listener**: \`GET /branches\`.
2. **Retrieve** from the object store \`branch_cache\`, key \`branches\`, Default value \`#[null]\`.
3. **Choice**:
   - When \`#[payload == null]\`: **HTTP Request** \`GET /branch-master/branches\`, then **Store** key \`branches\`, value \`#[payload]\`.
   - Otherwise: log at DEBUG. The payload is already the cached list.

**Flow 2: clear-branch-cache**
1. **Anypoint MQ Subscriber** on \`branch-changes\`.
2. **Try** around **Remove** key \`branches\`, with **On Error Continue** for \`OS:KEY_NOT_FOUND\`.
3. Log the change at INFO.

**Why clear and not refresh.** The change flow could call the branch master and store the new list at once. Removing the key is less work: the next request fills it, and if five changes arrive in a minute, the branch master is called once, not five times.

**Two replicas.** Anypoint MQ gives each message to one subscriber, so only one replica runs the change flow. With an in-memory store the other replica would keep its old list. A persistent object store on CloudHub is shared by the app's replicas, so one Remove is enough.

**Safety net.** Set an entry time to live of a day or a week on \`branch_cache\`. Events make the cache correct; the expiry limits the harm if an event is ever missed.
`,
  followUps: [
    {
      q: 'Why not keep the Cache scope and invalidate it?',
      a: 'You can: the Cache scope stores its entries in an object store through a caching strategy, and that can be invalidated. Plain Object Store operations make the key, the store and the removal visible in the flow, which is clearer when two flows share it.',
    },
    {
      q: 'What happens if a request reads the branch master at the same moment as the change event is handled?',
      a: 'It can store the old list right after the Remove. The window is about a second, a few times a month. If that matters, the change flow can wait a moment and remove the key a second time, or store the list with the time of the change.',
    },
    {
      q: 'What if the branch master is down when the cache is empty?',
      a: 'The request fails. Keep a copy under a second key that never expires, and fall back to it in an error handler around the call.',
    },
  ],
}
