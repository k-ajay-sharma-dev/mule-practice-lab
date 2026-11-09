import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-112',
  category: 'use-cases',
  title: 'Credit Checks over Request and Reply Queues with Correlation IDs',
  level: 'INTERMEDIATE',
  tags: ['async', 'request-reply', 'correlation-id', 'jms', 'messaging', 'telecom'],
  estMinutes: 30,
  diagram: {
    task: 'draw the async request and reply: the store app and its Experience API, the Process API that saves a pending check and sends the request, the request queue to the bureau gateway, the separate reply queue, the reply listener, the state store, the timeout sweeper, and how the result reaches the store app.',
    checks: [
      { label: 'Requests reach the bureau gateway through a request queue', rule: { type: 'edge', from: 'queue', to: 'external-api', kind: 'async' } },
      { label: 'Replies come back on a queue', rule: { type: 'edge', from: 'external-api', to: 'queue', kind: 'async' } },
      { label: 'Requests and replies use two different queues', rule: { type: 'node', match: 'queue', min: 2 } },
      { label: 'A reply listener reads the reply queue', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'Both the sender and the listener use the check state store', rule: { type: 'each', of: 'process-api', edgeTo: 'database', min: 2 } },
      { label: 'The store app never waits on the bureau in one sync chain', rule: { type: 'no-path', from: 'internal-app', to: 'external-api', kind: 'sync' } },
      { label: 'A scheduled job times out checks that got no reply', rule: { type: 'edge', from: 'batch-job', to: 'database' } },
      { label: 'The result reaches the store app after the reply arrives', rule: { type: 'path', from: 'external-api', to: ['notification', 'internal-app'] } },
    ],
    reference: diagram(
      {
        store: ['internal-app', 'Store sales app'],
        exp: ['experience-api', 'exp-credit-check-api'],
        prc: ['process-api', 'prc-credit-check'],
        st: ['database', 'Credit check state (by correlation ID)'],
        req: ['queue', 'BUREAU.CREDIT.REQ'],
        bur: ['external-api', 'Credit bureau MQ gateway'],
        rep: ['queue', 'BUREAU.CREDIT.REPLY'],
        rl: ['process-api', 'prc-credit-reply-listener'],
        job: ['batch-job', 'Timeout sweeper (every minute)'],
        push: ['notification', 'Push to store app'],
      },
      ['store -> exp', 'exp -> prc', 'prc -> st', 'prc ~> req', 'req ~> bur', 'bur ~> rep', 'rep ~> rl', 'rl -> st', 'rl -> push', 'job -> st', 'job -> push'],
    ),
  },
  description: `
A mobile operator runs a **credit check** before every postpaid contract signed in its **900 stores**. The credit bureau does not offer a REST API: it exchanges messages over **IBM MQ**.

Facts:
- The operator puts a request on \`BUREAU.CREDIT.REQ\`. The bureau answers on \`BUREAU.CREDIT.REPLY\` (shared by all requests).
- Replies take **2 to 40 seconds**; 1 % never come back.
- The bureau copies the request \`JMSMessageID\` or \`JMSCorrelationID\` into the reply \`JMSCorrelationID\`.
- About **25,000 checks per day**, peaks of 10 per second on Saturdays.
- The store app is a tablet app; the sales adviser can keep talking to the customer while the check runs.
- The result (approved, refer, declined, with a deposit amount) must be kept for **2 years** for the regulator.
- Mule 4 runs on CloudHub 2.0 with the **JMS connector** and the IBM MQ client.

**Describe your solution:**
- Why not use a single sync request-reply call (JMS \`publish-consume\`) from the API?
- How do you match a reply to the original request when several Mule replicas are running?
- How does the store app get the result?
- What happens when no reply comes, or a reply comes twice or very late?
`,
  answerTemplate: `## Why async

## Sending the request

## Correlating the reply

## Getting the result to the store

## Timeouts, duplicates and late replies
`,
  keyPoints: [
    'A 40 second wait inside an HTTP request ties up threads and fails behind gateway timeouts, so the API returns 202 Accepted with a check ID.',
    'The Process API saves a PENDING record keyed by a correlation ID before it sends, so a fast reply always finds its record.',
    'The correlation ID is sent as JMSCorrelationID and the reply listener looks it up in a shared store, so any replica can process any reply.',
    'The result reaches the store by push (or by the app polling GET /credit-checks/{id}); the state store also keeps the 2 year history.',
    'A sweeper marks checks with no reply after 60 seconds as TIMED_OUT; a late or repeated reply for a closed check is logged and ignored.',
  ],
  solution: `
\`\`\`
 store app -> exp-credit-check-api -> prc-credit-check -> state store (PENDING, correlationId)
                                                      ~> [BUREAU.CREDIT.REQ] ~> bureau
 bureau ~> [BUREAU.CREDIT.REPLY] ~> prc-credit-reply-listener -> state store (result)
                                                             -> push to store app
 sweeper (1 min) -> state store (TIMED_OUT) -> push
\`\`\`

**Why async.** JMS \`publish-consume\` sends and waits on a temporary reply queue. Here the bureau uses one fixed reply queue and up to 40 seconds. Holding an HTTP request that long blocks threads, breaks on load balancer timeouts, and loses the reply when the replica restarts. Asynchronous request-reply with a correlation ID solves all three.

**Sending the request.** \`POST /credit-checks\` returns **202 Accepted** with \`{ checkId, status: PENDING }\` and a \`Location\` header. Before publishing, the Process API inserts the PENDING row with \`correlationId = checkId\`. Write first, then send: a reply that arrives in 2 seconds must find its row. The message is persistent and carries \`JMSCorrelationID = checkId\` and \`JMSReplyTo = BUREAU.CREDIT.REPLY\`.

**Correlating the reply.** prc-credit-reply-listener consumes the reply queue on every replica. It reads \`JMSCorrelationID\`, finds the row with an update such as \`UPDATE ... SET status = :result WHERE correlation_id = :id AND status = 'PENDING'\`, and commits. Because the state is in a shared database, it does not matter which replica sent the request. Never keep pending requests in a replica's memory.

**Getting the result to the store.** The listener pushes the result to the tablet. The app also polls \`GET /credit-checks/{checkId}\` every 5 seconds as a fallback, which reads the state store.

**Timeouts, duplicates and late replies.** Every minute the sweeper marks rows PENDING for more than 60 seconds as **TIMED_OUT** and pushes "check could not be completed, retry or use manual referral". A reply for a row that is no longer PENDING updates nothing; it is logged for the bureau reconciliation. A reply that cannot be parsed goes to a backout queue.
`,
  followUps: [
    { q: 'Why insert the pending record before sending the request?', a: 'A fast reply could arrive before the insert. The listener would then find no record and drop a valid result.' },
    { q: 'Why can\'t the replica that sent a request keep it in memory until the reply?', a: 'Any replica may receive the reply, and a restart loses memory. A shared store lets every replica match any reply.' },
    { q: 'What does the conditional update on status PENDING protect against?', a: 'It ignores duplicate and late replies. A check that is closed or timed out cannot be changed again.' },
    { q: 'When is JMS publish-consume a good fit?', a: 'For short replies of a second or two where the responder supports temporary reply queues. The caller can then wait in the flow.' },
  ],
}
