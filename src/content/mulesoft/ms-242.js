export default {
  id: 'ms-242',
  category: 'mulesoft',
  title: 'Queue Basics for Interviews: Acknowledgement, Redelivery, Persistence and VM Queues',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'vm-connector', 'persistence', 'acknowledgement', 'fundamentals', 'messaging'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'An Anypoint MQ subscriber uses MANUAL acknowledgement. The flow inserts the order into the database, and the replica crashes before the Ack operation runs. What happens to the message?',
      options: [
        'It is lost, because the subscriber had already taken it off the queue',
        'It goes straight to the dead letter queue, because the consumer crashed',
        'It is delivered again after the acknowledgement timeout, so the insert can run twice',
        'It stays locked to the crashed replica until that replica restarts and acks it',
      ],
      answer: 2,
      explain: 'Receiving a message only locks it. Until the Ack, the broker keeps it, and when the acknowledgement timeout ends it is delivered again, maybe to another replica, so the insert can repeat. It is not lost, because receiving never removes a message. A crash counts as one delivery; it goes to the dead letter queue only when max deliveries is reached. The lock is not tied to a replica, so no one waits for the crashed one.',
    },
    {
      type: 'single',
      prompt: 'A flow reads a queue, posts a payment to a partner API, then acks. A replica can crash after the post and before the ack. Which design stops a double payment?',
      options: [
        'Ack the message as soon as it is received, before calling the partner',
        'Use a persistent queue, so the broker does not deliver the message twice',
        'Wrap the partner call and the ack in one XA transaction',
        'Send a unique payment id, and reject a repeat of that id before paying',
      ],
      answer: 3,
      explain: 'The queue gives at least once delivery: the broker cannot tell "never processed" from "processed but not acknowledged", so it sends the message again. The consumer must cope with repeats, and a unique id checked before paying does that. Acking on receipt avoids repeats but loses the payment if the replica crashes during the call. Persistence keeps messages through a broker restart; it does not stop redelivery. An HTTP call cannot join an XA transaction.',
    },
    {
      type: 'match',
      prompt: 'Match each term to its meaning.',
      pairs: [
        ['Point to point', 'Each message goes to one consumer'],
        ['Publish subscribe', 'Each subscriber gets its own copy'],
        ['Redelivery', 'The broker sends a message again after a failure or missing acknowledgement'],
        ['Dead letter queue', 'Where messages go after too many failed attempts'],
      ],
      explain: 'Queues are point to point. Topics and exchanges are publish subscribe. A dead letter queue stops one bad message from being retried forever.',
    },
    {
      type: 'single',
      prompt: 'A VM queue is set as transient. The Mule app restarts with 300 messages waiting. What happens to them?',
      options: [
        'They are kept on disk and processed after restart',
        'They are lost, as a transient queue is in memory',
        'They are kept, if the VM listener reads them in a transaction',
        'They are saved to the object store on shutdown and reloaded',
      ],
      answer: 1,
      explain: 'Transient VM queues are in memory and fast. Persistent VM queues keep messages across a restart, at a cost in speed.',
    },
    {
      type: 'multi',
      prompt: 'An order app splits its work into steps, and also sends a daily summary to a separate billing app on another server. The team considers VM queues for both. Which statements are true?',
      options: [
        'VM queues fit the steps inside the order app, so each step can fail and retry on its own',
        'A VM queue can carry the summary to the billing app if both apps use the same queue name',
        'On a customer hosted runtime, apps that share a domain can share VM queues',
        'A persistent VM queue keeps its messages across an app restart, at a cost in speed',
        'Deploying both apps to the same CloudHub 2.0 private space lets them share VM queues',
      ],
      answer: [0, 2, 3],
      explain: 'VM queues stay inside one app, or inside apps of one shared domain on a customer hosted runtime. A matching queue name in another app on another server reaches nothing. Domains are not available on CloudHub, and a private space is a network, not a shared runtime. Messages between separate apps need a broker such as Anypoint MQ or a JMS broker.',
    },
    {
      type: 'order',
      prompt: 'Order what happens to one message that fails twice and then succeeds.',
      items: [
        'The producer publishes the message and the broker stores it',
        'The broker delivers it to a consumer, which fails before acknowledging',
        'The broker delivers it again, and it fails again',
        'The third delivery succeeds and the consumer acknowledges it',
        'The broker removes the message',
      ],
      explain: 'Each failed try counts as a delivery. If a maximum is set and reached, the message goes to the dead letter queue instead.',
    },
  ],
  description: `
Bramblecote Insurance is hiring an integration developer. The first interview round checks queue basics. The panel asks the candidate to explain, with one claims intake example, how a message moves through a queue and what can go wrong.

**Questions**
1. What do acknowledgement and redelivery mean, and why does "at least once" matter?
2. What is the difference between a queue and a topic or exchange?
3. When would you use a VM queue, and transient or persistent?
4. When do you need a broker instead of a VM queue?
`,
  answerTemplate: `## Acknowledgement and redelivery

## Queue or topic

## VM queues

## When a broker is needed
`,
  keyPoints: [
    'An acknowledged message is removed. An unacknowledged one can be delivered again.',
    'At least once delivery means consumers must handle repeats.',
    'A queue gives each message to one consumer. A topic or exchange gives each subscriber a copy.',
    'A dead letter queue holds messages that failed too many times.',
    'Transient VM queues are in memory and lose messages on restart. Persistent ones keep them.',
    'VM queues stay inside one app or domain. Separate apps need a broker.',
  ],
  solution: `
**1. Acknowledgement and redelivery.** A claim arrives as a message. The broker keeps it until a consumer acknowledges it. If the consumer crashes or fails before that, the broker delivers it again. A consumer can also finish the work and crash right before acknowledging, so the same claim can arrive twice. That is "at least once" delivery, and it is why the consumer should check whether a claim id was already handled.

**2. Queue or topic.** On a queue, each message goes to one consumer, which spreads the work. On a topic or an exchange, each subscriber gets its own copy, which suits "tell every interested system".

**3. VM queues.** The VM connector passes messages between flows in one app, or apps in one domain. It is useful to split intake into steps: the HTTP flow writes to a VM queue and answers at once, and another flow does the slow work. A transient queue is fast but in memory, so a restart loses waiting messages. A persistent queue keeps them, which is the right choice for claims.

**4. When a broker is needed.** When separate apps exchange messages, or messages must survive more than one app's lifetime, use a broker such as Anypoint MQ or a JMS broker. A broker also gives dead letter queues, monitoring and consumers in other teams.
`,
  followUps: [
    {
      q: 'How would a consumer detect a claim it already handled?',
      a: 'Store each processed claim id in a database table or Object Store, and check it before doing the work. A unique key on the table catches two copies arriving at once.',
    },
    {
      q: 'Is a persistent VM queue as safe as a broker?',
      a: 'It survives an app restart, but it lives with the app and its storage. A broker is run and backed up on its own and serves many apps, which suits critical data better.',
    },
    {
      q: 'What is a poison message?',
      a: 'A message that fails every time, for example because of bad data. Without a delivery limit it loops forever and blocks others, so it should land in a dead letter queue.',
    },
  ],
}
