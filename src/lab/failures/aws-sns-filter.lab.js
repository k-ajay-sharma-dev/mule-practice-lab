// The guided lab aws-sns-filter. See platform-labs.js for the shape of a lab.
import { at, callApi, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, called, change, OPS, sawLogs, until } from '../platform-kit.js'
import { arnTopic, newAwsAccount, policyDoc, pollFromConsole, publishFromConsole, REGION } from '../platform-aws.js'
import { PUBLISHER } from './aws-sns-filter.pkg.js'

const TOPIC = 'brightmart-price-changes'
const CLEARANCE = 'brightmart-clearance-signs'
const STORES = 'brightmart-store-prices'
const USER = 'svc-pricing'
const KEY_ID = 'AKIA_LAB_0004120'
const SECRET = 'lab-only/pricing-4120'
const CLEARANCE_FILTER = '{\n  "discountPct": [{ "numeric": [">=", 30] }]\n}'
const STORES_FILTER = '{\n  "eventType": ["PriceChanged"]\n}'

const p = (s) => app(s, PUBLISHER)
const typeOk = (s) => p(s)?.status === 'Running' && String(p(s)?.props?.['sns.attr.discountPct.dataType'] ?? '').trim() === 'Number'
const topic = (s) => s.aws?.topics?.[TOPIC]
const clearance = (s) => s.aws?.queues?.[CLEARANCE]?.messages ?? []
const replayed = (s) => typeOk(s) && (p(s).store?.replays ?? []).some((r) => r.t >= p(s).updated && r.type === 'Number' && r.from <= at(1, 8) && r.n > 0) && called(s, PUBLISHER, 200, 'POST', /^\/replay/)

