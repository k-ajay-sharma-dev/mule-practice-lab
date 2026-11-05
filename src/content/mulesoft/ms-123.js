export default {
  id: 'ms-123',
  category: 'mulesoft',
  title: 'Migrating from CloudHub 1.0 to 2.0: DLB Features, Static IPs, Ports and Traffic Switching',
  level: 'ADVANCED',
  tags: ['cloudhub', 'cloudhub-2', 'deployment', 'migration', 'dlb', 'static-ip', 'ingress'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each DLB feature to its CloudHub 2.0 equivalent.',
      pairs: [
        ['URL mapping rules', 'Per-app path and path rewrite on the Ingress tab'],
        ['Client certificate validation (mTLS)', 'TLS contexts and truststores at private space level'],
        ['Allowlist entries', 'Inbound firewall rules on the private space'],
        ['Custom cipher suites', 'Custom TLS context, not the default one'],
      ],
      explain: 'URL rewriting moves from one central load balancer to each application, so the DLB rule list becomes settings on every app. Forward SSL Session passes client certificate information to the app through headers.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The DLB has a denylist that blocks a set of abusive ranges. What is the CloudHub 2.0 equivalent?',
      options: [
        'There is none: firewall rules are allow-only, so allow only trusted CIDRs, or block upstream with a WAF or Flex Gateway policy',
        'An inbound firewall rule with action DENY on the private space',
        'A deny list in the default TLS context',
        'A property set on each application',
      ],
      answer: 0,
      explain: 'This is a gap to design for before the migration, because a like-for-like mapping does not exist.',
    },
    {
      type: 'single',
      prompt: 'An on-premises database allowlists a different static IP for each of three CloudHub 1.0 apps, and uses the IP to identify the calling app. What changes on CloudHub 2.0?',
      options: [
        'Outbound static IPs are per private space and shared by all its apps, so identify the app with mTLS client certificates or API keys and update the allowlist',
        'Each app keeps its own IP as before, if you enable Use Static IP',
        'CloudHub 1.0 static IPs move to each app in the private space automatically',
        'Only the first app keeps its IP',
      ],
      answer: 0,
      explain: 'Unique IPs per app are available only by deploying to different private spaces. During migration, keep the old and new IPs on the allowlist until decommissioning is complete.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'What must change in the listener configuration of an app that uses `${http.private.port}`?',
      options: [
        'Remove the CloudHub 1.0 port settings and use the standard `${http.port}` (port 8081) on CloudHub 2.0',
        'Keep it, because 8091 is still reserved for internal traffic',
        'Replace it with port 30500',
        'Replace it with `${https.port}` on port 8082',
      ],
      answer: 0,
      explain: 'The migration guide says to remove `http.port`, `https.port`, `http.private.port` and `https.private.port` settings specific to CloudHub 1.0. The troubleshooting steps also check that the listener is on 8081.',
    },
    {
      type: 'single',
      prompt: 'A company moves to CloudHub 2.0 with the VPC upgrade path, which turns its CloudHub 1.0 VPC into a private space. The VPC has Transit Gateway connections to a data centre. What happens to those connections?',
      options: [
        'They transfer to the new private space automatically',
        'They are dropped, and the private space needs its own attachment',
        'They stay on the old VPC until it is decommissioned',
        'They transfer only after you add rules for ports 8081 and 8082',
      ],
      answer: 0,
      explain: 'With the VPC upgrade, existing Transit Gateway connections transfer to the new private space automatically. A private space created manually is different: it has a different CIDR block and needs its own Transit Gateway attachment. The upgrade also removes VPC firewall rules for ports other than 80, 443 and 30500 to 32500, so rules for 8081 and 8082 can be dropped. Validate internal app-to-app connectivity with the Network Tools application after the upgrade. After the upgrade the CloudHub VPC is locked for infrastructure changes.',
    },
    {
      type: 'multi',
      detail: true,
      needsScenario: true,
      prompt: 'Which preconditions apply before switching traffic for an app behind a DLB that expects HTTPS?',
      options: [
        'Restart the DLB before you start switching traffic',
        'The user performing the switch has the CloudHub Network Administrator permission',
        'Keep the CloudHub 1.0 app in the STARTED state until the app link is established',
        'Enable Last-Mile Security and upstream TLS 1.2 or higher',
        'Route traffic through the default *.cloudhub.io endpoint of the new app while testing',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The default `*.cloudhub.io` endpoint is what you must avoid for a new CloudHub 2.0 app, since using it can cause traffic outages. Use a custom vanity domain instead.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'A CloudHub 1.0 app has both the default endpoint and a vanity domain on a DLB. You want the DLB to switch the traffic. What do you do?',
      options: [
        'Remove the default endpoint of the CloudHub 1.0 app, apply changes, then change the traffic switch percentage',
        'Nothing, because the DLB always takes priority',
        'Delete the vanity domain from the DLB',
        'Stop the CloudHub 1.0 app first',
      ],
      answer: 0,
      explain: 'With a default endpoint configured, the switch happens at the shared load balancer. Vanity domains on CloudHub 2.0 must also match those on CloudHub 1.0 to prevent dropped traffic.',
    },
  ],
  description: `
A retailer has one Anypoint VPC with **65 applications on CloudHub 1.0**. It also has:

- A DLB with 40 mapping rules, an allowlist and a denylist.
- mTLS for two partners.
- A Transit Gateway to the data centre.
- Per-app static IPs allowlisted on Oracle and a SaaS tax service.

Management wants to move to **CloudHub 2.0** in waves over six months, with no client changes.

**Questions**
1. How does each DLB feature map to CloudHub 2.0, and where are the gaps?
2. What changes for static IPs and backend allowlists?
3. What must change in the applications?
4. How do the VPC upgrade path and a manually created private space differ?
5. What must be in place before you switch traffic?
`,
  answerTemplate: `## DLB feature mapping

## Static IPs and allowlists

## Application changes

## Upgrade path or manual private space

## Before switching traffic
`,
  keyPoints: [
    'URL mapping becomes per-app path and path rewrite; mTLS moves to TLS contexts and truststores; allowlist entries become inbound firewall rules.',
    'There is no deny rule on CloudHub 2.0: use trusted allow rules, or a WAF or Flex Gateway upstream.',
    'Cipher suites can be set only on custom TLS contexts.',
    'Outbound static IPs are per private space; per-app IP identification stops working.',
    'Keep old and new IPs in backend allowlists until decommissioning is complete.',
    'Remove CloudHub 1.0 port settings; CloudHub 2.0 uses ${http.port} (8081).',
    'The upgrade transfers Transit Gateway connections but drops firewall rules outside 80, 443 and 30500 to 32500.',
    'Traffic switches at the shared load balancer if the default endpoint exists; otherwise at the DLB.',
  ],
  solution: `
**1. DLB features.**

| DLB | CloudHub 2.0 |
|---|---|
| Mapping rules | Path and path rewrite per app on the Ingress tab |
| mTLS | TLS contexts and truststores at private space level; Forward SSL Session if apps need client certificate information |
| Cipher suites | Custom TLS contexts only |
| Allowlist | One inbound firewall rule per CIDR |
| Denylist | No equivalent: allow only trusted CIDRs, or use a WAF or Flex Gateway |

The 40 mapping rules become settings on each app, so plan that work per wave.

**2. Static IPs.** CloudHub 1.0 gives an app its own outbound IP; CloudHub 2.0 shares outbound static IPs across the private space. Inventory every system that allowlists by source IP, find the outbound NAT IPs under Private Spaces > Network, and add them while keeping the old ones until decommissioning. If a backend uses the IP to identify the app, move to mTLS client certificates or API keys. Unique IPs need a separate private space.

**3. Applications.** Remove \`http.port\`, \`https.port\`, \`http.private.port\` and \`https.private.port\` settings, and listen on \`$\{http.port}\` (8081). The \`publicUrl\` in \`pom.xml\` must match the endpoint in the UI, or the ingress configuration is lost.

**4. Paths.**
- **VPC upgrade**: Transit Gateway connections transfer automatically, but firewall rules for ports other than 80, 443 and 30500 to 32500 are removed, and the VPC is locked for infrastructure changes afterwards. Validate internal calls with the Network Tools application.
- **Manual private space**: a different CIDR block, and no inherited Transit Gateway connections, so during the migration you need both attachments.

**5. Before switching.** Restart the DLB, confirm the CloudHub Network Administrator permission, and keep the 1.0 app STARTED until the app link is established. For HTTPS behind a DLB, enable Last-Mile Security, enable upstream TLS 1.2 or higher, and make the vanity domains match. Do not route through the default \`*.cloudhub.io\` endpoint.
`,
  followUps: [
    { q: 'How do apps on the two platforms call each other during the waves?', a: 'CloudHub 2.0 apps can keep their target URLs for CloudHub 1.0 apps, but the DLB blocks them until the CloudHub 2.0 infrastructure CIDR ranges are on its allowlist. CloudHub 1.0 apps need an ingress firewall rule for the VPC CIDR on the private space, and a valid TLS context for HTTPS.' },
    { q: 'Why might a new app in the upgraded private space not be reachable from CloudHub 1.0 on the shared vanity domain?', a: 'The docs state that a new app with the same custom domain cannot be reached that way, while a migrated app can. The workaround is to deploy the app to CloudHub 1.0 first and then migrate it.' },
    { q: 'What if a DLB certificate is missing after migration?', a: 'Check Domains & TLS on the private space. If the certificate is missing, upload it and create a TLS context. Intermediate and root certificates are split out and uploaded as a CA Path Certificate.' },
  ],
}
