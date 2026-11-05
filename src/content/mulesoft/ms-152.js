export default {
  id: 'ms-152',
  category: 'mulesoft',
  title: 'Troubleshooting Anypoint VPN and Transit Gateway Attachments: Tunnels, Routes, IKE Lifetimes and Attachment States',
  level: 'EXPERT',
  tags: ['cloudhub-2', 'cloudhub', 'deployment', 'vpn', 'transit-gateway', 'networking', 'troubleshooting'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each Anypoint VPN symptom to the explanation in the troubleshooting page.',
      pairs: [
        ['Static VPN: remote networks vanish from the route table while the tunnel is down', 'Expected: they are added when the tunnel is active and removed when it is inactive'],
        ['Phase 2 SA is established but traffic does not pass', 'More than one traffic selector: only one SA pair per tunnel is supported'],
        ['Tunnel disconnects after a quiet period', 'No interesting traffic, so traffic must be sent periodically or BGP adopted'],
        ['BGP tunnel works but routes are not propagated', 'The neighbor IP is not the Local point-to-point IP from the tunnel details'],
      ],
      explain: 'These come from the Troubleshoot Anypoint VPN and Anypoint VPN Maintenance pages. Policy-based devices often create an SA per ACL entry, which is why rules must be consolidated.',
    },
    {
      type: 'single',
      prompt: 'A network engineer wants to script failover between tunnels from the tunnel status shown in Runtime Manager. What do the docs advise?',
      options: [
        'Do not: status can lag by up to five minutes because of the delay in the infrastructure provider API, so monitor tunnels at the customer-side gateway',
        'That is the recommended approach, because the status is updated in real time',
        'Use it only for BGP tunnels',
        'Use it, but poll no more than once per hour',
      ],
      answer: 0,
      explain: 'The UI status is for information. The device on your side sees tunnel state first, and with BGP and DPD it can switch without any script.',
    },
    {
      type: 'match',
      prompt: 'Anypoint VPN updates are applied on demand with no published window. Match each configuration to its impact during maintenance.',
      pairs: [
        ['At least one tunnel pair with BGP and DPD', 'Minimal downtime: the switchover takes a few seconds'],
        ['Tunnel pair with static routing', 'Some downtime before reconnection, longer without automated failover'],
        ['No BGP or failover mechanism, or only one tunnel', 'An outage of up to 60 minutes'],
      ],
      explain: 'This is the best argument for BGP and for a high-availability VPN. If tunnels are not back within 10 to 15 minutes, restart your end, and on static routing generate interesting traffic.',
    },
    {
      type: 'single',
      prompt: 'After a maintenance event, an IKEv2 tunnel is unreliable. Your firewall uses 28800 and 3600 seconds, the values in the AWS documentation. What does MuleSoft recommend?',
      options: [
        'Set Phase 1 to 28000 seconds and Phase 2 to 3000 seconds, so that your firewall times out first and controls the rekey',
        'Keep 28800 and 3600 seconds for IKEv2 in all cases',
        'Set both lifetimes to 86400 seconds',
        'Disable rekeying on your firewall',
      ],
      answer: 0,
      explain: 'For IKEv1 the recommendation is the default of 28800 and 3600 seconds. The IKEv2 values are deliberately shorter.',
    },
    {
      type: 'multi',
      prompt: 'You are reviewing a gateway configuration against the Anypoint VPN requirements. Which items belong on the checklist?',
      options: [
        'TCP MSS adjustment of 1387 bytes',
        'Clear the Don\'t Fragment (`DF`) bit where the device supports it',
        'Fragment packets before encryption',
        'Enable DPD, with an interval of 10 and 3 retries',
        'Allow asymmetric routing when the device uses active/active tunnels',
        'Use NAT across the tunnel to hide overlapping ranges',
      ],
      answer: [0, 1, 2, 3, 4],
      explain: 'Anypoint VPN does not support NAT or IPv6. Overlapping ranges must be solved in the network plan, which is why the CIDR block is chosen so carefully.',
    },
    {
      type: 'single',
      prompt: 'A site with many small subnets asks you to add its 96th route to a private space that has two VPNs and a transit gateway. What is the rule?',
      options: [
        'A maximum of 95 route table entries is allowed per private space, regardless of the number of connections, so consolidate networks',
        'Each connection has its own limit of 95 entries',
        'There is no limit on BGP routes',
        'The limit is 95 per region',
      ],
      answer: 0,
      explain: 'The docs say to consolidate networks to the fewest possible before configuring routing. Only one connection can use a route at a time, and routes should not overlap.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to connect a private space to a new transit gateway.',
      items: [
        'Create the private network and update infrastructure such as firewalls and routes',
        'Enter the static routes on the Add Transit Gateway page',
        'Create a resource share in AWS RAM with the MuleSoft AWS account as principal',
        'Verify the share by entering its ID and Owner in Anypoint Platform',
        'Accept the attachment that shows pending acceptance in AWS',
        'Test the connection with the Network Tools application',
      ],
      explain: 'Infrastructure comes first because, while an attachment is pending acceptance, all infrastructure updates are delayed until you accept it.',
    },
    {
      type: 'match',
      prompt: 'Match each transit gateway state to its documented fix.',
      pairs: [
        ['Gateway `unknown`: the MuleSoft account principal was deleted', 'Add the principal back to the resource share'],
        ['Gateway `unknown`: the transit gateway or resource share was deleted', 'Delete the transit gateway from CloudHub 2.0'],
        ['Gateway `deleted`: removed in the AWS console only', 'Delete it from CloudHub 2.0, then create a new one'],
        ['Attachment `rejected` or `deleted`', 'Detach it from the private space, then reattach it'],
      ],
      explain: 'If a gateway stays `unknown` or `deleted` for 14 days, Anypoint Platform might remove the private space attachments from it. The gateway itself is not removed.',
    },
  ],
  description: `
A manufacturer has one production **CloudHub 2.0** private space with a VPN to its main plant, a redundant VPN to a second gateway, and a transit gateway to its own AWS account. After a quarter of incidents, the network team hands you this list and asks for a diagnosis and a standard for each.

| # | Ticket |
|---|---|
| 1 | A static VPN to a plant keeps dropping at night when nothing is running |
| 2 | Phase 2 is up on the Cisco device, but no application traffic passes |
| 3 | BGP session looks fine, but the remote subnets are not in the route table |
| 4 | A script reads tunnel status from Runtime Manager to trigger failover and fires late |
| 5 | The last VPN maintenance caused a 50-minute outage for one site |
| 6 | The AWS team deleted an old share and the transit gateway now shows \`unknown\` |
| 7 | A new plant needs 12 more routes, and the table already holds 90 |

**Questions**
1. Give the cause and fix for each ticket.
2. What must be true of a VPN so that maintenance causes no noticeable outage?
3. What are the correct steps and order to attach a transit gateway?
4. How do you read and repair transit gateway states?
`,
  answerTemplate: `## Tickets 1 to 7

## A VPN that survives maintenance

## Attaching a transit gateway

## Transit gateway states
`,
  keyPoints: [
    'One SA pair per tunnel: policy-based devices that create an SA per ACL entry need consolidated rules.',
    'Static routes appear only while the tunnel is active; BGP routes need an active session and the neighbor IP from the Local point-to-point IP.',
    'Idle tunnels can disconnect; periodic interesting traffic keeps them up, and BGP is recommended.',
    'Tunnel status in the UI can lag by up to five minutes, so monitor at the customer gateway.',
    'Maintenance impact depends on configuration: a few seconds with BGP and DPD, longer with static routing, and up to 60 minutes with one tunnel or no failover.',
    'IKEv2 lifetimes of 28000 and 3000 seconds let your firewall control the rekey.',
    'A maximum of 95 route table entries applies per private space, regardless of the number of connections.',
    'Update infrastructure before attaching a transit gateway, because pending attachments delay infrastructure updates.',
    'Transit gateway unknown, deleted and rejected states each have a specific repair, and 14 days in unknown or deleted can lead to attachments being removed.',
  ],
  solution: `
**1. Tickets.**
1. Idle static tunnels can disconnect when there is no interesting traffic. Send periodic traffic and move toward BGP.
2. Only one SA pair per tunnel is supported. Consolidate the policy and filter unwanted traffic in your own network.
3. Take the neighbor IP from the Local point-to-point IP in the tunnel details, and confirm the BGP session is active.
4. Status lags by up to five minutes because of the infrastructure provider API. Do not use it for failover. Monitor at the gateway.
5. Check the configuration: an outage of up to 60 minutes is what the docs give for a VPN without BGP or a failover mechanism, or with only one tunnel.
6. Find out what was deleted. If the MuleSoft principal was removed from the share, add it back. If the share or transit gateway was deleted, delete the gateway from CloudHub 2.0 and set it up again. Act within 14 days.
7. The limit is 95 entries per private space, so 102 will not fit. Summarise the plant subnets into fewer, larger prefixes.

**2. VPN that survives maintenance.** Configure both tunnels on your endpoint, use BGP with DPD, and add a redundant VPN on a second gateway device with a different public IP. Redundant VPNs fail over automatically with BGP. VPN updates are continuous and on demand, so there is no window to plan around.

**3. Attaching a transit gateway.** Create the private network, make any firewall and route changes, enter static routes that match the external networks, create the AWS RAM share with the MuleSoft AWS account as principal (allowing external accounts), verify ID and Owner, accept the pending attachment, and test with the Network Tools application. The private space and transit gateway must be in the same region.

**4. States.** \`unknown\` comes from a deleted gateway, a deleted share or a deleted principal. \`deleted\` means removed in AWS but not in CloudHub 2.0. An attachment that is \`rejected\` or \`deleted\` must be detached and reattached. Detaching also deletes associated routes and the attachment in AWS, so record the routes first. To retire a connection properly, remove it from CloudHub 2.0 before removing it in AWS, because removal in AWS alone disrupts the connection without removing it.
`,
  followUps: [
    { q: 'Can MuleSoft Support read VPN logs directly?', a: 'For VPN connections created after March 8, 2023, VPN logs are enabled by default and support engineers can download them directly. Older VPNs can enable them through a PATCH call, or by any later update to the VPN.' },
    { q: 'Should I create a redundant transit gateway attachment?', a: 'No. Transit gateway connections are highly available by design, and the docs say not to create redundant ones.' },
    { q: 'Why might a VPN enter asymmetric mode after an update?', a: 'The maintenance page says an Anypoint VPN with BGP routing enters asymmetric mode if the AS paths for the two tunnels of the same VPN differ.' },
    { q: 'What does "Connections limit has been reached (max=4, used=4)" mean?', a: 'All network connection entitlements are in use. VPNs and transit gateway attachments count, across CloudHub 1.0 and 2.0 together, so contact the account team for more.' },
  ],
}
