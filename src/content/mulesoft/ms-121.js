export default {
  id: 'ms-121',
  category: 'mulesoft',
  title: 'CloudHub 1.0 Networking: Static IPs, the Shared Load Balancer and Dedicated Load Balancer Mapping Rules',
  level: 'ADVANCED',
  tags: ['cloudhub', 'deployment', 'static-ip', 'dlb', 'vpc', 'load-balancer', 'tls'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'A bank allowlists callers by source IP. What gives `payments-api` a stable outbound IP on CloudHub 1.0?',
      options: [
        'Enable **Use Static IP** on the Static IPs tab of the application settings; the worker public IP becomes static',
        'Ask MuleSoft to reserve a specific address chosen by the bank',
        'Make the private IP of the worker static from the VPC settings',
        'Point the bank at the DNS name of the shared load balancer',
      ],
      answer: 0,
      explain: 'You cannot request a specific address: static IPs come from a pool. Inside a VPC only the public IP can be static; the internal private IP always remains dynamic.',
    },
    {
      type: 'multi',
      prompt: 'In which situations can a static IP of a CloudHub 1.0 application change or be lost?',
      options: [
        'The application is deleted and a new one is created with the same name',
        'The application is moved from Sandbox to Production, which needs a new name and static IP',
        'The application is redeployed to a different geographic region',
        'An existing application not yet in the Anypoint VPC restarts inside the newly built VPC',
        'The application is restarted in the same region with no other change',
      ],
      answer: [0, 1, 2, 3],
      explain: 'These are the situations the FAQ lists. In a region change you can preallocate a static IP in the new region on the Static IPs tab first.',
    },
    {
      type: 'single',
      prompt: 'How many static IPs does a subscription get by default on CloudHub 1.0?',
      options: [
        'Twice the number of Production vCores in the subscription; a higher limit is requested from Salesforce Help',
        'One per environment',
        'One per worker, with no overall limit',
        'Four per Anypoint VPC',
      ],
      answer: 0,
      explain: 'The default allocation is twice the Production vCores. Budget for it when many applications need allowlisting.',
    },
    {
      type: 'multi',
      prompt: 'The security team needs a custom certificate, two-way TLS and `api.example.com` in front of several apps. Which statements about the shared and dedicated load balancers are correct?',
      options: [
        'The shared load balancer does not allow custom SSL certificates or proxy rules',
        'A DLB can enforce two-way SSL client authentication with custom certificates',
        'DLB proxy rules map applications to custom domains, so they can sit under one domain',
        'The DLB also has higher rate limit thresholds than the shared load balancer',
        'A DLB can run in the MuleSoft shared VPC without an Anypoint VPC',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Each DLB is assigned to an Anypoint VPC. The shared load balancer also has lower, per-region rate limits and returns 429 when an application exceeds them.',
    },
    {
      type: 'single',
      prompt: 'A mapping rule has Input Path `/hello/`, Target App `myApp1` and Output Path `/test/`. A client requests `/hello/world/`. What does the DLB send to `myApp1`?',
      options: ['`/test/world/`', '`/test/hello/world/`', '`/hello/world/`', '`/test/`'],
      answer: 0,
      explain: 'The DLB removes the part that matches the input path and appends the rest to the output path. Input paths may use patterns; output paths must be literal strings.',
    },
    {
      type: 'single',
      prompt: 'The app inside the VPC listens on HTTPS, but the DLB rule was created with its default settings. What must change?',
      options: [
        'Set the rule protocol (`upstreamProtocol`) to `https`, which uses port 8092; by default the DLB talks to workers over HTTP on port 8091',
        'Nothing, because the DLB detects the protocol of the listener',
        'Set the rule protocol to `https`, which uses port 8081',
        'Move the certificate from the DLB to the app and remove the rule',
      ],
      answer: 0,
      explain: 'The DLB listens for external requests on HTTPS and by default sends plain HTTP to the worker. An HTTPS listener in the VPC needs the upstream protocol set explicitly.',
    },
    {
      type: 'single',
      prompt: 'Two rules on an SSL endpoint could both match a request. Which one is applied?',
      options: [
        'The first matching rule in the list, because order sets priority',
        'The rule with the longest input path',
        'The most recently added rule',
        'Both, with traffic split between the two apps',
      ],
      answer: 0,
      explain: 'Rules are evaluated in order, so put specific rules before general patterns. Mapping rules belong to an SSL endpoint, which is identified by the certificate common name.',
    },
  ],
  description: `
A logistics company on **CloudHub 1.0** is preparing an integration with a bank and a new customer API. It has one Anypoint VPC in eu-west-1 with applications deployed as \`logi-payments-prod\`, \`logi-tracking-prod\` and \`logi-orders-prod\`.

Requirements:
- The bank allowlists the **source IP** of \`logi-payments-prod\`.
- Customers must reach all APIs under \`api.logi-example.com\`, not \`*.cloudhub.io\`.
- Security requires a company certificate and **client certificates** for two large customers.
- \`logi-tracking-prod\` is expected to exceed the shared load balancer rate limit at peak.
- One app must be encrypted end to end up to the listener in the worker.

**Questions**
1. How do static IPs work on CloudHub 1.0, and what can change them?
2. Which features of the shared load balancer are missing for these needs?
3. How do DLB mapping rules route and rewrite requests?
4. How do you keep traffic encrypted up to the worker?
`,
  answerTemplate: `## Static IPs

## Shared load balancer limits

## DLB mapping rules

## Encryption up to the worker
`,
  keyPoints: [
    'Use Static IP makes the outbound public IP static; the internal private IP in a VPC stays dynamic and you cannot pick an address.',
    'Default allocation is twice the Production vCores.',
    'Static IPs change on deletion, Sandbox-to-Production moves, region changes and the first restart into a new VPC.',
    'The shared load balancer has no custom certificates or proxy rules, supports only TLS 1.2, has per-region rate limits and returns 429 above them.',
    'A DLB belongs to an Anypoint VPC and adds custom certificates, two-way TLS, custom domains and higher limits.',
    'Mapping rules are ordered, first match wins, and belong to an SSL endpoint; output paths are literal.',
    'Upstream is HTTP on 8091 by default; set https (port 8092) if the listener uses HTTPS.',
  ],
  solution: `
**1. Static IPs.** Enable **Use Static IP** on the Static IPs tab of \`logi-payments-prod\` and give the address to the bank. It comes from a CloudHub pool, so nobody can choose it. By default the subscription has twice its Production vCores. Note what can change it: deleting the app, moving from Sandbox to Production, redeploying to another region (preallocate first), or restarting into a newly built VPC.

**2. Shared load balancer.** It is available in all environments, but it has no custom certificates or proxy rules. It uses its own certificate, it supports only TLS 1.2, and it has lower rate limits applied per region. Exceeding them returns 429. So \`api.logi-example.com\`, the company certificate, client certificates and the peak volume all point to a **dedicated load balancer** in the VPC.

**3. Mapping rules.** Create a CNAME from the company domain to \`[lb-name].lb.anypointdns.net\`. On the SSL endpoint, add ordered rules such as:

| Input Path | Target App | Output Path | Protocol |
|---|---|---|---|
| \`/payments/\` | \`logi-payments-prod\` | \`/\` | https |
| \`/tracking/\` | \`logi-tracking-prod\` | \`/\` | http |
| \`/{app}/\` | \`logi-{app}-prod\` | \`/\` | http |

The first match wins, so specific rules come before the pattern. The DLB removes the matched input path and appends the rest to the output path.

**4. Encryption to the worker.** By default the DLB accepts HTTPS and calls the worker over HTTP on 8091. For an app listening on HTTPS inside the VPC, set the protocol to \`https\` (port 8092).
`,
  followUps: [
    { q: 'What happens if you define no mapping rules on a DLB?', a: 'The DLB creates and uses a default mapping rule, which you can change later. Mapping rules added through the CLI or API without a certificate name go to the default endpoint.' },
    { q: 'Does a DLB allowlist protect one certificate endpoint at a time?', a: 'No. The allowlist works for inbound connections at the load balancer level only, not at the CN certificate level. Its maximum is 240 entries with inbound HTTP mode Off and 120 with On or Redirect.' },
    { q: 'Why might a custom header disappear on its way to the app?', a: 'CloudHub load balancers use Nginx, which ignores header fields with invalid names. Only English letters, numbers, hyphens and underscores are valid, and this applies to both shared and dedicated load balancers.' },
  ],
}
