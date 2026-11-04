export default {
  id: 'inc-110',
  category: 'incidents',
  title: 'A Partner Loses Access After a Dedicated Load Balancer Update: Its Firewall Held Only Half the Static IPs',
  level: 'ADVANCED',
  tags: ['cloudhub', 'deployment', 'dlb', 'static-ip', 'dns', 'firewall', 'logistics'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-14 22:00:04 INFO  [runtime-manager] Load balancer lb-logi-prod: update applied by platform.admin (new certificate on api.logi-example.com)', relevant: true, why: 'The first change before the failure: a DLB update, which is one of the two events that switch the group of static IPs in use.' },
      { text: '2026-10-14 22:03:12 INFO  [partner-gw] GET https://api.logi-example.com/tracking/v1/status 200 (88 ms)', relevant: false },
      { text: '2026-10-14 22:04:40 INFO  [dns-check] api.logi-example.com -> lb-logi-prod.lb.anypointdns.net -> 52.x.x.15, 52.x.x.16, 52.x.x.17, 52.x.x.18', relevant: true, why: 'The DNS name now returns addresses that differ from the ones the partner recorded at go-live.' },
      { text: '2026-10-14 22:05:18 ERROR [carrier-tms] POST https://api.logi-example.com/tracking/v1/events failed: connect timed out to 52.x.x.15:443', relevant: true, why: 'The carrier resolves the new address correctly, then cannot connect to it.' },
      { text: '2026-10-14 22:05:19 WARN  [carrier-fw] DENY egress tcp 10.20.4.9 -> 52.x.x.15:443 (rule: allow-logi-api, destinations 52.x.x.11-14)', relevant: true, why: 'The carrier firewall allows only the four addresses that were active at go-live, so it blocks the other group.' },
      { text: '2026-10-14 22:06:00 INFO  [exp-tracking] worker 0 CPU 21% heap 44%', relevant: false },
      { text: '2026-10-14 22:07:31 INFO  [partner-gw] POST https://api.logi-example.com/tracking/v1/events 202 (61 ms) client=retail-east', relevant: false },
      { text: '2026-10-14 22:09:02 INFO  [runtime-manager] Application exp-tracking status STARTED, 2 workers', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The DLB update switched it to its unused group of static IPs, and the carrier firewall allowed only the group that was active at go-live',
          'The new certificate is invalid for api.logi-example.com',
          'The exp-tracking workers ran out of capacity after the update',
          'The mapping rules were lost during the DLB update',
        ],
        answer: 0,
        explain: 'A DLB has twice as many static IPs as workers, and half are in use at any time. A restart or update moves to the other half. Other clients still get 200 and 202 responses, so the certificate, rules and workers are working.',
      },
      {
        type: 'single',
        prompt: 'A DLB with four workers has static IPs enabled. How many static IPs must the carrier know about if it filters by address?',
        options: ['Eight, in two groups of four', 'Four', 'Two', 'One per application behind the DLB'],
        answer: 0,
        explain: 'The number of static IPs is double the number of DLB workers: the docs use exactly this example of four workers and eight addresses.',
      },
      {
        type: 'single',
        prompt: 'What is the right immediate action?',
        options: [
          'Ask the carrier to allow the addresses that the DNS name now returns, then confirm that its calls succeed and that its queued events are resent',
          'Delete and recreate the DLB so that it gets the old addresses back',
          'Enable Use Static IP on exp-tracking',
          'Roll back the certificate',
        ],
        answer: 0,
        explain: 'The block is on the carrier side, so that is where the fix belongs. The Use Static IP setting of an app concerns its outbound address, not what clients of the DLB connect to. This restores service; the lasting advice in the docs is to call the DLB by its DNS name.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix and prevention?',
        options: [
          'Publish the DNS name as the contract with partners, not IP addresses',
          'Require clients to retry, so that they can ride out the DNS switch',
          'Require clients to respect the 30-second DNS TTL, including keep-alive connections',
          'If a partner must filter by address, treat each DLB update as a firewall change: it might require additional static IPs, which the docs say to add to the allowlist before you click Update',
          'Freeze the DLB so that it is never updated or restarted',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The switch is what gives zero-downtime restarts and updates, so it must be designed for. Certificates and configuration will keep changing, so a freeze is not a fix.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Link the start of the failures to the DLB update at 22:00',
          'Compare the addresses in DNS with the destinations in the carrier firewall rule',
          'Confirm that other clients are succeeding through the same DLB',
          'Have the carrier allow the addresses now in use',
          'Verify the carrier traffic and agree the DNS-based contract for all partners',
        ],
        explain: 'Tie the symptom to the change, prove where the block is, rule out a platform fault, then fix and prevent.',
      },
    ],
  },
  description: `
## Symptoms
- Wednesday 22:05: a carrier reports that every call to \`api.logi-example.com\` times out from its TMS. Shipment events are queuing on its side.
- Other partners report nothing. \`exp-tracking\` is STARTED with 2 workers and normal CPU.

## Change / Context
- The API runs on **CloudHub 1.0** behind a **dedicated load balancer** \`lb-logi-prod\` with **4 DLB workers** and static IPs enabled.
- At 22:00 a platform administrator applied an update to the DLB to add a renewed certificate.
- The carrier has a strict egress firewall. At go-live, 18 months ago, its network team ran a DNS lookup and added the four returned addresses to rule \`allow-logi-api\`.
- The DLB had not been restarted or updated in that time.

## Logs
\`\`\`
22:00:04 INFO  [runtime-manager] Load balancer lb-logi-prod: update applied
22:04:40 INFO  [dns-check] lb-logi-prod.lb.anypointdns.net -> 52.x.x.15, .16, .17, .18
22:05:18 ERROR [carrier-tms] POST .../tracking/v1/events: connect timed out to 52.x.x.15:443
22:05:19 WARN  [carrier-fw] DENY egress 10.20.4.9 -> 52.x.x.15:443 (allow-logi-api: 52.x.x.11-14)
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
    'With static IPs enabled, a DLB has double its worker count in addresses: four workers means eight.',
    'Half are in use at any time; a restart or update switches to the unused group.',
    'The docs say to call the DLB by DNS name, not by IP address, and that clients need retries for the DNS switch.',
    'Clients should adhere to the 30-second DNS TTL, including keep-alive (60 seconds by default).',
    'The switch enables zero-downtime restarts and updates when transactions are shorter than 600 seconds or the Mule Application Response Timeout, whichever is smaller.',
    'Other clients working through the same DLB points away from the certificate, rules and workers.',
  ],
  solution: `
