export default {
  id: 'ms-089',
  category: 'mulesoft',
  title: 'Salesforce Connector in Depth: Replay Sources, Platform Events, Event Quota and Bulk v2 Operations',
  level: 'ADVANCED',
  tags: ['salesforce', 'platform-events', 'cdc', 'replay', 'streaming', 'bulk-api', 'object-store'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'Salesforce publishes the platform event `Shipment_Update__e`. Which source do you use in the Mule app?',
      options: [
        'Replay Channel Listener with the streaming channel `/event/Shipment_Update__e`',
        'Replay Topic Listener with the topic `Shipment_Update__e`',
        'On Modified Object with the object type `Shipment_Update__e`',
        'A Scheduler with Query All on `Shipment_Update__e`',
      ],
      answer: 0,
      explain: 'The channel listener covers platform events, Change Data Capture events and legacy generic events. The topic listener is for legacy PushTopic events. The docs also say you can use the Salesforce Pub/Sub Connector for new platform event and CDC integrations.',
    },
    {
      type: 'match',
      prompt: 'Match each Replay Option to what the subscriber receives.',
      pairs: [
        ['ONLY_NEW', 'Only events published after the subscription starts (subscribes with -1)'],
        ['ALL', 'Every event Salesforce still holds (subscribes with -2)'],
        ['FROM_REPLAY_ID', 'Events after the value entered in the Replay Id field'],
        ['FROM_LAST_REPLAY_ID', 'Events from the highest replay ID in the object store, whether or not the flow processed it successfully'],
      ],
      explain: 'For ALL and ONLY_NEW the `replayId` value is ignored. FROM_LAST_REPLAY_ID looks only at the highest stored ID, so it does not go back for a failed event.',
    },
    {
      type: 'single',
      prompt: 'A flow failed on replay ID 10 and went on to process up to 15. After a restart, the team wants event 10 processed again without running 11 to 15 through the flow a second time. Which setting does that?',
      options: [
        'Turn on "Replay failed events if any or resume from last replay id": it starts from the lowest failed ID and filters out events that already succeeded',
        'Replay Option FROM_LAST_REPLAY_ID, which always resumes from the first failed event',
        'Replay Option ONLY_NEW with Replay Id set to 10',
        'Replay Option ALL, which skips events already stored in the object store',
      ],
      answer: 0,
      explain: 'The docs describe this case: processing starts with failed ID 10, the client receives events 10 to 15, and the connector filters them so the flow does not reprocess them. That sentence does not treat event 10 separately, although the docs also say the app can reprocess failed messages, so test the failed event itself. Those deliveries still count, so this option can use extra quota, and it overrides Replay Option.',
    },
    {
      type: 'single',
      prompt: 'The subscriber of a platform event channel was down for four days over a long weekend. What can it recover by replaying?',
      options: [
        'Only events still inside the Salesforce retention window, which is shorter than four days; older ones are discarded, so the gap must be closed from the data itself',
        'All four days, because the object store keeps the events',
        'All four days, because Salesforce keeps an event until a subscriber has received it',
        'Everything, as long as the option ALL is used',
      ],
      answer: 0,
      explain: 'The connector docs conflict on the window. The event processing page says 72 hours, or 24 hours for legacy PushTopic and generic events, while the reference tables of both Replay sources say 24 hours. Four days is longer than either, so the answer does not depend on it, but verify the figure in the Salesforce docs. The object store holds replay IDs, not the events.',
    },
    {
      type: 'single',
      prompt: 'The listener logs `403::Organization total events daily limit exceeded`. What is the right reaction?',
      options: [
        'Stop the listener or app and wait for the allocation to reset; a reconnection strategy will not restore it',
        'Set Reconnect Forever so the connector keeps trying until events flow again',
        'Set Throw Exception When Organization Daily Limit Exceeded so retries are delayed',
        'Treat it like `403::Unknown client` and let the connector handshake again',
      ],
      answer: 0,
      explain: 'The docs say this is not a transient connection failure. The Throw Exception option throws at deployment when the limit is already reached and does not control retry delays. `403::Unknown client` is the error that a reconnect and resubscribe recovers from.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about reading records with the connector are correct?',
      options: [
        'The Query operation is deprecated, and the reference points to Query Xml Stream instead',
        'Query All retrieves data whether or not the records have been deleted',
        'Create Query Job Bulk Api V2 accepts QUERY or QUERY_ALL as its operation',
        'Query Xml Stream returns one unpaginated array of Java objects',
      ],
      answer: [0, 1, 2],
      explain: 'Query Xml Stream returns paginated results, and each result is an InputStream of XML records, so the mapping changes when you migrate from Query.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of a Bulk API v2 load with the connector.',
      items: [
        'Transform the source data to CSV, matching the line ending and column delimiter of the job',
        'Create Job Bulk Api V2 with the object type and operation',
        'Get Job State Bulk Api V2 until the job has finished',
        'Retrieve Job Failed Results Bulk V2 and Retrieve Job Unprocessed Results Bulk V2',
        'Route the failed and unprocessed rows for correction and report the counts',
      ],
      explain: 'Create Job takes the data as its sObjects parameter. The job runs in Salesforce, so the flow has to come back for the state and the per-record results.',
    },
  ],
  description: `
A logistics company runs Salesforce Service Cloud next to a Mule integration layer. ms-019 covered the basics of upsert, query and Bulk API; this problem goes deeper into streaming and the connector's less familiar operations.

**Requirements**
- Salesforce publishes about **40,000 \`Shipment_Update__e\` platform events per day**. Mule must forward them to the customer notification platform.
- Account changes must reach the data warehouse through **Change Data Capture** (\`/data/AccountChangeEvent\`).
- A monthly extract of all Cases, including deleted ones (about **9 million rows**), must go to the archive.
- A new nightly load must use the **Bulk API v2 operations** of the connector and report rejected rows.

**Concerns from the review**
- The org has hit its daily event delivery allocation before.
- The app runs on more than one replica.
- Two teams each want their own flow on the same channel.
- Existing flows still use the Query operation and Basic Authentication.

**Questions**
1. Which sources and channels do you use, and how do you choose a Replay Option?
2. What is stored in the object store, and what does that mean on a cluster and on CloudHub?
3. What uses event quota, and how do you limit it?
4. Which operations do you use for the extract and the nightly load?
5. What do you change in the existing flows?
`,
  answerTemplate: `## Sources and replay options

## Object store and clustering

## Event quota

## Extract and nightly load

## Changes to existing flows
`,
  keyPoints: [
    'Replay Channel Listener: platform events (/event/...), CDC (/data/...) and legacy generic events. Replay Topic Listener: legacy PushTopic events. The docs say you can use the Salesforce Pub/Sub Connector for new platform event and CDC integrations.',
    'Retention: the event processing page says 72 hours, or 24 hours for PushTopic and generic events, but the connector reference says 24 hours for both Replay sources. So verify it in the Salesforce docs. Older events are discarded.',
    'ONLY_NEW and ALL ignore replayId. FROM_REPLAY_ID uses the Replay Id field. FROM_LAST_REPLAY_ID uses the highest stored ID, processed successfully or not.',
    'The failed-event option starts from the lowest failed ID, filters what already succeeded, overrides Replay Option and can use extra quota.',
    'The source must run on the primary node of a cluster. In non-cluster mode with several workers it runs on all of them and consumes events twice, so on CloudHub run one worker and hand messages to the others through a shared queue.',
    'Each delivery counts against quota: replays, resubscribes, duplicate listeners and several flows on one channel all add to it. Cache Events In Memory reduces quota use when the flow is slow.',
    '403::Organization total events daily limit exceeded is not transient; 403::Unknown client is recovered by reconnecting and resubscribing.',
    'Query is deprecated in favour of Query Xml Stream. Basic Authentication is supported by Salesforce API v64.0 and below, so plan a move to an OAuth connection type.',
  ],
  solution: `
**1. Sources and replay options.**
- \`Shipment_Update__e\`: **Replay Channel Listener** on \`/event/Shipment_Update__e\`.
- Account changes: **Replay Channel Listener** on \`/data/AccountChangeEvent\`, after enabling CDC for Account in Setup.
- Use **ONLY_NEW** for a first go-live that must not pull history, **FROM_LAST_REPLAY_ID** for a simple resume after restarts, and the **failed-event option** when a failed event must be handled again. Remember that this option overrides Replay Option and can use extra quota.
- For a new integration, also evaluate the **Salesforce Pub/Sub Connector**, which the docs name as an option for platform events and CDC.

**2. Object store and clustering.** The connector stores **replay IDs**, not events, so it can resume after a restart.
- Local: a persistent store on the file system.
- Cluster: a distributed in-memory store, which is lost if the whole cluster stops unless you configure a persistent object store.
- CloudHub: the docs warn that Object Store v2 lacks distributed locking, so the last known replay ID may not be found and all events can replay on restart. Consumers must therefore be idempotent.
- The source must run on the **primary node**. Running on several nodes causes duplicate consumption and object store corruption. In non-cluster mode with several workers the source runs on all of them, so run the listener app on one worker and pass messages to the others through a shared queue.

**3. Event quota.** Each delivery counts. Keep **one flow per channel** and fan out inside Mule: a second flow on the same channel consumes the events again, and resume options on several sources for the same events can cause data corruption and event loss. Turn on **Cache Events In Memory** when processing is slow. Monitor event consumption, not only app status. When \`403::Organization total events daily limit exceeded\` appears, stop the listener and wait for the reset.

**4. Extract and nightly load.**
- Extract: **Create Query Job Bulk Api V2** with operation \`QUERY_ALL\`, so deleted Cases are included. Then use **Get Query Job Info Bulk Api V2** and **Get Query Job Results Bulk Api V2**, which has a Max Records Per Page parameter.
- Load: **Create Job Bulk Api V2** (insert, update, delete, hardDelete or upsert; Line Ending defaults to LF and Column Delimiter to COMMA), then **Get Job State Bulk Api V2** and the **Retrieve Job Failed / Successful / Unprocessed Results Bulk V2** operations. **Abort Job Bulk Api V2** stops a job started by mistake.

**5. Existing flows.**
- Replace **Query** with **Query Xml Stream** and adapt the mapping, because the result is paginated XML streams.
- Basic Authentication is listed as supported by Salesforce API v64.0 and below. Move to **OAuth v2.0, OAuth JWT, OAuth Client Credentials or OAuth SAML**.
- Avoid personal user accounts. Note that changing a configuration's username stops the connector from loading the last processed and failed replay IDs, so plan that change as a controlled cut-over.
`,
  followUps: [
    {
      q: 'What does changing the integration user do to a running subscription?',
      a: 'The docs say a changed username stops the connector from loading the last processed and failed replay IDs. Record the last replay ID first and restart with FROM_REPLAY_ID, within the retention window.',
    },
    {
      q: 'How do you set a Salesforce field to null with Update or Upsert?',
      a: 'List the field names in `fieldsToNull` in the Transform Message before the operation. Leaving the field out of the record does not clear it.',
    },
    {
      q: 'The connector metadata for Convert Lead does not show a lead ID. How do you pass it?',
      a: 'Set `leadId` yourself in a Transform Message that builds a `org.mule.extension.salesforce.api.core.LeadConvertRequest`. The docs note that the operation metadata does not specify it.',
    },
    {
      q: 'What does Query Time Buffer do on On New Object or On Modified Object?',
      a: 'It subtracts a number of seconds (0 to 120) from the current time when querying for changes. If Since is empty, the source retrieves objects from the time the Mule app started.',
    },
  ],
}
