export default {
  id: 'ms-329',
  category: 'mulesoft',
  title: 'A Restart App That Replays Failed Messages Without Making Things Worse',
  level: 'EXPERT',
  tags: ['myproject', 'batch', 'restart', 'replay', 'jms', 'idempotency', 'health-check'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'An inbound adapter puts messages it could not load on a failure queue. Why use a separate restart app to replay them?',
      options: [
        'Apps must be small',
        'It can wait for the cause to clear, check health, cap the rate, and be run on demand, without slowing the main adapter',
        'JMS requires it',
        'To save licenses',
      ],
      answer: 1,
      explain: 'Instant retries in the main flow often hit the same outage again.',
    },
    {
      type: 'single',
      prompt: 'What should the restart app check before it replays anything?',
      options: [
        'The time of day',
        'The health of what the main adapter needs, such as the database and blob storage',
        'The size of the failure queue only',
        'Nothing',
      ],
      answer: 1,
      explain: 'Replaying into a broken database fails every message again and raises its attempt count.',
    },
    {
      type: 'single',
      prompt: 'The app consumes a message from the failure queue and publishes it to the main queue. The app crashes between the two. How do you avoid losing it?',
      options: [
        'Log the message first',
        'Consume and publish in one transaction on the same broker, or publish first and then acknowledge the consume',
        'Publish twice',
        'Use a bigger worker',
      ],
      answer: 1,
      explain: 'Publish first, acknowledge after, may create a duplicate. The adapter must be idempotent anyway.',
    },
    {
      type: 'multi',
      prompt: 'What should travel with a replayed message?',
      options: [
        'The original message ID and correlation ID',
        'An attempt count',
        'The original error type',
        'A new random message ID',
      ],
      answer: [0, 1, 2],
      explain: 'A new ID breaks duplicate checks and the trail in the job log.',
    },
    {
      type: 'single',
      prompt: 'One message fails with a schema error every time it is replayed. What do you do?',
      options: [
        'Replay it forever',
        'Park it after a set number of attempts, or at once for errors that will not fix themselves, and alert with the reason',
        'Delete it quietly',
        'Raise the timeout',
      ],
      answer: 1,
      explain: 'A poison message blocks attention and wastes runs. Parking keeps it for repair.',
    },
    {
      type: 'single',
      prompt: 'After a long outage there are 40,000 messages on the failure queue. What protects the main adapter?',
      options: [
        'Replay all at once',
        'Replay in limited batches per run, oldest first, and watch the main queue depth and errors',
        'Delete half of them',
        'Restart the broker',
      ],
      answer: 1,
      explain: 'A flood after an outage can cause a second outage.',
    },
  ],
  description: `
Brindle Outdoor runs an inbound adapter that loads item messages from a JMS queue into Oracle. Messages that fail go to a failure queue. A restart app reads the failure queue in a loop and puts messages back on the main queue. After a database outage, the restart app ran too early. Every message failed again, some were lost when the app crashed, and a few loaded twice.

**Questions**
1. What does a good restart app check before it replays?
2. How do you move a message without losing it?
3. How do you stop duplicates and poison messages?
4. How do you replay a large backlog safely?
`,
  answerTemplate: `## Before replaying

## Moving a message safely

## Duplicates and poison messages

## A large backlog
`,
  keyPoints: [
    'Check the health of the database and blob storage first.',
    'Consume and publish in one transaction, or publish then acknowledge.',
    'Keep the original message ID and add an attempt count.',
    'The main adapter checks message IDs against the job log.',
    'Park poison messages with a reason and alert.',
    'Replay in limited batches, oldest first.',
  ],
  solution: `
**1. Before replaying.** Run a health check on what the adapter needs: a light query on the database and a metadata call on blob storage. If one is down, replay nothing, log it and try on the next run.

**2. Moving a message.** With both queues on the same broker, use a transacted JMS session so the consume and the publish commit together. Otherwise publish first and acknowledge the consume after. A crash then causes a duplicate rather than a loss.

**3. Duplicates and poison messages.** Keep the original message ID and correlation ID, and add an attempt count. The main adapter checks the message ID against the job log and refuses one that loaded. The restart app drops messages the job log shows as loaded, and parks messages that reached the attempt limit or have errors that will not fix themselves, such as schema errors. Parked messages go to a parking queue or table with the reason and raise one alert.

**4. A large backlog.** Replay a limited number per run, oldest first. Watch the main queue depth and error rate, and pause if errors rise. Log each run with counts replayed, parked, dropped and left.
`,
  followUps: [
    {
      q: 'Should the restart app run on a scheduler or on demand?',
      a: 'Both work. A scheduler with a health check covers short outages. On demand runs suit support after a known fix.',
    },
    {
      q: 'Why keep the message on the failure queue when the health check fails?',
      a: 'Nothing is lost and no attempt is used. The next run tries again once the database is back.',
    },
    {
      q: 'How do you know the replay worked?',
      a: 'The job log shows the message IDs as loaded, and the failure queue shrinks. A report compares both.',
    },
  ],
}
