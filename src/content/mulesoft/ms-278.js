export default {
  id: 'ms-278',
  category: 'mulesoft',
  title: 'SFTP Connection Pooling and Reconnection: Session Limits, Idle Timeouts and Safe Retries',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'connection-pooling', 'reconnection', 'retries', 'error-handling'],
  estMinutes: 24,
  quiz: [
    {
      type: 'single',
      prompt: 'A partner allows two SFTP sessions per account. A Mule flow writes eight files in parallel and many writes fail at login. What is the fix?',
      options: [
        'Turn off pooling, so each write opens and closes its own session',
        'Cap the pool at two active connections and parallel writes at two',
        'Add a reconnection strategy that retries failed logins five times',
        'Raise the connection timeout so logins wait for a free session',
      ],
      answer: 1,
      explain: 'The pool caps how many sessions Mule opens. Extra work waits for a free connection instead of failing at the server.',
    },
    {
      type: 'single',
      prompt: 'What does a reconnection strategy on the SFTP config do?',
      options: [
        'Reruns the whole flow from the source when any SFTP error occurs',
        'Retries a failed connection a set number of times with a delay',
        'Switches to a backup host listed in the connection config',
        'Retries any failed operation, including access denied errors',
      ],
      answer: 1,
      explain: 'It covers connection problems. Errors such as a missing file or a denied path are not fixed by reconnecting.',
    },
    {
      type: 'single',
      prompt: 'A firewall drops idle connections after five minutes. Pooled connections are then dead and the next write fails. What helps?',
      options: [
        'Raise the connection timeout above five minutes',
        'Evict idle pooled connections before five minutes, or validate them',
        'Add more connections to the pool so fewer sit idle',
        'Set the pool exhausted action to wait instead of fail',
      ],
      answer: 1,
      explain: 'Keep idle connections shorter lived than the network allows. Check the pooling settings your connector version offers.',
    },
    {
      type: 'multi',
      prompt: 'You wrap the SFTP Write in Until Successful. What makes this safe?',
      options: [
        'The write goes to a temporary name with OVERWRITE, so a retry replaces a partial file',
        'A limited number of retries with a delay',
        'An alert when retries are used up',
        'Retrying on every error type, including access denied',
      ],
      answer: [0, 1, 2],
      explain: 'Retry only errors that can heal, such as connectivity. Access denied or an illegal path will fail every time.',
    },
    {
      type: 'single',
      prompt: 'Which SFTP error type is worth retrying?',
      options: ['SFTP:CONNECTIVITY', 'SFTP:ACCESS_DENIED', 'SFTP:ILLEGAL_PATH', 'SFTP:FILE_ALREADY_EXISTS'],
      answer: 0,
      explain: 'A dropped connection can work on the next try. The others need a person or a code change.',
    },
    {
      type: 'single',
      prompt: 'At 02:00 the partner server is slow to accept connections because many clients run batches. What do you change?',
      options: [
        'Open more pooled connections early, so some are ready at 02:00',
        'Raise the connect timeout a little and move the run off the peak',
        'Set the connect timeout to zero so the client never gives up',
        'Retry every failed connection at once, with no delay between tries',
      ],
      answer: 1,
      explain: 'A modest timeout rise avoids false failures. Shifting the run spreads the load for everyone.',
    },
  ],
  description: `
Brindle Outdoor sends several files each night to a logistics partner over SFTP. The partner allows two sessions per account, and its firewall closes idle connections after five minutes. Since a new parallel flow went live, about one run in five fails with login and connection errors, and support reruns them by hand.

**Questions**
1. Why are the runs failing?
2. How should the connection pool be set?
3. What does reconnection cover, and what does it not?
4. How do you retry safely?
`,
  answerTemplate: `## Why runs fail

## Pool settings

## Reconnection

## Safe retries
`,
  keyPoints: [
    'Parallel writes open more sessions than the partner allows.',
    'Cap the pool at the partner limit and match the parallelism.',
    'Evict or validate idle connections before the firewall drops them.',
    'Reconnection retries opening a connection, not business errors.',
    'Retry connectivity errors only, with a limit, on a temporary name.',
  ],
  solution: `
**1. Why runs fail.** The new flow writes in parallel, so Mule opens more sessions than the partner allows and the server rejects the extra logins. Pooled connections that sit idle past five minutes are closed by the firewall, so the next write on them fails.

**2. Pool settings.** Set the pooling profile to at most two active connections, and set the parallel for each or flow concurrency to match. Evict idle connections after less than five minutes, or validate them before use, so a dead one is replaced instead of used.

**3. Reconnection.** A reconnection strategy retries opening the connection a set number of times with a delay. It helps when the server or network is briefly down. It does not fix access denied, a wrong path or a file that already exists, and it does not resend data.

**4. Safe retries.** Put the write in Until Successful or an error handler that retries only SFTP:CONNECTIVITY, a few times with a delay. Write to a temporary name with OVERWRITE, so a retry replaces a partial file, and rename at the end. When retries run out, alert and leave the run in a state that can be resumed.
`,
  followUps: [
    {
      q: 'Why not open a new connection for every file?',
      a: 'Each SSH login costs time and a key exchange, and some servers rate limit logins. Pooling reuses sessions within the partner limit.',
    },
    {
      q: 'Two apps use the same partner account. What changes?',
      a: 'They share the session limit. Split the limit between them, or ask the partner for separate accounts, which also helps audit.',
    },
    {
      q: 'How do you tell a login rejection from a network problem in logs?',
      a: 'Log the error type and message. Authentication failures show up as access or auth errors, while network problems are timeouts or refused connections.',
    },
  ],
}
