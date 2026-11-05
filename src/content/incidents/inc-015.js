export default {
  id: 'inc-015',
  category: 'incidents',
  title: 'New IP Allowlist Policy Blocks Every Client',
  level: 'INTERMEDIATE',
  tags: ['api-manager', 'policies', 'ip-allowlist', 'load-balancer'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '16:28:02.110 INFO  [api-manager] Policy ip-allowlist applied to partner-orders-xapi (prod), ipExpression=#[attributes.remoteAddress]', relevant: true, why: 'The policy went live two minutes before the 403s and reads remoteAddress, the TCP peer.' },
      { text: '16:29:55.004 INFO  [partner-orders] POST /api/orders -> 201 corrId=ab10', relevant: false },
      { text: '16:31:07.442 DEBUG [policy ip-allowlist] Evaluating IP /10.40.3.17:46112 -> not in allowlist', relevant: true, why: 'The policy sees an internal 10.40.x.x address: the Dedicated Load Balancer, not the partner.' },
      { text: '16:31:07.443 WARN  [policy ip-allowlist] Request rejected with 403', relevant: true, why: 'Rejected at the policy layer, which is why the app logs show no incoming requests.' },
      { text: '16:31:07.443 DEBUG [policy ip-allowlist] Header X-Forwarded-For: 203.0.113.10', relevant: true, why: 'The real partner IP, which is on the allowlist, is only in X-Forwarded-For.' },
      { text: '16:31:08.105 DEBUG [policy ip-allowlist] Evaluating IP /10.40.3.21:51920 -> not in allowlist', relevant: false },
      { text: '16:31:10.000 INFO  [runtime] Health check OK (worker 0)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are allowlisted partners rejected?',
        options: [
          'Behind the DLB, remoteAddress is the load balancer IP, so no partner IP ever matches',
          'The partners changed their public IPs',
          'The CIDR 198.51.100.0/28 was typed wrong',
          'The app crashed at 16:30',
        ],
        answer: 0,
        explain: 'The policy sees 10.40.x.x addresses (the DLB). Sandbox works because partners call the worker directly, so remoteAddress is the real client there.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Redeploy the application',
          'Remove or disable the IP Allowlist policy on the prod instance and confirm 200s return',
          'Add 10.0.0.0/8 to the allowlist',
          'Ask partners to call the worker URL directly',
        ],
        answer: 1,
        explain: 'Policy changes apply without redeploy. Allowlisting 10.0.0.0/8 would let every request through the DLB, making the policy useless.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Read the client IP from X-Forwarded-For, using the entry added by the trusted load balancer',
          'Or enforce the IP allowlist at the DLB itself',
          'A non-prod environment with the same DLB path for testing policies',
          'A smoke test and 403-spike alert after any prod policy change',
          'Always trust the first value of X-Forwarded-For',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Clients can send their own fake X-Forwarded-For values, so blindly trusting the first entry is a bypass.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Link the 403s to the policy applied at 16:28',
          'Disable the IP Allowlist policy on prod',
          'Confirm partners get 200s and inform them',
          'Reconfigure the policy to use X-Forwarded-For and test it behind a DLB',
          'Reapply with peer review and a smoke test',
        ],
        explain: 'Diagnose, restore, verify, then fix and reapply safely.',
      },
    ],
  },
  description: `
## Symptoms
- At **16:30** all clients of \`partner-orders-xapi\` (prod) started getting **HTTP 403** — including the partners whose IPs are on the allowlist.
- The app itself was not redeployed; Runtime Manager shows it healthy and its own logs show **no incoming requests** after 16:30.
- \`/api/*\` on the **sandbox** instance of the same API works fine.

## Change / Context
- At 16:28 a security engineer applied an **IP Allowlist** policy to the prod API instance in API Manager, with the partners' public IPs (e.g. \`203.0.113.10\`, \`198.51.100.0/28\`). The IP expression is \`#[attributes.remoteAddress]\`.
- Prod traffic reaches the app through a **CloudHub Dedicated Load Balancer (DLB)** with a vanity domain; sandbox is called directly on the worker URL from the partners' test systems.
- API Manager analytics for prod show the rejected requests all coming from a handful of **10.x.x.x** addresses.

## Logs (API gateway / policy debug)
\`\`\`
16:31:07.442 DEBUG [policy ip-allowlist] Evaluating IP '/10.40.3.17:46112' -> not in allowlist
16:31:07.443 WARN  [policy ip-allowlist] Request rejected with 403
16:31:08.105 DEBUG [policy ip-allowlist] Evaluating IP '/10.40.3.21:51920' -> not in allowlist
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
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
    'Identifies that the policy evaluates remoteAddress, which behind the DLB is the load balancer\'s internal 10.x address, not the partner\'s IP — so nobody matches the allowlist.',
    'Explains why sandbox works (no DLB in the path) and why the app logs show nothing (policies reject the request before the flow runs).',
    'Immediate: remove or disable the policy in API Manager (takes effect without redeploying), confirm traffic resumes.',
    'Permanent fix: configure the IP expression to read the client IP from X-Forwarded-For as set by the trusted DLB. Be careful to use the address added by the load balancer rather than a client-supplied value.',
    'Prevention: apply and test policy changes in a non-prod environment with the same network path as prod, and use change control for policy changes on prod.',
  ],
  solution: `
