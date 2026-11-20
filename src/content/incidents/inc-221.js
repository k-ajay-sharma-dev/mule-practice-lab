export default {
  id: 'inc-221',
  category: 'incidents',
  title: "Blob Calls Fail With 403 AuthorizationFailure After the Storage Account Is Locked to Selected Networks",
  level: 'ADVANCED',
  tags: ["myproject","azure-blob","networking","firewall","private-endpoint","cloudhub"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 09:30:00 INFO  [cloud-team] Storage account public network access: selected networks only", relevant: true, why: "The account now allows only listed networks." },
      { text: "2026-11-18 09:31:02 ERROR [doc-sync] Upload failed status=403 code=AuthorizationFailure", relevant: true, why: "The key is fine, but the network is not allowed." },
      { text: "2026-11-18 09:31:02 INFO  [doc-sync] Egress IPs 34.x.x.10, 34.x.x.11 (CloudHub static IPs)", relevant: true, why: "The app calls from addresses not on the list." },
      { text: "2026-11-18 09:32:00 INFO  [doc-sync] Local test from office network: upload ok", relevant: true, why: "The office network is allowed, so tests from there pass." },
      { text: "2026-11-18 09:33:00 INFO  [doc-sync] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do calls fail when the key is correct?",
        options: [
          "The storage firewall blocks the app’s CloudHub egress addresses",
          "The account key was rotated when the network setting changed",
          "The container’s access level was set to private this morning",
          "The app’s role assignment was removed along with public access",
        ],
        answer: 0,
        explain: "AuthorizationFailure here means the caller is authenticated but not allowed from that network.",
      },
      {
        type: 'single',
        prompt: "Why did the developer’s test pass?",
        options: [
          "It ran from the office network, which is on the allowed list",
          "The local runtime sends the account key in a different header",
          "The local test wrote to a container with public access",
          "The firewall applies only to calls made over port 443",
        ],
        answer: 0,
        explain: "Test from the same network path as production.",
      },
      {
        type: 'multi',
        prompt: "Which fixes fit?",
        options: [
          "Add the app’s fixed egress addresses to the storage firewall",
          "Connect privately, for example through a private endpoint reached over a VPN or peering",
          "Agree firewall changes with the integration team in advance",
          "Switch the app from the account key to a SAS token scoped to the container",
        ],
        answer: [0,1,2],
        explain: "Allow the real source or connect privately. A SAS changes how the app signs in, not where it calls from, so the firewall still blocks it.",
      },
      {
        type: 'single',
        prompt: "What must be true before allowing egress IPs?",
        options: [
          "The app’s egress addresses must stay fixed across restarts",
          "The app must call the account by IP address instead of by name",
          "The storage account must also allow all Azure services",
          "The app must authenticate with a managed identity, not a key",
        ],
        answer: 0,
        explain: "Allowing an address only works if traffic always comes from it.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Confirm the firewall change and the app egress addresses",
          "Add the addresses or set up private access",
          "Retry failed uploads",
          "Add a network test from the runtime to the pipeline",
          "Agree a change process with the cloud team",
        ],
        explain: "Confirm, fix, recover, then test and agree process.",
      },
    ],
  },
  description: `
## Symptoms
- From 09:31 every blob call from the doc-sync app fails with 403. Developers cannot reproduce it.

## Change / Context
- The cloud team limited the storage account to selected networks this morning.
- The app runs on CloudHub with static egress IPs.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:30:00 INFO  [cloud-team] Storage account public network access: selected networks only
2026-11-18 09:31:02 ERROR [doc-sync] Upload failed status=403 code=AuthorizationFailure
2026-11-18 09:31:02 INFO  [doc-sync] Egress IPs 34.x.x.10, 34.x.x.11 (CloudHub static IPs)
2026-11-18 09:32:00 INFO  [doc-sync] Local test from office network: upload ok
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
    "A storage firewall can block a caller with a valid key.",
    "AuthorizationFailure points at network rules or permissions.",
    "Test from the same network as production.",
    "Allow fixed egress addresses or connect privately.",
    "Agree network changes in advance.",
    "Retry failed calls after the fix.",
  ],
  solution: `
**Diagnosis.** The storage account now accepts only listed networks. The app calls from its egress addresses, which are not listed, so requests fail with AuthorizationFailure.

**Immediate mitigation.**
- Add the app’s static egress addresses to the storage firewall, then retry.

**Root cause.** A security change was made without knowing which apps use the account.

**Permanent fix.**
- Use private connectivity, such as a private endpoint reached over a VPN or peering, or keep allowing the fixed egress addresses.

**Prevention.** A list of callers per storage account, a change process, and a network test from the runtime.
`,
  followUps: [
    { q: "How is this different from AuthenticationFailed?", a: "AuthenticationFailed means the signature or key is wrong. AuthorizationFailure means the caller is not allowed." },
    { q: "Do CloudHub apps have fixed IPs?", a: "Static IPs can be assigned. Check your deployment model." },
    { q: "What is a private endpoint?", a: "A private address for the storage account inside a virtual network." },
    { q: "How do you find all callers?", a: "Storage logs show caller addresses and identities." },
  ],
}
