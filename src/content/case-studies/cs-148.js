export default {
  id: 'cs-148',
  category: 'case-studies',
  title: 'Mobile Network Moving Customer Text Messages From One Gateway to Two, With Failover',
  level: 'ADVANCED',
  tags: ['notifications', 'failover', 'partners', 'resilience', 'telecom'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Many apps send texts through the gateway directly. What is the first change?',
      options: [
        'Put one Messaging API in front of the gateways for every app to use',
        'Give every app credentials for both gateways and a failover rule',
        'Move half of the 30 apps to gateway B and leave the rest on A',
        'Add gateway B as a DNS fallback for gateway A’s address',
      ],
      answer: 0,
      explain: 'Failover and routing can only be done in one place if every app goes through that place. Both credentials in 30 apps doubles the secrets, splitting apps leaves half the logins down in an outage, and the two providers have different APIs.',
    },
    {
      type: 'single',
      prompt: 'Gateway A starts timing out. When should messages switch to gateway B?',
      options: [
        'When a circuit breaker sees errors pass a limit',
        'When the on-call engineer sees the alert and switches by hand',
        'After the first timeout, for every message from then on',
        'When gateway A’s status page reports an incident',
      ],
      answer: 0,
      explain: 'A breaker reacts to a pattern of failures, not one blip, and switches without waiting for a person or a status page.',
    },
    {
      type: 'multi',
      prompt: 'Which three stop a customer receiving the same code twice after a failover?',
      options: [
        'Give each message an ID and record which gateway accepted it',
        'Only fail over messages that no gateway accepted',
        'Treat one-time codes as short lived, and do not resend after they expire',
        'Resend every message that timed out on gateway A through gateway B at once',
        'Send every login code through both gateways, so at least one arrives',
        'Move all traffic to gateway B for the rest of the day after one error',
      ],
      answer: [0, 1, 2],
      explain: 'Track what was accepted, retry only what was not, and drop codes that are no longer useful. A timeout does not mean gateway A failed to send, so resending every timeout at once can deliver the code twice. Sending through both gateways makes every code arrive twice when both work. Moving all traffic after one error is a failover rule, but it does nothing about messages gateway A already accepted.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Marketing sends 2 million texts at once, and login codes are delayed. What fixes it?',
      options: [
        'A separate high priority queue for one-time codes, read ahead of bulk sends',
        'One queue, with more consumers added during each campaign',
        'Send campaigns only at night, when few customers log in',
        'Send campaigns through gateway B and everything else through A',
      ],
      answer: 0,
      explain: 'Different kinds of message need different lanes. A code that arrives late is useless. More consumers still leave codes behind two million texts, night sends fail marketing’s timing, and fixing campaigns to B removes the failover for them.',
    },
    {
      type: 'match',
      prompt: 'Match each message type to its handling.',
      pairs: [
        ['Login code', 'High priority, short expiry, no resend after expiry'],
        ['Bill ready', 'Normal priority, retry for hours'],
        ['Marketing', 'Low priority, paced, respects opt outs'],
        ['Delivery receipt', 'Matched to the message ID and stored'],
      ],
      explain: 'Each type has its own priority, retry window and rules.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Build the Messaging API with message types and IDs',
        'Move the apps to the API one by one',
        'Add gateway B behind the API',
        'Add the circuit breaker and failover rules',
        'Test failover in a planned window with live traffic',
      ],
      explain: 'One entry point first, then move apps, then add the second gateway and failover, then prove it.',
    },
  ],
  description: `
**Context.** A mobile network sends **5 million texts a day**: login codes, bill alerts, service notices and marketing. All go through one SMS gateway provider.

**Facts gathered so far**
- Last month gateway A was down for 3 hours. Customers could not log in because codes did not arrive.
- About 30 internal apps call gateway A directly with shared credentials.
- A second provider, gateway B, has been contracted.
- Both gateways return delivery receipts by webhook.
- Marketing campaigns send millions of texts in an hour.

**Opinions**
- CTO: "A gateway outage must never stop logins again."
- Marketing: "Campaigns must still go out on time."
- Security: "Shared credentials in 30 apps worry me."

**Your task.** Design how texts are sent through two gateways, with failover and priorities.
`,
  answerTemplate: `## Decision

## Messaging API

## Priorities

## Failover

## Duplicates and receipts

## Moving the apps

## Risks
`,
  keyPoints: [
    'One Messaging API in front of both gateways.',
    'Separate queues by priority, so codes never wait behind campaigns.',
    'A circuit breaker switches gateways on a pattern of failures.',
    'Message IDs record which gateway accepted each message.',
    'Do not resend expired one-time codes.',
    'Remove gateway credentials from the 30 apps.',
  ],
  solution: `
**Decision.** A Messaging API takes every text with a type and an ID. Queues by priority feed senders that route to gateway A or B.

**Messaging API.** Apps send type, recipient and template data. Only the API holds gateway credentials.

**Priorities.** Codes on a high priority queue, alerts on normal, marketing on low with pacing and opt outs.

**Failover.** A circuit breaker on each gateway. When A fails past the limit, senders use B, and test A again after a pause.

**Duplicates and receipts.** Each message ID records the gateway that accepted it. Only unaccepted messages fail over. Receipts are matched by ID.

**Moving the apps.** One app at a time, then remove the old credentials.

**Risks.** Different delivery rates between gateways, codes resent after expiry, and apps that keep calling A directly.
`,
  followUps: [
    { q: 'Why not split traffic 50/50 all the time?', a: 'You can, and it keeps B warm. It still needs a breaker to move all traffic when one fails.' },
    { q: 'What if both gateways fail?', a: 'Codes expire, so offer another login method. Alerts and marketing wait on their queues.' },
    { q: 'How do you test failover?', a: 'Open the breaker on A in a planned window and watch codes go through B.' },
    { q: 'Why remove credentials from apps?', a: 'Any app could bypass priorities and failover, and 30 copies of a secret are 30 chances to leak it.' },
  ],
}
