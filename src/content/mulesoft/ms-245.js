export default {
  id: 'ms-245',
  category: 'mulesoft',
  title: 'IBM MQ From Mule: Queue Managers, Channels, RFH2 Headers, Character Sets and Backout Queues',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'ibm-mq', 'jms', 'backout-queue', 'rfh2', 'connector-config', 'manufacturing'],
  estMinutes: 20,
  quiz: [
    {
      type: 'multi',
      prompt: 'A Mule app connects to IBM MQ as a client. The host is reachable and the queue manager name is right, but the app fails with reason code 2035 (MQRC_NOT_AUTHORIZED). Which could cause it?',
      options: [
        'A channel authentication rule on the server connection channel blocks the user id the app sends',
        'The listener port is wrong, so nothing answers on that port',
        'The user has no authority to put to or get from the target queue',
        'The channel name has a typo, so no channel definition matches it',
        'The password is wrong, and the queue manager checks connection credentials',
      ],
      answer: [0, 2, 4],
      explain: 'A client connects through a listener on a host and port, to a named queue manager, over a server connection channel, often with user checks and TLS. Reason 2035 is a security refusal: a channel authentication rule, a failed user and password check, or missing authority on the queue. A wrong port fails earlier, with host not available (2538). An unknown channel name gives its own code (2540), not 2035.',
    },
    {
      type: 'single',
      prompt: 'A Mule app sends JMS messages with custom properties to a queue read by an older non JMS IBM MQ program. The program shows strange bytes before the data. Why?',
      options: [
        'The message body is encrypted on the channel',
        'JMS properties travel in an RFH2 header before the body',
        'Large messages are split into segments with headers',
        'The reader uses another CCSID, so the first bytes convert wrongly',
      ],
      answer: 1,
      explain: 'IBM MQ carries JMS headers and properties in an MQRFH2 header. A non JMS reader sees it as part of the data unless the sender omits it.',
    },
    {
      type: 'single',
      prompt: 'How can the sender leave out the RFH2 header for that reader?',
      options: [
        'Remove all custom properties in the flow',
        'Set targetClient to MQ on the queue URI',
        'Send a BytesMessage instead of a TextMessage',
        'Clear the JMSCorrelationID and JMSType headers',
      ],
      answer: 1,
      explain: 'Marking the destination for a non JMS client, with the target client set to MQ, is the fix. Removing custom properties alone still leaves the JMS headers in RFH2. Setting the target client to MQ makes IBM MQ send a plain message without RFH2. The custom properties are then not carried that way.',
    },
    {
      type: 'single',
      prompt: 'A message keeps failing and rolling back. The queue has a backout threshold and a backout queue set. What does the IBM MQ JMS client do once the threshold is reached?',
      options: [
        'Moves it to the queue manager dead letter queue',
        'Moves it to the backout queue',
        'Keeps rolling it back, as Mule must move it itself',
        'Raises a REDELIVERY_EXHAUSTED error in the flow',
      ],
      answer: 1,
      explain: 'The backout count rises on each rollback. At the threshold, the client moves the message to the backout queue, so it stops blocking the main queue. Without one, behaviour depends on configuration, such as the queue manager dead letter queue.',
    },
    {
      type: 'single',
      prompt: 'Text from a mainframe app arrives with wrong accented characters. What is the likely cause?',
      options: [
        'A TLS cipher on the channel that alters non ASCII bytes',
        'A CCSID mismatch between sender and reader',
        'An RFH2 header that changes how the body is encoded',
        'A message over MAXMSGL, cut in the middle of a character',
      ],
      answer: 1,
      explain: 'IBM MQ messages carry a coded character set id (CCSID). If it, or the conversion settings, do not match what the reader expects, accented letters break. Text must be converted correctly between the sender and reader encodings.',
    },
    {
      type: 'match',
      prompt: 'Match each IBM MQ term to its meaning.',
      pairs: [
        ['Queue manager', 'The server process that owns queues and channels'],
        ['SVRCONN channel', 'What a client app connects through'],
        ['Backout queue', 'Where repeatedly rolled back messages are moved'],
        ['CCSID', 'Identifies the character set of message text'],
      ],
      explain: 'These four come up in almost every IBM MQ integration and in its interviews.',
    },
  ],
  description: `
Harrowfield Engineering connects Mule to an IBM MQ queue manager that also serves older non JMS programs. Purchase orders come in from a mainframe, and shipping updates go out to a program written long before JMS. The team sees three problems: garbled characters, strange bytes at the start of outgoing messages, and one bad order that blocks the queue.

**Questions**
1. What does Mule need to connect to IBM MQ?
2. Why does the old program see strange bytes, and how do you fix it?
3. Why are characters garbled?
4. How do you stop one bad message from blocking the queue?
`,
  answerTemplate: `## Connecting

## RFH2

## Character sets

## Backout
`,
  keyPoints: [
    'A client connects with host, port, queue manager name and a server connection channel.',
    'Credentials and TLS settings come from the MQ team and live in secure properties.',
    'JMS properties travel in an RFH2 header that non JMS readers do not expect.',
    'Setting the target client to MQ sends a plain message without RFH2.',
    'Character set mismatches come from CCSID and conversion settings.',
    'A backout threshold and backout queue move poison messages out of the way.',
  ],
  solution: `
**1. Connecting.** Mule can use the JMS connector with the IBM MQ client libraries as a generic JMS provider, or a dedicated IBM MQ connector where one is licensed. Either way it needs the host and listener port, the queue manager name, the server connection channel, and the credentials and TLS cipher settings that the MQ team set on that channel. Keep secrets in secure properties.

**2. RFH2.** When a JMS app sends to IBM MQ, JMS headers and custom properties travel in an MQRFH2 header in front of the body. A non JMS program reads the raw message and sees that header as data. For such a reader, mark the destination as a non JMS target, for example with \`targetClient=1\` on the queue URI, so IBM MQ sends a plain message. Agree with the reader's team which values it needs, since custom JMS properties are not carried that way.

**3. Character sets.** IBM MQ messages carry a CCSID that says how the text is encoded. Mainframes often use EBCDIC code pages. If the sender's CCSID is wrong, or conversion is not done where expected, accented letters break. Check the CCSID on the message and the conversion settings, and read the body with the right encoding in Mule.

**4. Backout.** Set a backout threshold and a backout queue on the input queue. The IBM MQ JMS client counts rollbacks, and once the threshold is reached it moves the message to the backout queue. The queue keeps flowing, and support looks at the backout queue. Use a transacted or manual acknowledgement listener so a failure really rolls back.
`,
  followUps: [
    {
      q: 'Who sets the backout threshold, the Mule team or the MQ team?',
      a: 'The MQ administrators define it on the queue, usually with the backout queue name. The Mule team agrees the value with them and makes sure failures roll back.',
    },
    {
      q: 'Why might a channel refuse the Mule connection though the password is right?',
      a: 'Channel authentication rules can block a client by address or user mapping, and a TLS cipher mismatch also fails the handshake. The MQ error log shows the reason.',
    },
    {
      q: 'How do you keep message order from the mainframe?',
      a: 'Read with one consumer at a time and avoid parallel processing for that queue. Order across several consumers is not kept.',
    },
  ],
}
