export default {
  id: 'ms-317',
  category: 'mulesoft',
  title: 'When Email Sends Fail: SMTP Reply Codes, Retries and Rate Limits',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'smtp', 'retries', 'rate-limits', 'error-handling'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'What does an SMTP reply code starting with 4 mean?',
      options: [
        'The mail was accepted and queued for delivery',
        'A temporary failure, so trying again later may work',
        'A permanent failure, so the mail must not be retried',
        'The server is waiting for the client to send more data',
      ],
      answer: 1,
      explain: '2xx is success, 3xx asks for more input such as the message data, 4xx is temporary and 5xx permanent.',
    },
    {
      type: 'match',
      prompt: 'Match each reply with the right action.',
      pairs: [
        ['421 Service not available, closing channel', 'Retry later with backoff'],
        ['550 Mailbox unavailable', 'Do not retry, fix the address'],
        ['535 Authentication failed', 'Stop and alert, check the credentials'],
      ],
      explain: 'Retrying an auth failure can lock the account. Retrying a bad address only repeats the bounce.',
    },
    {
      type: 'single',
      prompt: 'The relay accepted the mail with 250 OK. Does that mean the recipient got it?',
      options: [
        'Yes, since 250 is sent only after the recipient server accepts it',
        'No. It means the relay took it, and delivery can still fail later',
        'Only for plain text mails, since HTML mails can be filtered later',
        'Yes, as long as the recipient is in the same company domain',
      ],
      answer: 1,
      explain: 'A later failure comes back as a bounce to the envelope sender. Bounces arrive later as mails. A bounce mailbox that someone watches catches them.',
    },
    {
      type: 'single',
      prompt: 'Which Mule construct fits a retry of a temporary send failure?',
      options: [
        'A reconnection strategy on the SMTP configuration of the connector',
        'Until Successful around the Send, with limited retries and a pause',
        'A For Each that repeats the Send a fixed number of times',
        'A Scatter-Gather that sends the mail through two relays at once',
      ],
      answer: 1,
      explain: 'Use it only for temporary errors. A reconnection strategy covers connection loss. Until Successful covers the operation itself.',
    },
    {
      type: 'multi',
      prompt: 'A cloud mail service limits sends per minute. The job sends 2,000 alerts at once and many fail. What helps?',
      options: [
        'Combine alerts into fewer summary mails',
        'Send through a queue with a limited number of consumers',
        'Back off and retry when the service signals a limit',
        'Open more connections in parallel',
      ],
      answer: [0, 1, 2],
      explain: 'More parallel connections reach the limit faster.',
    },
    {
      type: 'single',
      prompt: 'Retries continue for an hour and still fail. What should happen to the mail?',
      options: [
        'Drop it, since a later job report covers the same run',
        'Mark it failed in an outbox table or dead letter queue, log it and alert',
        'Keep retrying every hour until the relay accepts it',
        'Write it to the Mule log at DEBUG level and move on',
      ],
      answer: 1,
      explain: 'Someone can then resend it. A failed notice about a failed job should still be visible somewhere other than email.',
    },
  ],
  description: `
Fenwick Supply sends job reports and alerts through a cloud mail service. On busy nights many mails fail. Some errors are 421, some 550 for a list address that was removed, and once 535 after a password change. The current flow retries every error five times.

**Questions**
1. What do 2xx, 4xx and 5xx replies mean?
2. Which errors should be retried and which not?
3. How do you retry in Mule?
4. How do you live with send limits?
5. What happens when retries run out?
`,
  answerTemplate: `## Reply classes

## Retry or not

## Retrying in Mule

## Send limits

## When retries run out
`,
  keyPoints: [
    '2xx success, 4xx temporary, 5xx permanent.',
    'Retry 4xx with backoff. Do not retry 5xx.',
    'Auth failures stop and alert.',
    '250 means the relay accepted the mail, not that it was delivered.',
    'Use a queue with few consumers and summary mails to stay under limits.',
    'Park failed mails in an outbox or dead letter queue and alert.',
  ],
  solution: `
**1. Reply classes.** 2xx means accepted. 4xx means a temporary problem, such as a busy server or a limit, and a later try may work. 5xx means a permanent problem, such as an unknown mailbox, a rejected policy or a failed login.

**2. Retry or not.** Retry 421, 450, 451 and 452 with growing pauses. Do not retry 550 or 553; fix the address list. On 535, stop and alert, because repeated failed logins can lock the account.

**3. Retrying in Mule.** Wrap the Send in Until Successful with a small number of retries and a pause, and raise a retryable error only for temporary codes. Keep a reconnection strategy on the SMTP config for dropped connections. The error text from the connector usually carries the server reply, so the flow can map it.

**4. Send limits.** Cloud services limit messages per minute or per day. Put mails on a queue and let a sender flow with a small number of consumers send them. Combine many alerts into one summary. Back off when the service answers with a limit.

**5. When retries run out.** Mark the mail FAILED in an outbox table, or move it to a dead letter queue, with the last reply. Log it and raise an alert through another channel, such as monitoring. Someone can then fix the cause and resend.
`,
  followUps: [
    {
      q: 'How do you notice bounces that arrive later?',
      a: 'Send with an envelope sender that is a watched mailbox, and optionally poll it to mark addresses that bounce.',
    },
    {
      q: 'Why should the retry pause grow?',
      a: 'A service that is overloaded needs time to recover. Fixed short retries add to the load.',
    },
    {
      q: 'How do you test the 4xx path?',
      a: 'Use a local test SMTP server that can answer with chosen codes, and point a test config at it.',
    },
  ],
}
