// The guided lab amq-failover. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { AMQ, AMQ_FAILOVER, AMQ_URL, brokerOf, connOf, defaultJms, masterOf, parseUrl, restartNode } from '../platform-jms.js'
import { FEED, QUEUE, TRACKER } from './amq-failover.pkg.js'

const LOGIN = { 'jms.user': 'mule-parcel', 'jms.password': 'parcel-lab-1' }
const tracker = (s) => app(s, TRACKER)
const props = (s) => ({ ...tracker(s)?.props, ...tracker(s)?.secrets })
const running = (s) => tracker(s)?.status === 'Running'
const broker = (s) => brokerOf(s, AMQ)
const failoverOk = (s) => {
  const u = parseUrl(props(s)['jms.url'])
  const hosts = u.hosts.map((h) => h.host)
  return running(s) && u.failover && hosts.includes('amq1.brightmart.lab') && hosts.includes('amq2.brightmart.lab') && !u.randomize
}
const reconnectOk = (s) => running(s) && connOf(props(s)).reconnect
const scansWaiting = (s) => (broker(s)?.queues[QUEUE]?.messages ?? []).filter((m) => m.persistent).length

const lab = {
  id: 'p-amq-failover',
  group: 'ActiveMQ',
  title: 'Parcel tracking stopped after the patch night',
  minutes: 20,
  scenario: `brightmart-amq is an ActiveMQ Classic pair: amq1 and amq2 share one KahaDB store, and the one that holds the store lock is master. At 05:59 the operations team restarted amq1 for patching. ${FEED} kept sending parcel scans to ${QUEUE}, but ${TRACKER} has written nothing since, and it is 07:00. Find out why it did not come back, make it survive the next restart, and prove it by patching amq2.`,
  start() {
    const clock = at(1, 5)
    const s = newPlatform({
      clock,
      apps: [newApp(FEED, { props: { ...LOGIN, 'jms.url': AMQ_FAILOVER }, store: {} }), newApp(TRACKER, { props: { ...LOGIN, 'jms.url': AMQ_URL, 'jms.reconnect': 'none' }, store: {} })],
      jms: defaultJms(clock),
    })
    let later = until(s, at(1, 5, 59))
    later = restartNode(later, AMQ, 'amq1', 12).state
    later = until(later, at(1, 6, 50))
    later.mail.push({
      t: at(1, 6, 50),
      to: OPS,
      subject: 'Parcel tracking is stuck at 05:59',
      body: 'The tracking page shows no parcel scans after 05:59, although the depots scan as usual. Drivers and customers see old positions. Did the patch night break something?',
      source: 'Brightmart Logistics',
    })
    return until(later, at(1, 7))
  },
  steps: [
    { title: 'Read the mail of logistics', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { ...sawLogs(TRACKER), how: `Runtime Manager, ${TRACKER}, Logs. Find the JMS:CONNECTIVITY error at 06:00 and note that nothing comes after it.` },
    {
      title: 'Open the Home page of brightmart-amq',
      how: 'ActiveMQ, brightmart-amq, Home. The nodes table shows which node is master now, and the broker history shows the restart and the NON_PERSISTENT messages it lost.',
      done: (s) => Boolean(s.seen[`jms:${AMQ}`]),
    },
    ask(
      'Why it never came back',
      `${TRACKER} connects with ${AMQ_URL}, an alias of amq1, and has no reconnection strategy. amq1 is back since 06:11. Why does the app still not consume?`,
      [
        'The queue was deleted by the restart',
        'The listener lost its connection when amq1 stopped, and with no reconnection strategy it stopped for good. Even a reconnect to amq1 would fail now: amq1 came back as the slave, waiting for the store lock, and a slave accepts no connections. amq2 is master',
        'The password changed during patching',
        'The broker only lets producers reconnect',
      ],
      1,
      'A tcp:// URL names one broker. In a shared store pair only the master listens, so the right host changes with every failover. The failover: transport lists both and reconnects on its own. By default it tries for ever (maxReconnectAttempts -1). The Mule reconnection strategy is the second guard: when the transport gives up, for example after maxReconnectAttempts or timeout, or the connection fails in another way, the listener connects again instead of stopping.',
    ),
    {
      title: 'Use the failover transport',
      how: `Runtime Manager, ${TRACKER}, Settings, Properties. Set jms.url to ${AMQ_FAILOVER}. randomize=false makes the client try amq1 first and then amq2, instead of a random order. Apply Changes.`,
      done: failoverOk,
    },
    {
      title: 'Add a reconnection strategy',
      how: 'Set jms.reconnect to forever: the JMS config gets <reconnection><reconnect-forever frequency="5000"/></reconnection> on its connection. Apply Changes. The backlog of scans starts to drain.',
      done: (s) => failoverOk(s) && reconnectOk(s),
    },
    ask(
      'What the restart lost',
      `The broker history says the restart of amq1 lost some NON_PERSISTENT messages. Which messages were they, and is the failover transport a fix for that?`,
      [
        'All messages were lost, the failover transport brings them back',
        `The location pings, which ${FEED} sends NON_PERSISTENT: the broker keeps those in memory only, so a stop loses them, even with a shared store. Failover does not help. Send what must survive as PERSISTENT, and use NON_PERSISTENT only for data that the next message replaces`,
        'Nothing was lost, the slave had a copy in memory',
        'The parcel scans, because they were not acknowledged',
      ],
      1,
      'PERSISTENT messages are written to the store before the broker acknowledges the send, so the new master finds them. NON_PERSISTENT messages skip the store for speed and live only in the memory of the broker that had them. A ping that is replaced a minute later can be NON_PERSISTENT; a parcel scan cannot.',
    ),
    {
      title: 'Patch amq2 and watch',
      how: `When the backlog is gone, ActiveMQ, brightmart-amq, Home: restart amq2, the master now. amq1 takes the lock and becomes master. Move the clock 5 minutes: ${TRACKER} reconnects through the failover URL and keeps writing scans.`,
      done: (s) => {
        const r = broker(s)?.lastRestart
        const a = tracker(s)
        if (!failoverOk(s) || !reconnectOk(s) || !r || r.t <= a.updated || s.clock < r.t + 3 * MINUTE) return false
        return (a.store.handled ?? []).some((x) => x.t > r.t + MINUTE) && scansWaiting(s) < 10 && masterOf(broker(s))?.name !== r.node
      },
    },
  ],
  why: 'An app that connects with tcp:// to one broker loses everything when that broker stops, and a Mule JMS listener with no reconnection strategy stays stopped until the app restarts. In a shared store master/slave pair the master changes with each failover, and the slave accepts no connections. Use failover:(tcp://amq1...,tcp://amq2...) so the ActiveMQ client finds the master and reconnects on its own, with randomize=false to try the brokers in order, and add a reconnection strategy to the JMS config. Persistent messages survive in the shared store; NON_PERSISTENT messages live in memory and are lost. In the lab a restart takes the node down for the minutes you choose.',
  docs: 'https://activemq.apache.org/components/classic/',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${TRACKER}`), `jms:${AMQ}`)
    s = change(s, TRACKER, { props: { ...tracker(s).props, 'jms.url': AMQ_FAILOVER, 'jms.reconnect': 'forever' } })
    s = advance(s, 8 * MINUTE)
    s = restartNode(s, AMQ, masterOf(broker(s)).name, 10).state
    return advance(s, 5 * MINUTE)
  },
  answers: { 3: 1, 6: 1 },
}

export const LABS = [lab]
