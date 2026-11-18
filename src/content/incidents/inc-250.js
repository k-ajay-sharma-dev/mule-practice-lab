export default {
  id: 'inc-250',
  category: 'incidents',
  title: "FTP Logs In Fine but Every Directory Listing Hangs",
  level: 'BEGINNER',
  tags: ["myproject","ftp","passive-mode","firewall"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:01 INFO  [store-ftp] Connected host=ftp.store-net.example user=marrow-int", relevant: true, why: "Login works on the control channel." },
      { text: "2026-11-18 06:00:31 ERROR [store-ftp] LIST timed out after 30000 ms", relevant: true, why: "The data channel never opens." },
      { text: "2026-11-18 06:00:01 INFO  [store-ftp] passive=false", relevant: true, why: "Active mode makes the server connect back to Mule." },
      { text: "2026-11-17 22:00:00 INFO  [network] New firewall blocks inbound connections to integration subnet", relevant: true, why: "The firewall now blocks the server calling back." },
      { text: "2026-11-18 23:59:00 INFO  [store-ftp] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does LIST hang?",
        options: [
          "In active mode the server opens the data connection back to Mule, and the new firewall blocks it",
          "The password is wrong",
          "The folder is empty",
          "The server is down",
        ],
        answer: 0,
        explain: "FTP uses a separate data channel for listings and files.",
      },
      {
        type: 'single',
        prompt: "What is the usual fix?",
        options: [
          "Switch to passive mode, so Mule opens the data connection",
          "Open every port inbound",
          "Use a longer timeout",
          "Retry forever",
        ],
        answer: 0,
        explain: "Passive mode suits clients behind firewalls.",
      },
      {
        type: 'multi',
        prompt: "What does the firewall team need for passive mode?",
        options: [
          "Outbound access to port 21 on the server",
          "Outbound access to the server’s passive port range",
          "Nothing inbound to Mule",
          "Inbound port 20 to Mule",
        ],
        answer: [0,1,2],
        explain: "Passive uses the control port plus a range the server picks from.",
      },
      {
        type: 'single',
        prompt: "Why did login still work?",
        options: [
          "Login uses only the control channel on port 21",
          "Login is cached",
          "Login uses HTTP",
          "Login uses the data channel",
        ],
        answer: 0,
        explain: "Commands and transfers use different connections.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Set passive mode",
          "Confirm the passive port range with the server owner",
          "Ask for outbound rules to that range",
          "Test LIST and a download",
          "Note the mode in the partner profile",
        ],
        explain: "Fix, confirm, open, test, record.",
      },
    ],
  },
  description: `
## Symptoms
- Since this morning the store file job connects but never lists files.

## Change / Context
- A firewall change went in last night.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:01 INFO  [store-ftp] Connected host=ftp.store-net.example user=marrow-int
2026-11-18 06:00:31 ERROR [store-ftp] LIST timed out after 30000 ms
2026-11-18 06:00:01 INFO  [store-ftp] passive=false
2026-11-17 22:00:00 INFO  [network] New firewall blocks inbound connections to integration subnet
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
    "FTP has a control and a data channel.",
    "Active mode connects back to the client.",
    "Passive mode suits firewalls.",
    "Passive needs a port range open outbound.",
    "Login working does not prove transfers work.",
    "Record the mode per partner.",
  ],
  solution: `
**Diagnosis.** Active mode needs the server to connect back to Mule. The new firewall blocks that.

**Immediate mitigation.**
- Switch to passive mode and test.

**Root cause.** The connector used active mode, which the new network design does not allow.

**Permanent fix.**
- Passive mode with outbound rules for the passive port range.

**Prevention.** Record FTP mode and ports in each partner profile.
`,
  followUps: [
    { q: "What port does the data channel use in passive mode?", a: "A port the server chooses from its passive range." },
    { q: "Is FTP encrypted?", a: "No. Credentials and data travel in clear text." },
    { q: "What should you use instead?", a: "SFTP or FTPS where the partner supports it." },
    { q: "How do you test quickly?", a: "Connect with a client in passive mode from the same network." },
  ],
}
