export default {
  id: 'ms-153',
  category: 'mulesoft',
  title: 'Locking Down Private Space Egress: Firewall Rules, Application-Level Rule Groups, Domains and Their Limits',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'firewall', 'egress', 'private-space', 'networking', 'security'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'How do application-level egress rules relate to private space firewall rules?',
      options: [
        'They are independent, and outbound traffic must pass both the private space level and the application level',
        'Application-level rules replace the firewall rules once they are enabled',
        'Traffic allowed by either level goes through',
        'Application-level rules apply only to traffic going over the VPN',
      ],
      answer: 0,
      explain: 'Think of two gates in a row. A correct application rule does not help if the private space blocks the same traffic.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about a newly created private space are correct?',
      options: [
        'All traffic to the space is blocked unless a firewall rule allows it',
        'Rules are created that allow inbound HTTPS on 443 and HTTP on 80 from any host',
        'Rules are created that allow outbound TCP on all ports and HTTPS on 443 to any host',
        'Application-level egress rules are disabled',
        'IPv6 firewall rules can be added for dual-stack partners',
      ],
      answer: [0, 1, 2, 3],
      explain: 'CloudHub 2.0 does not support IPv6 firewall rules. Application-level egress starts disabled, and the docs say to finish provisioning the private network before enabling it.',
    },
    {
      type: 'single',
      prompt: 'A team removes the general outbound rules and adds application-level rule groups for Anypoint MQ. MQ still fails. What do the docs say is also required?',
      options: [
        'Outbound access on port 443 at the private space level, set up separately',
        'A second rule group for the same domain',
        'Port 8081 opened inbound',
        'A VPN to the Anypoint control plane',
      ],
      answer: 0,
      explain: 'For Anypoint MQ, Object Store v2 and API Manager, the private space must allow outbound 443 in addition to the application-level rule.',
    },
    {
      type: 'match',
      prompt: 'Match each case to the documented behaviour of domain-based egress rules.',
      pairs: [
        ['`salesforce.com` redirects to `www.salesforce.com`', 'Allow both the original and the redirected target'],
        ['A rule for `salesforce.com`, a call to `example.salesforce.com`', 'Not covered: wildcard records are not supported'],
        ['AWS regional endpoints such as `s3.ap-northeast-1.amazonaws.com`, with a 5-second TTL', 'Avoid: domains with TTLs under 30 seconds can cause intermittent failures'],
        ['A hostname held only in the private space internal DNS', 'Custom domains cannot be used with private space internal DNS'],
      ],
      explain: 'Short TTLs and rapidly changing IP pools are a documented limitation, and AWS STS regional endpoints are named as unsupported.',
    },
    {
      type: 'single',
      prompt: 'An architect deletes the custom rule group `grp-payments` while apps use it. What happens to those apps?',
      options: [
        'They immediately start using the default egress rule group',
        'They lose all outbound access until redeployed',
        'They keep the deleted rules until the next restart',
        'The deletion is refused until the apps are redeployed',
      ],
      answer: 0,
      explain: 'The default group cannot be renamed or deleted, and if nobody has edited it, its rule is Allow any protocol to any destination. Deleting a custom group can therefore open up an app.',
    },
    {
      type: 'single',
      prompt: 'During a stressful change, someone wants to turn off the App-Level Egress Rules toggle "to get back to normal". What is the documented effect?',
      options: [
        'All custom rule groups are deleted, and all application-level egress is allowed for all applications',
        'Custom rule groups are kept and resume when the toggle is enabled again',
        'All outbound traffic from the private space is blocked',
        'Only the default rule group is deleted',
      ],
      answer: 0,
      explain: 'The confirmation button reads Delete and Disable App-Level Rules. If your rule groups took weeks to agree, keep them in version-controlled documentation, because this is not a pause button.',
    },
    {
      type: 'match',
      prompt: 'Match each item to its documented value.',
      pairs: [
        ['Added latency from application-level rules', '3 to 10 milliseconds'],
        ['Recommended limit for active rule groups in a space', '20'],
        ['Recommended domains per rule group, at a minimum TTL of 30 seconds', 'Up to 8'],
        ['Recommended limit for rule groups and rules combined', '800'],
        ['Firewall rules per direction in a private space', '300'],
      ],
      explain: 'The first four come from the Performance Impact section and the last one from the Limits page. The docs add that intermittent connection failures can occur, so robust retry handling is part of the design.',
    },
    {
      type: 'multi',
      prompt: 'Security wants to remove all ingress and egress rules to the internet. Which statements are correct?',
      options: [
        'The private space still functions, because Anypoint Monitoring ingestion rules are added implicitly and essential AWS traffic is always allowed',
        'You can remove the default route to the Internet Gateway, but egress firewall rules only work if destination IPs are routable',
        'Anypoint MQ, Object Store v2 and API Manager require internet access from your network',
        'If all traffic is routed through your network, your firewall or proxy must allow the hostnames that CloudHub 2.0 uses to pull container images',
        'Deployments are unaffected by any change to outbound routing',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Blocked image hostnames cause `ErrImagePull` or `ImagePullBackOff`. Note also that deleting the default egress route can cause Anypoint Monitoring to fail, according to the overview page.',
    },
  ],
  description: `
A bank has one production **CloudHub 2.0** private space with 30 apps. Today the space allows all outbound traffic. An audit finding requires each app to reach only named destinations, and the security team has drafted this plan:

| Step | Proposal |
|---|---|
| 1 | Replace the general outbound rules with rules for 443 and a few database ports |
| 2 | Enable application-level egress rules and give each domain area its own rule group |
| 3 | Allow \`salesforce.com\` for CRM apps, and \`s3.eu-west-1.amazonaws.com\` for the archive app |
| 4 | Create 45 rule groups, one per app and environment, with about 20 domains in each |
| 5 | If anything breaks, disable the toggle and try again later |

Several apps use Anypoint MQ, Object Store v2 and API Manager policies, and two apps are clustered.

**Questions**
1. Explain the two layers of control and how they interact.
2. What does each platform service need in order to keep working?
3. Review steps 3, 4 and 5 against the documented limitations.
4. What are the costs of application-level rules, and how do you limit them?
5. What does the private space need to keep functioning if internet egress is removed?
`,
  answerTemplate: `## Two layers of control

## What platform services need

## Review of the plan

## Performance and limits

## Removing internet egress
`,
  keyPoints: [
    'Egress must pass both the private space firewall and the application-level rules; they are independent.',
    'Application-level egress is disabled by default. Enabling it activates Default-Egress-Rule-Group, whose default rule allows any protocol to any destination.',
    'Changes to the default group affect all apps in the space; it cannot be renamed or deleted.',
    'Anypoint MQ, Object Store v2 and API Manager need rules for their domains plus outbound 443 at the private space level.',
    'Domain rules have no wildcards, need both sides of a redirect, and do not support domains with TTLs under 30 seconds or AWS STS regional endpoints.',
    'Clustered apps need a rule for TCP to the local private network on port 5701.',
    'Deleting a custom group moves its apps to the default group; disabling the feature deletes all custom groups and allows all application-level egress.',
    'Expect 3 to 10 ms of added latency; recommended limits are 20 active groups, 8 domains per group and 800 groups and rules combined.',
  ],
  solution: `
**1. Layers.** The private space firewall controls traffic for the whole space by protocol, destination and port. Application-level rule groups add per-app control, including by domain. Traffic must pass both, so plan them together.

**2. Platform services.**
- **Anypoint MQ**: a rule for the control plane (\`anypoint.mulesoft.com\`, or \`eu1.anypoint.mulesoft.com\` for EU) and one for the MQ domain from the connector URL, such as \`mq-us-east-1.anypoint.mulesoft.com\`.
- **Object Store v2**: a rule for the control plane and the regional store domain, such as \`object-store-ap-southeast-1.anypoint.mulesoft.com\`.
- **API Manager**: \`anypoint.mulesoft.com\`, \`exchange-files.anypoint.mulesoft.com\` and \`analytics-ingest.anypoint.mulesoft.com\` (or the \`eu1\` equivalents), plus further hostnames depending on your use case.
- All three also need outbound 443 at the private space level.
- **Clustered apps**: add TCP to the local private network on port 5701, or replicas cannot join the Hazelcast cluster.

**3. Plan review.**
- Step 3: \`salesforce.com\` does not cover subdomains, and a redirect target needs its own entry. The S3 regional endpoint is a named example of a domain to avoid, because of its low TTL, so handle S3 at the private space firewall.
- Step 4: 45 groups and 20 domains per group goes far beyond the recommended limits of 20 active groups and 8 domains per group. Group by destination set, not by app and environment.
- Step 5: disabling deletes all custom groups and allows everything at application level. Fix forward instead, or set the affected app to a group that works.

**4. Costs.** Expect 3 to 10 milliseconds of latency on connections, and in some cases intermittent connection failures. Use domains with a TTL of at least 30 seconds, stay within the recommended limits and build retries into the apps.

**5. No internet egress.** The space still functions, because Anypoint Monitoring ingestion rules are implicit and essential AWS traffic is allowed. Remember what depends on your new path: Anypoint MQ, Object Store v2 and API Manager require internet access from your network, and image hostnames must be allowed if the default route is removed.
`,
  followUps: [
    { q: 'What limits the name of a custom rule group?', a: 'The generated firewall rule name, in the form private-space-name, hyphen, rule-group-name, cannot exceed 53 characters.' },
    { q: 'Where does an app choose its rule group?', a: 'On the Firewall Rules tab when deploying the app, in the Egress Rule Group section.' },
    { q: 'Which permissions are needed?', a: 'CloudHub Network Viewer to view firewall and application-level rules, and CloudHub Network Administrator to change them.' },
    { q: 'Is an internal DNS change needed if a transit gateway carries the default route?', a: 'The docs say to add your private DNS IP addresses to the route table if you have a transit gateway to reach internal DNS servers and the default route goes to the transit gateway.' },
  ],
}
