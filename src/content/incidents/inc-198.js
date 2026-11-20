export default {
  id: 'inc-198',
  category: 'incidents',
  title: 'Valid Partner Webhooks Fail the Signature Check: the HMAC Is Worked Out Over Re-Written JSON, Not the Raw Body',
  level: 'ADVANCED',
  tags: ['myproject', 'webhooks', 'hmac', 'security', 'dataweave', 'streaming'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-18 15:10:02 INFO  [hook-api] Webhook received eventId=ev_7710 sizeBytes=812', relevant: false },
      { text: '2026-11-18 15:10:02 WARN  [hook-api] Signature mismatch eventId=ev_7710 status=401', relevant: true, why: 'A real partner event is rejected.' },
      { text: '2026-11-18 15:10:02 DEBUG [hook-api] HMAC input = write(payload, "application/json", {indent: false}) length=764', relevant: true, why: 'The app signs JSON it wrote itself, 48 bytes shorter than what arrived.' },
      { text: '2026-11-18 15:10:02 DEBUG [hook-api] Partner body had spaces after colons and line breaks', relevant: true, why: 'Any change in spacing changes the signature.' },
      { text: '2026-11-18 15:11:30 INFO  [hook-api] Webhook received eventId=ev_7711 signature ok', relevant: true, why: 'Small, compact bodies happen to match, so only some events fail.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why do some real webhooks fail the check?',
        options: [
          'The partner signs the bytes it sent, and the app signs JSON it wrote again',
          'The shared secret is wrong, so only some events happen to match',
          'The partner signs with SHA-1 on some events and SHA-256 on others',
          'Large bodies are cut at a buffer limit, so their HMAC is computed on part',
        ],
        answer: 0,
        explain: 'An HMAC changes with any byte. Parsing and writing JSON again keeps the meaning but not the bytes.',
      },
      {
        type: 'single',
        prompt: 'What must the app sign?',
        options: [
          'The raw body bytes exactly as received, before any parsing',
          'The parsed payload, written again with `indent: true`',
          'The parsed payload, written again with its keys sorted',
          'The event ID and timestamp, joined with a separator',
        ],
        answer: 0,
        explain: 'Read the body as binary or text without changing it, compute the HMAC on those bytes, then parse it.',
      },
      {
        type: 'multi',
        prompt: 'Which should the signature check also do?',
        options: [
          'Compare signatures in constant time',
          'Reject old timestamps, if the partner includes one, to stop replays',
          'Keep the shared secret in secure properties',
          'Log the expected signature on failure, for support',
        ],
        answer: [0, 1, 2],
        explain: 'These are the usual parts of a sound webhook check. Logging the expected signature hands an attacker the value to send, so log only that the check failed.',
      },
      {
        type: 'single',
        prompt: 'Why did small events pass?',
        options: [
          'Some bodies were already compact, so writing them again gave the same bytes',
          'Small events fit in one buffer, so the app reads their raw bytes directly',
          'The partner signs small events with the secret the app has on file',
          'Small events carry no timestamp, so the check skips their signature',
        ],
        answer: 0,
        explain: 'It only worked by chance. Any body with spaces or line breaks fails.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Ask the partner to resend the rejected events, by event ID',
          'Change the check to use the raw body bytes',
          'Compare in constant time and check the timestamp',
          'Test with bodies that have spaces and new lines',
          'Alert when the rate of signature failures rises',
        ],
        explain: 'Recover the missed events, fix the check, harden it, prove it, then watch it.',
      },
    ],
  },
  description: `
## Symptoms
- About a third of webhooks from a payment partner are rejected with 401 "signature mismatch".
- The partner support team says the signatures are correct.

## Change / Context
- The partner sends an HMAC SHA-256 of the request body in a header.
- The flow reads the body as JSON, then computes the HMAC over \`write(payload, "application/json", {indent: false})\`.
- Some partner bodies arrive compact, and others with spaces after colons and line breaks.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 15:10:02 WARN  [hook-api] Signature mismatch eventId=ev_7710 status=401
2026-11-18 15:10:02 DEBUG [hook-api] HMAC input = write(payload, "application/json", {indent: false}) length=764
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'An HMAC is over exact bytes, not over meaning.',
    'Writing parsed JSON again keeps the meaning but can change the spacing.',
    'Sign the raw body before parsing it.',
    'Compare signatures in constant time and check timestamps.',
    'Keep the secret in secure properties and never log it.',
    'Ask the partner to resend rejected events.',
  ],
  solution: `
**Diagnosis.** The partner signs the bytes it sends. The app parses the JSON and writes it again, which removes the spaces and line breaks the partner sent, so the HMAC differs.

**Immediate mitigation.** Ask the partner to resend the rejected event IDs once the fix is live.

**Root cause.** The check was written against the parsed payload, not the raw request body.

**Permanent fix.** Read the body without changing it, compute the HMAC over those bytes with the shared secret, compare in constant time, then parse. Check the timestamp if the partner sends one.

**Prevention.** Tests with real partner samples that include spaces and new lines. An alert on the rate of signature failures.
`,
  followUps: [
    { q: 'Would sorting the keys before signing help?', a: 'No. The HMAC sees bytes. The partner signed the bytes it sent, in its own order and spacing, and only those exact bytes give the same result.' },
    { q: 'What does constant time comparison stop?', a: 'It stops an attacker learning how many characters matched from the time each comparison takes.' },
    { q: 'Where should the raw body come from?', a: 'From the payload before any transform, read as text or binary in the encoding the partner uses.' },
    { q: 'Should you return 401 or 400 on a bad signature?', a: 'Follow the partner contract. Many use 401, and some prefer a plain 400. Do not say which part failed.' },
  ],
}
