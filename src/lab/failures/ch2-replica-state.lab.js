// The guided lab ch2-replica-state. See platform-labs.js for the shape of a lab.
import { advance, at, eventsOf, mark, MINUTE, newApp, newPlatform, restartReplica } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { CART_API, sharedOf } from './ch2-replica-state.pkg.js'

const DOCS = 'https://docs.mulesoft.com/object-store/'
const SHOP = [{ app: CART_API, env: 'Sandbox', method: 'POST', path: '/carts', perMinute: 6, client: '' }]
const cartApp = (s) => app(s, CART_API)
const checkouts = (s, from, to = s.clock) => eventsOf(s, { app: CART_API, env: 'Sandbox' }, from, to).filter((e) => e.k === 'in' && e.fl === 'checkout-flow')
const lost = (list) => list.filter((e) => e.s !== 200)
const fixed = (s) => {
  const a = cartApp(s)
  return a?.status === 'Running' && a.replicas >= 3 && sharedOf(a, { ...a.props, ...a.secrets })
}

const lab = {
  id: 'p-ch2-replica-state',
  group: 'Scaling and release',
  title: 'Carts vanish after scaling out',
  minutes: 20,
  scenario: `The Harbor web shop has a sale today. At 09:00 the team scaled ${CART_API} on CloudHub 2.0 from 1 replica to 3 so it copes with the crowd. Since then shoppers say their carts empty at random, or lose items at checkout. Nothing failed in the deployment and the logs show no errors. It is 09:45. Find out why and make the carts survive more replicas and restarts.`,
  start() {
    let s = newPlatform({
      clock: at(1, 8),
      apps: [newApp(CART_API, { vCores: 0.5, props: { 'cart.persistent': 'false', 'cart.ttl.minutes': '120' }, store: {} })],
      traffic: SHOP,
    })
    s = until(s, at(1, 9))
    // horizontal scaling: the replica of the morning keeps running and two new ones join it
    s = change(s, CART_API, { replicas: 3 })
    s = until(s, at(1, 9, 25))
    s = restartReplica(s, CART_API, 2, 'The node of the replica was replaced during maintenance of the shared space.')
    s = until(s, at(1, 9, 40))
    const all = checkouts(s, at(1, 9))
    s = {
      ...s,
      mail: [
        ...s.mail,
        {
          t: s.clock,
          to: OPS,
          subject: 'Sale: shoppers lose their carts',
          body: `Since 09:00, ${lost(all).length} of ${all.length} checkouts failed. The shop said "Your cart is empty" or showed fewer items than the shopper added. Before 09:00 we had no such complaints. We only added replicas for the sale. Can you look before the lunch peak?`,
          source: 'Harbor web shop team',
        },
      ],
    }
    return until(s, at(1, 9, 45))
  },
  steps: [
    { title: 'Read the mail of the web shop team', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(CART_API),
    {
      title: 'Look at the replicas',
      how: `Runtime Manager, Applications, ${CART_API}, Dashboard. The Replicas table lists the 3 replicas with their CPU and memory. Compare the replica names with the replica column of the checkout warnings in Logs.`,
      done: (s) => Boolean(s.seen[`replicas:${CART_API}`]),
    },
    ask(
      'Why carts vanish',
      'The cart store is os:object-store with persistent false. What happens to a cart since there are 3 replicas?',
      [
        'Object Store V2 deletes carts after 5 minutes',
        'Each replica keeps its own store in its own memory. The ingress spreads requests round robin, so the next request of a shopper often lands on a replica that never saw the cart, and finds it empty or with fewer items',
        'The three replicas overwrite the same cart at the same time',
        'The shared space blocks POST requests during a sale',
      ],
      1,
      'With 1 replica every request found the same memory, so the design seemed to work. With 3 replicas a request reaches the right replica about one time in three. A restart is worse: at 09:25 a replica was replaced and every cart in its memory was gone.',
    ),
    ask(
      'Sticky sessions',
      'A colleague wants to turn on sticky sessions at the load balancer, so a shopper always reaches the same replica. Is that the fix?',
      [
        'Yes, it is a setting of the shared space',
        'No. The ingress of a CloudHub 2.0 shared space spreads requests round robin and offers no session affinity. Even with affinity a restart, a redeploy or a scale in loses the carts of that replica, and the load is no longer spread evenly',
        'Yes, with a cookie named JSESSIONID',
        'No, because sticky sessions need 4 replicas',
      ],
      1,
      'Affinity only hides the problem until a replica goes away, and on CloudHub 2.0 replicas are replaced at any time: updates, node maintenance, OOMKilled restarts. State that matters belongs outside the replica.',
    ),
    {
      title: 'Keep the cart outside the replicas',
      how: `Runtime Manager, ${CART_API}, Settings. Properties: cart.persistent is true. Runtime: Use Object Store V2 stays ticked, and Replica Count stays 3. Apply Changes. A persistent store with Object Store V2 lives outside the replicas, and every replica reads the same cart.`,
      done: fixed,
    },
    ask(
      'Cluster mode instead',
      'Would ticking Run in Runtime Cluster Mode, with the store still in memory, have been a good fix?',
      [
        'Yes, it is the best fix',
        'Only in part. The replicas of a cluster share their in-memory stores, so round robin works and one replica restart loses nothing. A redeploy or a restart of every replica still loses every cart, and the cluster is meant for primary node work such as schedulers',
        'No, cluster mode turns Object Store V2 off',
        'No, a cluster has only one replica',
      ],
      1,
      'Shared memory is still memory. Persistent Object Store V2 survives a redeploy; for carts that must last for days, the system of record is the commerce database or the cart service behind the API.',
    ),
    ask(
      'Stateless design',
      'What makes an API safe to scale out on CloudHub 2.0?',
      [
        'A large replica size',
        'Each request carries or looks up everything it needs: no state in the memory of a replica. Sessions and carts live in Object Store V2, a cache with a shared store, or the system of record, so any replica can answer and any replica can restart',
        'One replica per customer',
        'Recreate as deployment model',
      ],
      1,
      'A stateless replica can be added, removed or replaced at any time. That is what lets the platform do rolling updates and lets you scale out for a sale.',
    ),
    {
      title: 'Prove the carts survive',
      how: 'Move the clock 15 minutes. Carts started before the change lived in the memory of the old replicas, so they may still fail. Every checkout from 5 minutes after the change on is answered 200, and Object Store shows the open carts.',
      done: (s) => {
        const a = cartApp(s)
        if (!fixed(s)) return false
        const after = checkouts(s, a.updated + 5 * MINUTE)
        return after.length >= 10 && lost(after).length === 0
      },
    },
  ],
  why: 'In-memory state is per replica: a cache, an object store with persistent false, a VM queue that is not persistent. The ingress of CloudHub 2.0 spreads requests round robin over the replicas, and a restart, redeploy or scale in of a replica takes its memory with it. Code that worked with 1 replica breaks when you scale out. Keep state that must outlive one request in a persistent store with Object Store V2, shared by all replicas of the application, or in the system of record. In the lab the steady traffic is 6 shoppers who each add 3 items over 3 minutes and then check out, and the web shop tells the API how many items it shows the shopper.',
  docs: DOCS,
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${CART_API}`), `replicas:${CART_API}`)
    const a = cartApp(s)
    s = change(s, CART_API, { props: { ...a.props, 'cart.persistent': 'true' }, objectStore: true })
    return advance(s, 15 * MINUTE)
  },
  answers: { 3: 1, 4: 1, 6: 1, 7: 1 },
}

export const LABS = [lab]