**Diagnosis.** The IP Allowlist policy compares the partner list with \`attributes.remoteAddress\` — the address of the **TCP peer**. In prod that peer is the **Dedicated Load Balancer**, whose internal \`10.40.x.x\` addresses are what the policy sees. No partner IP ever matches, so every request is rejected with **403** at the policy layer, before the flow runs (hence no app logs). Sandbox works because partners call the worker directly, so \`remoteAddress\` really is the client.

**Immediate mitigation.** In API Manager, **remove or disable** the IP Allowlist policy on the prod instance. Policy changes are applied by the gateway without a redeploy, usually within a minute or so. Confirm 200s return and tell the partners.

**Root cause.** The policy was configured without accounting for the **network path**: behind a proxy/LB the real client IP is only available in the \`X-Forwarded-For\` header. The change was applied straight to prod without testing through the DLB.

**Permanent fix.**
- Set the policy's IP expression to read the client address from \`X-Forwarded-For\` (e.g. \`#[attributes.headers['x-forwarded-for']]\`).
- Be careful: \`X-Forwarded-For\` can contain a **list**, and a client can send its own fake value. Use the entry added by your trusted load balancer (normally the last one appended), not blindly the first. The policy docs say it looks for the starting address in the concatenated header values. So write the expression to return only the entry you trust, and test it with a spoofed header.
- Alternatively, enforce the allowlist **at the DLB** (it supports client IP allowlisting) and keep API Manager for identity-based policies (client ID, OAuth).

**Prevention.** A non-prod environment with the same network path (DLB in front) for testing policies; change control and a peer review for prod policy changes; a smoke test right after applying a policy; alert on a sudden drop in successful requests or spike in 403s.
`,
  followUps: [
    { q: 'Why did the app logs show nothing at all?', a: 'API Manager policies run in the gateway layer before the flow. A rejected request never reaches the HTTP Listener\'s flow, so you have to look in API analytics or policy logs, not the app\'s logs.' },
    { q: 'Is an IP allowlist enough to secure a partner API?', a: 'No. IPs can be shared or change, and headers can be spoofed. Combine it with identity: client ID enforcement or OAuth/JWT, ideally mutual TLS for B2B partners.' },
    { q: 'What would you put in the post-mortem?', a: 'Timeline (policy applied 16:28, outage from 16:30), full prod outage impact, root cause (remoteAddress behind DLB), why testing didn\'t catch it (sandbox had no DLB), and actions: prod-like test path, change approval, 403/traffic-drop alerting.' },
  ],
}
