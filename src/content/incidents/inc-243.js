export default {
  id: 'inc-243',
  category: 'incidents',
  title: "The Partner Blocks Mule Because It Opens Too Many SFTP Sessions",
  level: 'INTERMEDIATE',
  tags: ["myproject","sftp","connections","pooling"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 11:00:00 INFO  [label-sender] Parallel for each maxConcurrency=32 files=900", relevant: true, why: "Mule opens many parallel uploads." },
      { text: "2026-11-18 11:00:00 INFO  [label-sender] Pooling profile not set", relevant: true, why: "Connections are not pooled." },
      { text: "2026-11-18 11:00:01 ERROR [label-sender] SFTP connect failed error=Too many connections from this IP", relevant: true, why: "The server limits sessions." },
      { text: "2026-11-18 11:00:30 INFO  [partner-mail] Your IP is blocked for 1 hour", relevant: true, why: "The partner blocked the IP." },
      { text: "2026-11-18 23:59:00 INFO  [label-sender] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is Mule blocked?",
        options: [
          "It opens up to 32 sessions at once, above the partner limit",
          "The private key for the SFTP user expired today",
          "The 900 label files are above the server’s size limit",
          "The partner changed its host key and Mule rejects it",
        ],
        answer: 0,
        explain: "The server has a session limit.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Cap concurrency at the partner limit and pool connections",
          "Raise maxConcurrency so the 900 files finish sooner",
          "Retry each failed connect at once in a loop",
          "Send from a second IP address to split the load",
        ],
        answer: 0,
        explain: "Respect the server limits.",
      },
      {
        type: 'multi',
        prompt: "What else should you agree with the partner?",
        options: [
          "The maximum sessions allowed",
          "Their maintenance windows",
          "Whether they rate limit by IP",
          "The OS their SFTP server runs on",
        ],
        answer: [0,1,2],
        explain: "Know the limits before you send.",
      },
      {
        type: 'single',
        prompt: "Why is retrying in a tight loop bad here?",
        options: [
          "It makes the block longer and adds load",
          "It uses up the Mule worker’s heap",
          "It uploads each file twice",
          "It resets the SFTP user’s key",
        ],
        answer: 0,
        explain: "Back off when the server says no.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the sender",
          "Ask the partner to lift the block",
          "Set concurrency and pool limits",
          "Resend the 900 files",
          "Add the limit to the partner profile",
        ],
        explain: "Stop, unblock, fix, recover, record.",
      },
    ],
  },
  description: `
## Symptoms
- Label files stop reaching the carrier and the partner blocked our IP.

## Change / Context
- A new release made uploads parallel to speed them up.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 11:00:00 INFO  [label-sender] Parallel for each maxConcurrency=32 files=900
2026-11-18 11:00:00 INFO  [label-sender] Pooling profile not set
2026-11-18 11:00:01 ERROR [label-sender] SFTP connect failed error=Too many connections from this IP
2026-11-18 11:00:30 INFO  [partner-mail] Your IP is blocked for 1 hour
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
    "SFTP servers limit sessions.",
    "Match concurrency to the limit.",
    "Pool connections.",
    "Back off on refusal.",
    "Record partner limits.",
    "Test against real limits.",
  ],
  solution: `
**Diagnosis.** Parallel uploads opened 32 sessions. The partner blocked the IP.

**Immediate mitigation.**
- Stop, ask for the block to be lifted, resend at a safe rate.

**Root cause.** Concurrency was raised without knowing the partner limit.

**Permanent fix.**
- Set maxConcurrency to the limit and pool connections.

**Prevention.** Keep partner limits in config and test with them.
`,
  followUps: [
    { q: "What does a pool give you?", a: "Reused sessions and a cap on how many exist." },
    { q: "Is one session enough?", a: "Often, for a few files. Measure before adding more." },
    { q: "How do you upload 900 files fast then?", a: "A few sessions in parallel, within the limit." },
    { q: "What about reconnection?", a: "Use a reconnection strategy with backoff." },
  ],
}
