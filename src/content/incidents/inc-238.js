export default {
  id: 'inc-238',
  category: 'incidents',
  title: "Every SFTP Connection Fails After the Partner Rebuilds Their Server",
  level: 'BEGINNER',
  tags: ["myproject","sftp","host-key","security"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-17 18:00:00 INFO  [partner-mail] Notice: SFTP server will be rebuilt tonight", relevant: true, why: "The partner warned about a rebuild but sent no new fingerprint." },
      { text: "2026-11-18 07:00:01 ERROR [po-sender] SFTP connect failed host=sftp.partner.example error=HostKey has been changed", relevant: true, why: "The server identity changed." },
      { text: "2026-11-18 07:00:01 INFO  [po-sender] knownHostsFile=known_hosts strict=true", relevant: true, why: "Strict host key checking is on, which is right." },
      { text: "2026-11-18 07:05:00 WARN  [po-sender] Pending purchase orders=86", relevant: true, why: "Orders are waiting." },
      { text: "2026-11-18 23:59:00 INFO  [po-sender] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the connection fail?",
        options: [
          "The rebuilt server has a new host key not in known hosts",
          "The rebuild reset the partner account, so the password fails",
          "The rebuilt server has a new IP address the firewall blocks",
          "The known_hosts file was lost when the app restarted",
        ],
        answer: 0,
        explain: "The client refuses an unknown server identity.",
      },
      {
        type: 'single',
        prompt: "What is the safe fix?",
        options: [
          "Check the new fingerprint with the partner, then update known hosts",
          "Set strict host key checking to false until the partner confirms",
          "Connect once by hand and add whatever key the server offers",
          "Switch to FTP for a few days, which needs no host key",
        ],
        answer: 0,
        explain: "Verify before you trust.",
      },
      {
        type: 'multi',
        prompt: "Why must you not turn off the check?",
        options: [
          "It stops a man in the middle reading or changing files",
          "It proves you talk to the real server",
          "Credentials could go to an attacker",
          "It encrypts the files sent to the server",
        ],
        answer: [0,1,2],
        explain: "Host key checking is a security control.",
      },
      {
        type: 'single',
        prompt: "What about the 86 orders?",
        options: [
          "Send them once the connection works, and confirm with the partner",
          "Email them as attachments today, then send them by SFTP as well",
          "Cancel them in the ERP and ask buyers to raise them again",
          "Leave them for tomorrow’s 07:00 run to pick up with the rest",
        ],
        answer: 0,
        explain: "They are queued. Send and confirm.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Ask the partner for the new fingerprint",
          "Compare it with the server key",
          "Update known hosts",
          "Send the pending orders",
          "Ask partners to announce key changes in advance",
        ],
        explain: "Verify, trust, recover, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- From 07:00 no purchase orders reach the partner.

## Change / Context
- The partner rebuilt their SFTP server last night.
- The first purchase order run of the day is at 07:00.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-17 18:00:00 INFO  [partner-mail] Notice: SFTP server will be rebuilt tonight
2026-11-18 07:00:01 ERROR [po-sender] SFTP connect failed host=sftp.partner.example error=HostKey has been changed
2026-11-18 07:00:01 INFO  [po-sender] knownHostsFile=known_hosts strict=true
2026-11-18 07:05:00 WARN  [po-sender] Pending purchase orders=86
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
    "A rebuilt server often has a new host key.",
    "Strict checking refuses unknown keys.",
    "Never disable host key checking.",
    "Verify fingerprints through a trusted channel.",
    "Send queued files after the fix.",
    "Agree notice of key changes.",
  ],
  solution: `
**Diagnosis.** The partner server has a new host key. The client correctly refuses it.

**Immediate mitigation.**
- Verify the new fingerprint, update known hosts and send the queue.

**Root cause.** The partner changed the key without sharing the fingerprint.

**Permanent fix.**
- Update known hosts with the verified key.

**Prevention.** Partners announce key changes and share fingerprints ahead.
`,
  followUps: [
    { q: "What is a fingerprint?", a: "A short hash of the server public key you can compare by phone or email." },
    { q: "Where is known hosts kept?", a: "With the app config, not in a shared temp folder." },
    { q: "Could this be an attack?", a: "Yes. That is why you verify before trusting." },
    { q: "How do you notice sooner?", a: "Alert on connection failures to each partner." },
  ],
}
