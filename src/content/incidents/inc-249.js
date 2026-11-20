export default {
  id: 'inc-249',
  category: 'incidents',
  title: "Files Go Missing During the Move to a New SFTP Server",
  level: 'EXPERT',
  tags: ["myproject","sftp","migration","cutover"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 20:00:00 INFO  [ops] DNS sftp.brindle.example now points to the new server (TTL 86400)", relevant: true, why: "The name moved in the evening, and resolvers may keep the old address for up to a day." },
      { text: "2026-11-18 20:05:00 INFO  [old-sftp] partnerx: upload /in/orders_X_2001.csv (1.2 MB)", relevant: true, why: "Partner X still writes to the old server." },
      { text: "2026-11-18 20:10:00 INFO  [order-in] Poll sftp.brindle.example /in found=0", relevant: true, why: "Mule now reads only the new server, so it never sees the file." },
      { text: "2026-11-18 20:15:00 INFO  [new-sftp] partnery: upload /in/orders_Y_5530.csv (0.4 MB)", relevant: false },
      { text: "2026-11-18 23:59:00 INFO  [order-in] GET /health 200", relevant: false },
      { text: "2026-11-19 08:00:00 WARN  [customer-service] Orders missing from partner X since 20:00", relevant: true, why: "The orders are waiting on the old server." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Where are partner X's missing files?",
        options: [
          "On the old server, because partner X still resolves the old address",
          "On the new server, but Mule skipped them because the host key changed",
          "Deleted by the SFTP listener's post action on the new server",
          "In a temporary folder on the new server, because the upload did not finish",
        ],
        answer: 0,
        explain: "The old server logged partner X's upload after the DNS change, and Mule polls only the new server. A DNS change reaches each client only when its cached record expires.",
      },
      {
        type: 'single',
        prompt: "What should the cutover plan have included?",
        options: [
          "Polling both servers until every partner is confirmed on the new one",
          "Switching off the old server at the moment DNS changes, so nobody can use it",
          "Raising the DNS TTL before the change, so the new record is cached longer",
          "Moving all partners in one night with no way back, so the move is quick",
        ],
        answer: 0,
        explain: "Run both sides for a while. Switching the old server off would make partner X's uploads fail, and a higher TTL makes the old record live longer.",
      },
      {
        type: 'multi',
        prompt: "What else belongs in the plan?",
        options: [
          "Each partner confirms it reaches the new server",
          "The new host key fingerprint is shared with partners before cutover",
          "A sweep of the old server after the switch",
          "The DNS TTL is lowered a few days before the change",
          "Partners are told after the switch, once it works",
        ],
        answer: [0, 1, 2, 3],
        explain: "Plan per partner, prepare keys and DNS ahead, and sweep the old server. Telling partners afterwards leaves them no time to update allow lists or host keys.",
      },
      {
        type: 'single',
        prompt: "Why share the new host key fingerprint early?",
        options: [
          "Partners' SFTP clients will see a new host key and refuse to connect until they trust it",
          "Partners need it to log in, in place of their password or private key",
          "The new server encrypts files with it, so partners need it to decrypt their uploads",
          "It is optional, because SFTP clients accept a new host key without asking",
        ],
        answer: 0,
        explain: "A client that knows the old host key sees the new one as a possible attack and stops. The fingerprint lets each partner check and trust the new key before cutover.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Point a second Mule listener at the old server so its files are picked up again",
          "Check that partner X's stuck orders were processed",
          "Confirm with each partner that it reaches the new server",
          "Sweep the old server one last time and find it empty",
          "Switch off the old server",
        ],
        explain: "Recover the stuck files first, check them, then confirm each partner, make sure nothing is left, and only then retire the old server.",
      },
    ],
  },
  description: `
## Symptoms
- Since last night, no orders from partner X have reached the order system. Other partners are fine.

## Change / Context
- Brindle Outdoor, a fictional outdoor gear retailer, moved its partner SFTP server to a new machine at 20:00.
- The cutover changed the DNS record \`sftp.brindle.example\` to the new server. The old server was left running.
- The Mule app \`order-in\` polls \`sftp.brindle.example\` every 10 minutes.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 20:00:00 INFO  [ops] DNS sftp.brindle.example now points to the new server (TTL 86400)
2026-11-18 20:05:00 INFO  [old-sftp] partnerx: upload /in/orders_X_2001.csv (1.2 MB)
2026-11-18 20:10:00 INFO  [order-in] Poll sftp.brindle.example /in found=0
2026-11-19 08:00:00 WARN  [customer-service] Orders missing from partner X since 20:00
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
    "DNS changes are not instant for every client. Resolvers keep the old record until its TTL ends.",
    "Run old and new servers in parallel, and poll both.",
    "Confirm each partner on the new server.",
    "Share the new host key fingerprint early.",
    "Sweep the old server before switching it off.",
    "Plan a rollback.",
  ],
  solution: `
**Diagnosis.** Partner X still writes to the old server, because its resolver kept the old address. Mule reads only the new one, so the files wait on the old server.

**Immediate mitigation.**
- Point a second listener, or a one-off job, at the old server by its own address, and process partner X's files.
- Check the orders reached the order system.

**Root cause.** The cutover assumed a DNS change reaches every client at once, and it kept a one-day TTL.

**Permanent fix.**
- Poll both servers until every partner confirms it uses the new one.

**Prevention.** A partner by partner cutover checklist: lower the TTL days ahead, share the host key fingerprint and new IP address, confirm each partner, and sweep the old server before it goes.
`,
  followUps: [
    { q: "Why do partners cache DNS?", a: "Clients and resolvers keep records until the TTL ends, and some keep them longer." },
    { q: "Should the TTL be lowered first?", a: "Yes, days before the change, so the old record expires quickly on the night." },
    { q: "Can partners allow list IPs?", a: "Yes, so they need the new IP address before cutover too." },
    { q: "How long to keep the old server?", a: "Until every partner confirms and a sweep finds nothing." },
  ],
}
