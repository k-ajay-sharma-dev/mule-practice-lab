export default {
  id: 'inc-111',
  category: 'incidents',
  title: 'First Migration Wave Stalls: Apps Moved to CloudHub 2.0 Cannot Reach CloudHub 1.0 APIs Through the DLB',
  level: 'ADVANCED',
  tags: ['cloudhub', 'cloudhub-2', 'deployment', 'migration', 'dlb', 'firewall', 'retail'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-09-20 06:02:11 INFO  [runtime-manager] prc-orders deployed to private space ps-retail-eu, 2 replicas RUNNING', relevant: false },
      { text: '2026-09-20 06:12:40 ERROR [prc-orders] HTTP:CONNECTIVITY calling https://apis.retail-example.com/sys-inventory/v1/stock: request could not be completed', relevant: true, why: 'The migrated app fails when it calls a CloudHub 1.0 API through the DLB vanity domain.' },
      { text: '2026-09-20 06:12:40 INFO  [prc-orders] GET /api/health 200 (3 ms)', relevant: false },
      { text: '2026-09-20 06:13:02 INFO  [exp-web] GET https://apis.retail-example.com/sys-inventory/v1/stock 200 (54 ms) source=cloudhub-1.0', relevant: true, why: 'The same URL works from an app still on CloudHub 1.0, so sys-inventory and the DLB mapping rule are healthy.' },
      { text: '2026-09-20 06:14:15 INFO  [network-review] DLB lb-retail-prod allowlist: 10.40.0.0/16, 203.0.113.0/24', relevant: true, why: 'The allowlist holds only the existing ranges. None of the CloudHub 2.0 infrastructure CIDR ranges are on it.' },
      { text: '2026-09-20 06:15:30 INFO  [private-space] ps-retail-eu outbound rule: allow all, status ACTIVE', relevant: false },
      { text: '2026-09-20 06:16:02 INFO  [sys-inventory] worker 1 CPU 18% heap 39%', relevant: false },
      { text: '2026-09-20 06:18:44 WARN  [prc-orders] order ORD-44812 parked for retry: stock check unavailable', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The DLB blocks CloudHub 2.0 traffic by default, and the CloudHub 2.0 infrastructure CIDR ranges were never added to its allowlist',
          'CloudHub 2.0 apps cannot call CloudHub 1.0 apps at all, so sys-inventory must migrate in the same wave',
          'The target URL must change, because CloudHub 2.0 cannot resolve DLB vanity domains',
          'The mapping rule for sys-inventory was lost during the deployment of prc-orders',
        ],
        answer: 0,
        explain: 'CloudHub 2.0 uses a separate infrastructure CIDR pool. The guide states that a CloudHub 2.0 app can keep the same target URL, and that the DLB blocks it until those ranges are on the allowlist.',
      },
      {
        type: 'multi',
        prompt: 'Which ranges does the migration guide list for the DLB allowlist?',
        options: ['100.64.0.0/16', '100.66.0.0/16', '100.67.0.0/16', '100.68.0.0/16', '10.0.0.0/8'],
        answer: [0, 1, 2, 3],
        explain: 'These four are the CloudHub 2.0 infrastructure CIDR ranges in the guide. Adding a broad private range would widen access without solving the problem.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Add the CloudHub 2.0 infrastructure CIDR ranges to the DLB allowlist, confirm that upstream TLS 1.2 or higher is enabled, and retest',
          'Roll sys-inventory forward to CloudHub 2.0 tonight',
          'Add a DENY rule to the private space for the failed traffic',
          'Change prc-orders to call the worker directly on port 8091',
        ],
        answer: 0,
        explain: 'This restores the path with a change on the DLB alone. Calling workers directly would lose load balancing and depends on internal connectivity that the guide says not to assume.',
      },
      {
        type: 'multi',
        prompt: 'Which checks belong in the runbook for every later wave?',
        options: [
          'Add the DLB allowlist step to the plan before the first app moves',
          'If the VPC was upgraded, validate internal calls with the Network Tools application, since firewall rules outside 80, 443 and 30500 to 32500 are removed',
          'For calls from CloudHub 1.0 to CloudHub 2.0, add an ingress firewall rule for the VPC CIDR and check the TLS context',
          'Keep backend allowlists holding both the old and the new static IPs until decommissioning',
          'Remove the DLB allowlist entirely during the migration',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Coexistence needs network work in both directions. Removing the allowlist would expose the DLB to every source to save one step.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Confirm that the same URL works from CloudHub 1.0, which clears sys-inventory and the mapping rule',
          'Review the DLB allowlist against the infrastructure CIDR ranges',
          'Add the four CIDR ranges and apply the changes',
          'Verify upstream TLS 1.2 or higher on the DLB',
          'Retest from prc-orders and release the parked orders',
        ],
        explain: 'Isolate the failing path, make the allowlist change, check the related TLS requirement, then verify and recover the work that waited.',
      },
    ],
  },
  description: `
## Symptoms
- Sunday 06:12, just after the first migration wave: \`prc-orders\` is RUNNING on CloudHub 2.0, but every stock check fails. Orders are parked for retry.
- \`exp-web\`, still on CloudHub 1.0, calls the same inventory URL successfully.

## Change / Context
- A retailer is migrating from **CloudHub 1.0** to **CloudHub 2.0** in waves. Wave 1 moved \`prc-orders\` to a new, manually created private space \`ps-retail-eu\`.
- \`sys-inventory\` stays on CloudHub 1.0 until wave 3, behind the DLB \`lb-retail-prod\` on \`apis.retail-example.com\`.
- The DLB has an allowlist for the corporate network and one partner range.
- The wave plan covered the Transit Gateway, the backend allowlists and the Ingress tab. It had no DLB changes.

## Logs
\`\`\`
06:12:40 ERROR [prc-orders] HTTP:CONNECTIVITY calling https://apis.retail-example.com/sys-inventory/v1/stock
06:13:02 INFO  [exp-web] GET .../sys-inventory/v1/stock 200 (54 ms) source=cloudhub-1.0
06:14:15 INFO  [network-review] DLB lb-retail-prod allowlist: 10.40.0.0/16, 203.0.113.0/24
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
    'A CloudHub 2.0 app can keep the same target URL for a CloudHub 1.0 app; no endpoint change is required.',
    'CloudHub 2.0 uses a separate infrastructure CIDR pool, and the DLB blocks its traffic by default.',
    'Add 100.64.0.0/16, 100.66.0.0/16, 100.67.0.0/16 and 100.68.0.0/16 to the DLB allowlist.',
    'The DLB must support TLS 1.2 or higher for upstream connections from CloudHub 2.0.',
    'The reverse direction needs an ingress firewall rule for the VPC CIDR and a valid TLS context.',
    'A working call from CloudHub 1.0 clears the target API and the mapping rule.',
  ],
  solution: `
