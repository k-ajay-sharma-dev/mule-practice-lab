export default {
  id: 'ms-067',
  category: 'mulesoft',
  title: 'Available-to-Promise over ActiveMQ: JMS Request-Reply with publish-consume, Reply-To, Correlation and Timeouts',
  level: 'ADVANCED',
  tags: ['retail', 'supply-chain', 'jms', 'activemq', 'request-reply', 'atp', 'timeouts'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'What does `jms:publish-consume` do when **no** reply-to destination is configured?',
      options: [
        'It publishes the request with a temporary reply destination and waits for the reply on it',
        'It publishes and returns immediately with an empty payload',
        'It fails because reply-to is mandatory',
        'It waits for any message on the request queue',
      ],
      answer: 0,
      explain: 'publish-consume is synchronous request-reply: Mule creates a temporary destination for the reply unless you name one, sets it as JMSReplyTo and blocks until the reply arrives or the wait times out.',
    },
    {
      type: 'single',
      prompt: 'The responder is a Mule flow with a `jms:listener` on `ATP.REQUEST`. How does it send the answer back?',
      options: [
        'The listener sends the flow result to the JMSReplyTo destination of the request automatically',
        'It must call jms:publish-consume back to the caller',
        'It sends an HTTP callback to the caller',
        'The broker copies the request back to the caller',
      ],
      answer: 0,
      explain: 'When a received message carries a reply-to destination, the JMS listener replies to it with the flow result (you can shape the reply with the listener response settings).',
    },
    {
      type: 'single',
      prompt: 'Replies go to a fixed shared queue `ATP.REPLY` read by 3 replicas of the caller. Why is correlation essential?',
      options: [
        'Each waiting request must pick only the reply whose correlation matches its own request, not any reply on the queue',
        'JMS requires correlation IDs on every message',
        'Correlation makes the broker deliver faster',
        'It is only needed for topics',
      ],
      answer: 0,
      explain: 'On a shared reply queue many replies for many callers are mixed together. The responder must copy the request correlation (message ID or correlation ID) into the reply, and the waiting consumer selects on it.',
    },
    {
      type: 'multi',
      prompt: 'The WMS responder is slow during peak and the checkout API calls publish-consume with a 2-second maximum wait. Which statements are true?',
      options: [
        'If no reply arrives in time, the operation raises JMS:TIMEOUT, which the checkout flow should handle (e.g. fallback ATP from cache)',
        'A reply that arrives after the timeout is not delivered to the original request',
        'Setting a time-to-live on the request lets the broker discard requests nobody will wait for anymore',
        'The timeout cancels the processing that the responder already started',
      ],
      answer: [0, 1, 2],
      explain: 'The caller stops waiting, but the responder does not know that; it may still process the request. A TTL on requests stops stale work queuing up, and late replies have to be expired or ignored.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of one ATP check.',
      items: [
        'Checkout API calls jms:publish-consume on ATP.REQUEST with a reply-to destination and a maximum wait',
        'The request carries a correlation value and a time-to-live',
        'The WMS responder flow receives it with jms:listener and calculates availability',
        'The listener sends the result to the reply-to destination with the matching correlation',
        'publish-consume returns the reply as its payload, or raises JMS:TIMEOUT',
      ],
      explain: 'Request-reply on JMS is two one-way messages joined by reply-to and correlation, with the caller blocking for a bounded time.',
    },
    {
      type: 'single',
      prompt: 'Why might an architect still prefer an HTTP System API for ATP instead of JMS request-reply?',
      options: [
        'Checkout is synchronous anyway; JMS request-reply adds broker hops, reply-queue management and timeout edge cases without decoupling the caller',
        'JMS cannot carry JSON',
        'JMS request-reply is not supported in Mule 4',
        'HTTP always guarantees delivery',
      ],
      answer: 0,
      explain: 'Request-reply over messaging is useful when the responder is only reachable via the broker or needs its load buffering, but the caller still waits. So you do not gain the decoupling of true async.',
    },
  ],
  description: `
An omnichannel retailer checks **available-to-promise (ATP)** before confirming web and BOPIS (buy online, pick up in store) orders. The store and DC stock engine runs inside the **WMS** network and is only reachable via **ActiveMQ**; it listens on \`ATP.REQUEST\` and answers each request.

The Checkout Process API (3 replicas) currently does:
\`\`\`xml
<jms:publish-consume config-ref="amq" destination="ATP.REQUEST" requestReplyPattern="NONE" maximumWait="2" maximumWaitUnit="SECONDS">
  <jms:message>
    <jms:reply-to destination="ATP.REPLY"/>
  </jms:message>
</jms:publish-consume>
\`\`\`

Problems during a Black Friday load test:
- Some customers saw availability for **someone else's basket**.
- Under load many calls ended in \`JMS:TIMEOUT\`, the checkout failed, and minutes later \`ATP.REPLY\` contained thousands of unclaimed replies.
- The WMS kept processing requests whose callers had given up long ago.

**Questions**
1. How does \`jms:publish-consume\` implement request-reply, and how does the responder answer?
2. Explain temporary vs fixed reply destinations and the role of correlation. What caused the wrong answers?
3. How should timeouts, late replies and stale requests be handled?
4. When would you choose HTTP or a true asynchronous design instead?
`,
  answerTemplate: `## How publish-consume works

## Reply destinations and correlation

## Timeouts, late replies and stale requests

## Alternatives
`,
  keyPoints: [
    'jms:publish-consume publishes a request with JMSReplyTo and blocks until a reply arrives or maximumWait expires (JMS:TIMEOUT).',
    'Without an explicit reply-to Mule uses a temporary destination, private to the caller connection; a fixed shared reply queue needs correlation.',
    'The responder must return the reply with the correlation of the request; the jms:listener replies to JMSReplyTo automatically.',
    'Timeouts do not stop the responder: set a request time-to-live, expire late replies, and design a fallback for JMS:TIMEOUT.',
    'Request-reply over JMS keeps the caller synchronous; use it when the responder is only reachable via the broker, otherwise consider HTTP or a fully async flow.',
  ],
  solution: `
**1. Mechanics.** \`publish-consume\` sends the request with a **JMSReplyTo** header and then consumes from that reply destination, blocking up to \`maximumWait\`. On the responder side a \`jms:listener\` that receives a message with a reply-to destination sends the flow result there automatically:
\`\`\`xml
<flow name="atp-responder">
  <jms:listener config-ref="amqWms" destination="ATP.REQUEST"/>
  <flow-ref name="calculate-atp"/>   <!-- result becomes the reply -->
</flow>
\`\`\`

**2. Reply destinations and correlation.**
- **Temporary destination** (no reply-to configured): created for the caller connection, only that caller can consume it, it disappears with the connection. Simple and isolated.
- **Fixed shared queue** (\`ATP.REPLY\`): visible and monitorable, survives reconnects, but replies for all 3 replicas and all concurrent requests land in one queue. Each waiting request must only take its own reply. That means the responder must put the request's correlation (message ID or correlation ID) into the reply, and the consumer must select on it.

The wrong answers came from \`requestReplyPattern="NONE"\`: the consumer then reads the reply queue without any selector, which suits a temporary queue holding one message. But on a shared queue it takes whichever reply is next, including one meant for another basket. Fix it with the default \`CORRELATION_ID\` (or \`MESSAGE_ID\`), where the operation uses a selector that expects the same value as the request. Make sure the responder returns that value (a Mule listener sets the pattern in its \`jms:response\`). A responder that does not return it never matches, so the caller ends in \`JMS:TIMEOUT\`. Going back to temporary reply destinations also works.

**3. Timeouts and stale work.**
- Handle \`JMS:TIMEOUT\` in the checkout flow: fall back to a cached ATP snapshot or accept the order as "pending confirmation" rather than failing checkout.
- Set a **time-to-live** on requests slightly above the caller wait, so the broker drops requests nobody waits for; the responder can also check the request age.
- Late replies on a fixed queue are orphans: set a TTL on replies too, or use temporary destinations whose late replies are discarded with the connection.
- Size the responder (consumers, WMS capacity) for peak; a timeout only hides overload.

**4. Alternatives.** Checkout waits anyway, so if the WMS can expose an HTTP endpoint, a **System API** with timeouts, caching and circuit breaking is simpler. Keep JMS request-reply when the broker is the only route into the WMS network. If the business accepts "confirm later", use a **fully asynchronous** design: publish an ATP request, confirm the order as pending, and process the reply event when it arrives.
`,
  followUps: [
    {
      q: 'What happens to a temporary reply queue if the caller replica crashes mid-request?',
      a: 'The temporary destination is tied to the connection, so it goes away with it and the reply cannot be delivered; the responder may get an error sending to it. The checkout request itself fails and the client retries.',
    },
    {
      q: 'How do you correlate logs across caller and responder?',
      a: 'Send the Mule correlation ID (or the order ID) as a message property and log it on both sides, so one search shows request, processing and reply.',
    },
    {
      q: 'Could you use the VM connector publish-consume instead?',
      a: 'Only inside one Mule app (or a domain on-prem); VM queues cannot reach the WMS network. JMS is used here because the broker is the integration point.',
    },
  ],
}
