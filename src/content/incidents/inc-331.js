export default {
  id: 'inc-331',
  category: 'incidents',
  title: "Passive FTP Fails After the Partner Moves Behind a New Firewall",
  level: 'ADVANCED',
  tags: ["myproject","ftp","nat","passive-mode"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 04:00:00 INFO  [cost-in] Connected host=ftp.supplier-d.example", relevant: true, why: "Login works." },
      { text: "2026-11-18 04:00:01 INFO  [cost-in] 227 Entering Passive Mode (10,20,0,15,195,80)", relevant: true, why: "The server gives a private IP." },
      { text: "2026-11-18 04:00:31 ERROR [cost-in] Data connection timed out to 10.20.0.15:50000", relevant: true, why: "Mule cannot reach a private address." },
      { text: "2026-11-17 20:00:00 INFO  [supplier-d] Server moved behind NAT firewall", relevant: true, why: "The partner changed their network." },
      { text: "2026-11-18 23:59:00 INFO  [cost-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the data connection fail?",
        options: [
          "The server advertises its private address in the PASV reply, which Mule cannot reach",
          "Login failed",
          "The file is missing",
          "Mule is down",
        ],
        answer: 0,
        explain: "NAT hides the server behind a public address.",
      },
      {
        type: 'single',
        prompt: "What should the partner change?",
        options: [
          "Configure the server to advertise its public address for passive mode",
          "Turn off the firewall",
          "Use active mode only",
          "Nothing",
        ],
        answer: 0,
        explain: "A server side NAT setting.",
      },
      {
        type: 'multi',
        prompt: "What can the client try?",
        options: [
          "EPSV, which does not send an IP address",
          "A client option to use the control connection host for data",
          "Moving to SFTP, which uses one connection",
          "Opening every port",
        ],
        answer: [0,1,2],
        explain: "Avoid relying on the advertised IP.",
      },
      {
        type: 'single',
        prompt: "Why does SFTP avoid this?",
        options: [
          "It uses a single connection for commands and data",
          "It is faster",
          "It has no firewall",
          "It is the same",
        ],
        answer: 0,
        explain: "One port, no data channel.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Ask the partner to fix the passive address",
          "Try EPSV meanwhile",
          "Download today’s file",
          "Plan a move to SFTP",
          "Record the network change",
        ],
        explain: "Ask, work around, recover, improve, record.",
      },
    ],
  },
  description: `
## Symptoms
- Supplier cost files fail to download since the partner’s network change.

## Change / Context
- Mule uses passive mode. The partner moved their server behind NAT.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 04:00:00 INFO  [cost-in] Connected host=ftp.supplier-d.example
2026-11-18 04:00:01 INFO  [cost-in] 227 Entering Passive Mode (10,20,0,15,195,80)
2026-11-18 04:00:31 ERROR [cost-in] Data connection timed out to 10.20.0.15:50000
2026-11-17 20:00:00 INFO  [supplier-d] Server moved behind NAT firewall
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
    "PASV replies include an IP address.",
    "Behind NAT it may be private.",
    "Servers need the public address set.",
    "EPSV avoids the IP.",
    "SFTP uses one connection.",
    "Record partner network changes.",
  ],
  solution: `
**Diagnosis.** The partner server advertises a private IP for passive data connections.

**Immediate mitigation.**
- Try EPSV or a client override.

**Root cause.** NAT change without updating passive settings.

**Permanent fix.**
- Server advertises its public address.

**Prevention.** Move to SFTP where possible.
`,
  followUps: [
    { q: "What is EPSV?", a: "Extended passive mode. It returns only a port, not an address." },
    { q: "Does the Mule FTP connector support EPSV?", a: "Check your connector version and options." },
    { q: "Why did login work?", a: "Login uses the control connection only." },
    { q: "How do you prove the cause?", a: "The PASV reply shows the private address." },
  ],
}