**Diagnosis.** The URL works from CloudHub 1.0 and fails from CloudHub 2.0, so \`sys-inventory\` and the mapping rule are fine. What differs is the source of the traffic, and the allowlist has no CloudHub 2.0 ranges.

**Immediate mitigation.** In Runtime Manager, open the load balancer, and add the following to its allowlist:
- \`100.64.0.0/16\`
- \`100.66.0.0/16\`
- \`100.67.0.0/16\`
- \`100.68.0.0/16\`

Confirm that upstream TLS 1.2 or higher is enabled. Retest, and release the parked orders.

**Root cause.** CloudHub 2.0 uses a separate infrastructure CIDR pool, and the DLB blocks that traffic until the ranges are allowed. The wave plan treated the URL as the only dependency, and that part really needed no change.

**Permanent fix.** Keep these ranges on the allowlist until the DLB is decommissioned. Ask the network team whether this traffic routes over the public internet or can use internal routing, and record the decision.

**Prevention.**
- Add a cross-platform section to the wave template, in both directions.
- For CloudHub 1.0 to CloudHub 2.0, add ingress firewall rules for the VPC CIDR and check the TLS context.
- Test each moved app in a lower environment against APIs that remain on CloudHub 1.0, behind a DLB with the production allowlist settings.
`,
  followUps: [
    { q: 'What if this estate had used the VPC upgrade path?', a: 'Internal app-to-app calls would also need checking. The upgrade removes VPC firewall rules for ports other than 80, 443 and 30500 to 32500, so rules for 8081 and 8082 may be gone. Validate with the Network Tools application and recreate the rules you need.' },
    { q: 'Does the allowlist limit matter here?', a: 'It can. The maximum is 240 entries with inbound HTTP mode Off, and 120 with On or Redirect, so check the headroom on a DLB with a long list.' },
    { q: 'How do you recover the parked orders safely?', a: 'Release them at a controlled rate once the stock check works, and make sure the order flow is idempotent, so that a retry of an order that partly completed does not create a duplicate.' },
  ],
}