const lab = {
  id: 'p-aws-sns-filter',
  group: 'Data and cloud',
  title: 'The clearance signs stopped updating',
  minutes: 20,
  scenario: `${PUBLISHER} publishes each price change of Brightmart to the SNS topic ${TOPIC}. Two SQS queues subscribe: ${STORES} gets every change for the shelf labels, and ${CLEARANCE} gets only big discounts for the clearance signs, by a filter policy. At 08:00 the pricing team changed the publisher. Since then the store labels update, but the clearance signs show yesterday's prices. Nothing failed: no error in the logs, no failed delivery. Find where the messages go, fix it, and get the missed discounts to the signs.`,
  start() {
    let s = newPlatform({
      clock: at(1, 7, 50),
      apps: [newApp(PUBLISHER, { props: { 'aws.region': REGION, 'aws.accessKeyId': KEY_ID, 'sns.topicArn': arnTopic(TOPIC), 'sns.attr.discountPct.dataType': 'Number' }, secrets: { 'aws.secretAccessKey': SECRET }, store: {} })],
      aws: newAwsAccount(at(1, 7, 50), {
        users: [{ name: USER, keys: [{ id: KEY_ID, secret: SECRET, created: at(-60, 11) }], policies: { 'publish-prices': policyDoc({ Sid: 'PublishPrices', Effect: 'Allow', Action: 'sns:Publish', Resource: arnTopic(TOPIC) }) } }],
        queues: [
          { name: CLEARANCE, wait: 20, retention: 345600, created: at(-20, 10) },
          { name: STORES, wait: 20, retention: 345600, created: at(-20, 10) },
        ],
        topics: [{ name: TOPIC, created: at(-20, 10), subs: [{ queue: STORES, filter: STORES_FILTER }, { queue: CLEARANCE, filter: CLEARANCE_FILTER }] }],
      }),
      mail: [
        {
          t: at(1, 9, 10),
          to: OPS,
          subject: 'Clearance signs show old prices',
          body: 'Hi. The digital clearance signs in all stores still show the prices of last night. The shelf labels are fine. The 35% and 50% offers of this morning are missing on the signs. Brightmart store operations',
          source: 'Brightmart store operations',
        },
      ],
    })
    s = until(s, at(1, 8))
    s = change(s, PUBLISHER, { props: { ...p(s).props, 'sns.attr.discountPct.dataType': 'String' } })
    return until(s, at(1, 9, 20))
  },
  steps: [
    {
      title: 'Read the subscriptions of the topic',
      how: `AWS from the console menu, SNS tab, ${TOPIC}. Subscriptions lists both queues with their filter policies. ${CLEARANCE} has {"discountPct":[{"numeric":[">=",30]}]}. Monitoring shows NumberOfNotificationsFilteredOut climbing since 08:00.`,
      done: (s) => Boolean(s.seen[`aws:sns:${TOPIC}`]),
    },
    {
      title: 'Look at a message that got through',
      how: `SQS tab, ${STORES}, Send and receive messages, Poll for messages. Open a message of today: the SNS envelope shows MessageAttributes, and discountPct has Type String. Messages from before 08:00 have Type Number.`,
      done: (s) => Boolean(s.seen[`aws:poll:${STORES}`]),
    },
    ask(
      'Why the clearance queue gets nothing',
      'discountPct is still "35" or "50", only its DataType changed. Why does the filter policy drop the message?',
      [
        'SNS drops messages over 30 KB',
        'Numeric matching applies to attributes of DataType Number only. An attribute of DataType String never matches {"numeric": [">=", 30]}, whatever its value, so SNS filters the message out for that subscription',
        'The clearance queue is full',
        'The subscription is not confirmed',
      ],
      1,
      'A filter policy compares the value and its type. String rules such as ["35"] or {"prefix"} match String attributes, numeric rules match Number attributes. A message that does not match is counted in NumberOfNotificationsFilteredOut and is not delivered, which is not an error for the publisher.',
    ),
    {
      title: 'Prove it with a test message',
      how: `SNS tab, ${TOPIC}, Publish message. Message body {"sku":"TEST-1","discountPct":40}. Under Message attributes add Type Number, Name discountPct, Value 40, and Type String, Name eventType, Value PriceChanged. Publish message. The result names both queues as delivered. Try the same with Type String: only ${STORES} gets it.`,
      done: (s) => (topic(s)?.consoleTo ?? []).includes(CLEARANCE),
    },
    {
      title: 'Fix the type in the publisher',
      how: `Runtime Manager, ${PUBLISHER}, Settings, Properties. Set sns.attr.discountPct.dataType to Number and Apply Changes. Changing the filter to strings would not work, because a range such as 30 or more needs numeric matching.`,
      done: typeOk,
    },
    ask(
      'Where the filtered messages went',
      `The changes of 08:00 to now were filtered out for ${CLEARANCE}. Where are they?`,
      [
        'In the dead-letter queue of the subscription',
        'SNS keeps them for 14 days and sends them again',
        'Nowhere. A filtered message is not a failed delivery: SNS keeps no copy, and a subscription dead-letter queue holds only deliveries that failed. Only the publisher can send them again',
        'In the queue, invisible until the filter is fixed',
      ],
      2,
      'SNS is push only and stores nothing for a subscriber. A redrive policy on a subscription catches deliveries that failed, for example when the queue policy refuses SNS, not messages the filter policy dropped. Design for replay at the source when a subscriber can miss messages, or use an archive such as SNS FIFO message archiving.',
    ),
    {
      title: 'Replay the missed changes',
      how: `API client from the console menu, application ${PUBLISHER}, POST /replay with body {"from":"08:00"}. The app publishes every change since 08:00 again, now with discountPct as Number. Poll ${CLEARANCE}: the 35%, 40% and 50% changes are there, with "source":"replay".`,
      done: replayed,
    },
    {
      title: 'See live changes arrive',
      how: `Move the clock 10 minutes. New changes of 30% or more reach ${CLEARANCE} with "source":"live", and smaller ones are still filtered out, as designed.`,
      done: (s) => replayed(s) && s.clock >= p(s).updated + 10 * MINUTE && clearance(s).some((m) => m.sent > p(s).updated && m.body.includes('\\"source\\":\\"live\\"')),
    },
  ],
  why: 'SNS filter policies match on the type as well as the value: numeric rules need a Number attribute and string rules a String attribute. A publisher that changes an attribute type breaks the subscribers silently: the publish succeeds, the other subscriptions still get messages, and only NumberOfNotificationsFilteredOut of the topic shows it. Test a filter with Publish message and the right attribute types, and fix the type at the source rather than weakening the filter. Filtered messages are gone, they are not failed deliveries, so the source must be able to replay.',
  docs: 'https://docs.mulesoft.com/amazon-sns-connector/latest/',
  solve(start) {
    let s = mark(start, `aws:sns:${TOPIC}`)
    s = pollFromConsole(s, STORES).state
    s = publishFromConsole(s, TOPIC, { message: '{"sku":"TEST-1","discountPct":40}', attrs: [{ name: 'discountPct', type: 'Number', value: '40' }, { name: 'eventType', type: 'String', value: 'PriceChanged' }] }).state
    s = change(s, PUBLISHER, { props: { ...p(s).props, 'sns.attr.discountPct.dataType': 'Number' } })
    s = callApi(s, { env: 'Sandbox', app: PUBLISHER, method: 'POST', path: '/replay', body: '{"from":"08:00"}' }).state
    return until(s, s.clock + 11 * MINUTE)
  },
  answers: { 2: 1, 5: 2 },
}

export const LABS = [lab]