**Diagnosis.** Failures start minutes after a DLB update. DNS returns new addresses, the carrier resolves them correctly, and its own firewall denies them. Other partners succeed through the same DLB, so the platform is healthy.

**Immediate mitigation.** Ask the carrier network team to add the addresses that DNS now returns to \`allow-logi-api\`. Confirm the calls succeed, and that the carrier resends the events it queued.

**Root cause.** With static IPs enabled, the DLB has **double** its worker count in addresses, and half are in use at any given time. A restart or update switches to the unused group. A one-time DNS lookup captured only the active half. For 18 months the DLB never switched, so the gap stayed hidden.

**Permanent fix.**
- Make the DNS name the contract with partners, as the docs advise.
- If the carrier cannot filter by name, note that the docs have no procedure for this beyond one rule: an update might require additional static IPs, and those go on the allowlist before you click **Update**. Holding both groups follows from the switching behaviour, but it is your own design decision, not documented advice.
- Clients need retries, and must honour the 30-second TTL, including keep-alive connections.

**Prevention.**
- Put the static IP behaviour in the partner onboarding guide.
- Review partner firewall lists whenever the DLB worker count changes.
- Announce DLB updates to partners that filter by address.
- Test a DLB restart in a lower environment with a partner before go-live.
`,
  followUps: [
    { q: 'Would a second DLB restart have fixed it?', a: 'It would switch back to the other group, so the carrier might recover for a while. It affects all clients and leaves the same trap for the next update, so it is not a fix.' },
    { q: 'Why is the update called zero downtime if the carrier was down?', a: 'The platform switch is zero downtime for clients that follow the DNS name and can reach both groups. No transactions are dropped if they finish within 600 seconds or the Mule Application Response Timeout, whichever is smaller.' },
    { q: 'What else can go wrong with DNS during DLB changes?', a: 'When the DLB is stopped during a configuration change, its DNS records are deleted. A lookup at restart can cache an NXDOMAIN error for 15 minutes, so the docs advise stopping all API calls during that change.' },
  ],
}
