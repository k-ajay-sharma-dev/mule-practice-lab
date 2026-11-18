export default {
  id: 'ms-227',
  category: 'mulesoft',
  title: 'Aggregators Module: Size-Based, Time-Based and Group-Based Aggregators Outside a Batch Job',
  level: 'INTERMEDIATE',
  tags: ['aggregators', 'aggregators-module', 'object-store', 'bulk', 'messaging', 'performance', 'logistics'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'Scan events arrive one at a time from a queue. The carrier API takes up to 100 scans per call. Which tool collects them across separate events?',
      options: [
        'A Batch Aggregator, placed in the queue listener flow',
        'An aggregator from the Aggregators module',
        'A For Each with a batch size of 100',
        'A Scatter-Gather',
      ],
      answer: 1,
      explain: 'A Batch Aggregator only works inside a batch step. The Aggregators module collects values from many separate events, which is what a queue listener produces.',
    },
    {
      type: 'single',
      prompt: 'Which aggregator releases a group when it holds a set number of values?',
      options: ['Time-based', 'Group-based', 'Size-based', 'None of them, you must count in a variable'],
      answer: 2,
      explain: 'A size-based aggregator completes when it reaches its maximum size. The values then go to the route that runs on completion.',
    },
    {
      type: 'single',
      prompt: 'At night only 30 scans arrive per hour, so a size of 100 can take hours to fill. What helps?',
      options: [
        'Lower the size to 1',
        'Add a timeout, or use a time-based aggregator, so a partial group is released after a set time',
        'Raise the size to 1,000',
        'Nothing, the carrier must wait',
      ],
      answer: 1,
      explain: 'A size alone waits as long as it takes. A time limit puts an upper bound on the delay, and the aggregator listener can pick up the group that timed out.',
    },
    {
      type: 'single',
      prompt: 'A shipment is split into parcels. Each parcel event carries the shipment id and the parcel count. Which aggregator fits "send once every parcel of this shipment has arrived"?',
      options: ['Size-based', 'Time-based', 'Group-based, with the shipment id as the group id and the parcel count as the group size', 'Scatter-Gather'],
      answer: 2,
      explain: 'A group-based aggregator keeps a separate group per id and completes each one when it holds the expected number of values.',
    },
    {
      type: 'multi',
      prompt: 'The app runs on two replicas behind one queue. What should you check before relying on an aggregator?',
      options: [
        'Where the aggregator keeps its values, and whether both replicas see the same store',
        'What happens to values held when a replica restarts',
        'That the queue delivers events in a fixed order to one replica',
        'That a group which never completes is released or removed after a time',
      ],
      answer: [0, 1, 3],
      explain: 'The values wait in a store between events. If each replica has its own store, parcels of one shipment can end up in two groups that never complete. Plan for restarts and for groups that never fill.',
    },
    {
      type: 'match',
      prompt: 'Match each need to an aggregator.',
      pairs: [
        ['Send scans in calls of 100', 'Size-based'],
        ['Send whatever has arrived every 5 minutes', 'Time-based'],
        ['Send a shipment when all its parcels are in', 'Group-based'],
      ],
      explain: 'Size counts values, time watches the clock, and group keeps one bucket per id with its own expected size.',
    },
  ],
  description: `
Tarnfield Parcels scans each parcel at its depots. Every scan becomes one message on a queue, and a Mule app forwards it to a partner carrier. The carrier now charges per API call and accepts up to 100 scans in one call. It also asks for a "shipment complete" message once every parcel of a shipment has been scanned at the final depot.

The team first tried a Batch Aggregator, but the scans do not arrive as one batch job. They arrive one by one, all day.

**Questions**
1. Why does a Batch Aggregator not fit here, and what does the Aggregators module do instead?
2. Which aggregator sends the scans in calls of up to 100, and how do you stop scans waiting too long at night?
3. Which aggregator fits the "shipment complete" message, and what does it need from each event?
4. What do you check when the app runs on more than one replica?
`,
  answerTemplate: `## Batch Aggregator or Aggregators module

## Calls of 100 scans

## Shipment complete

## More than one replica
`,
  keyPoints: [
    'A Batch Aggregator works only inside a batch step. The Aggregators module collects values across separate events.',
    'A size-based aggregator completes at a set number of values.',
    'A time-based aggregator releases what it has after a set period.',
    'A group-based aggregator keeps one group per id and completes each one at its own size.',
    'Add a time limit so a group that fills slowly, or never, is still released or removed.',
    'The values wait in a store, so check how that store behaves across replicas and restarts.',
  ],
  solution: `
**1. Why not batch.** A Batch Aggregator sits inside a batch step and groups the records of one job. Here each scan is its own event from a queue listener, so there is no job. The Aggregators module keeps values from separate events until a rule says the group is ready, then runs the steps inside its completion route with the collected values as a list.

**2. Calls of 100.** A size-based aggregator with a maximum size of 100 collects scans and calls the carrier once per 100. At night, add a timeout, or use a time-based aggregator instead, so a partial group goes out after a few minutes. An aggregator listener flow can then send what timed out. Agree the longest delay with the carrier.

**3. Shipment complete.** A group-based aggregator uses the shipment id as the group id and the parcel count as the group size. Each shipment fills its own group. When the last parcel arrives, the group completes and the app sends the message. Each event must carry both values. Set a time after which an incomplete group is released or removed, and alert someone, because a lost parcel scan would otherwise keep the group open.

**4. Replicas.** The aggregator keeps waiting values in an object store. If each replica keeps its own values, parcels of one shipment spread over two groups and neither completes. Use a store that both replicas share, check the docs for your deployment target, and test a restart in the middle of a group. If that is hard to guarantee, a database table that counts parcels per shipment may be the safer design.
`,
  followUps: [
    {
      q: 'The carrier call fails for a group of 100 scans. What happens to them?',
      a: 'They are no longer in the aggregator once the group completes, so the error handler must deal with them. Send the list to a retry queue or a dead letter queue, so no scan is lost.',
    },
    {
      q: 'Why not keep a list in a variable and send it when it reaches 100?',
      a: 'A variable lives only for one event. The next scan starts with a fresh event, so the list is gone. An aggregator, or your own object store entry, keeps values between events.',
    },
    {
      q: 'How do you test an aggregator in MUnit?',
      a: 'Run the flow several times in one test with different events, then check the call to the carrier. Mock the carrier request and assert that it was called once with the expected number of scans.',
    },
  ],
}
