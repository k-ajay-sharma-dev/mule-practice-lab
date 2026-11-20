export default {
  id: 'inc-295',
  category: 'incidents',
  title: "Partner Emails From the Integration Land in Spam",
  level: 'ADVANCED',
  tags: ["myproject","email","spf","dkim","deliverability"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 10:00:00 INFO  [po-mail] Sent from=orders@marrow-home.example.com via relay=mail.cloudsend.example.com", relevant: true, why: "A new sending service." },
      { text: "2026-11-18 10:30:00 WARN  [supplier-c] Your POs are in our spam folder", relevant: true, why: "Partners do not see them." },
      { text: "2026-11-18 10:31:00 INFO  [mail-team] SPF record does not include cloudsend.example.com, no DKIM signature", relevant: true, why: "Authentication records are missing." },
      { text: "2026-11-18 10:31:00 INFO  [mail-team] DMARC policy quarantine", relevant: true, why: "Failing mail is quarantined." },
      { text: "2026-11-18 23:59:00 INFO  [po-mail] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are emails in spam?",
        options: [
          "SPF and DKIM fail for the new service, so DMARC quarantines",
          "Partners flag the PO wording and attachments as spam",
          "The partners added our domain to their block list",
          "The new relay sends without TLS, so partners distrust it",
        ],
        answer: 0,
        explain: "Authentication fails.",
      },
      {
        type: 'single',
        prompt: "Who fixes it?",
        options: [
          "The mail or DNS team, by adding SPF and DKIM for the service",
          "Each partner, by adding our sender to their safe list",
          "Mule developers alone, by changing the From header",
          "The cloud service, by raising our sender reputation",
        ],
        answer: 0,
        explain: "DNS records for the domain.",
      },
      {
        type: 'multi',
        prompt: "What should email integrations avoid?",
        options: [
          "Sending from a domain without authorising the service",
          "Using personal mailboxes as senders",
          "Changing mail services without a test",
          "Using a shared, authorised sender",
        ],
        answer: [0,1,2],
        explain: "The last is good practice.",
      },
      {
        type: 'single',
        prompt: "Why should POs not depend on email?",
        options: [
          "Delivery is not guaranteed, so use EDI, API or SFTP instead",
          "Email is too slow for orders that suppliers need quickly",
          "Email costs more per message than an EDI document",
          "Suppliers cannot read PDF attachments in email",
        ],
        answer: 0,
        explain: "Use a reliable channel for business documents.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Resend POs through the old path",
          "Update SPF",
          "Set up DKIM",
          "Test with a partner",
          "Plan a move to a reliable channel",
        ],
        explain: "Recover, fix DNS, test, improve.",
      },
    ],
  },
  description: `
## Symptoms
- Suppliers are not seeing purchase orders.

## Change / Context
- The integration moved to a new cloud email service yesterday.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 10:00:00 INFO  [po-mail] Sent from=orders@marrow-home.example.com via relay=mail.cloudsend.example.com
2026-11-18 10:30:00 WARN  [supplier-c] Your POs are in our spam folder
2026-11-18 10:31:00 INFO  [mail-team] SPF record does not include cloudsend.example.com, no DKIM signature
2026-11-18 10:31:00 INFO  [mail-team] DMARC policy quarantine
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
    "SPF lists allowed senders.",
    "DKIM signs messages.",
    "DMARC decides what happens to failures.",
    "Test new mail services.",
    "Use authorised senders.",
    "Business documents need reliable channels.",
  ],
  solution: `
**Diagnosis.** The new service is not in SPF and does not sign, so DMARC quarantines the mail.

**Immediate mitigation.**
- Resend through the old path.

**Root cause.** Mail service change without DNS updates.

**Permanent fix.**
- SPF and DKIM for the service.

**Prevention.** Test and move POs to a reliable channel.
`,
  followUps: [
    { q: "What is SPF?", a: "A DNS record listing servers allowed to send for a domain." },
    { q: "What is DKIM?", a: "A signature that proves the message was not changed and came from the domain." },
    { q: "What is DMARC?", a: "A policy that tells receivers what to do when SPF or DKIM fail." },
    { q: "Can Mule fix this?", a: "No, it is DNS and mail service setup." },
  ],
}
