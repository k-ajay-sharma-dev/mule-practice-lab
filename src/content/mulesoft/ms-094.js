export default {
  id: 'ms-094',
  category: 'mulesoft',
  title: 'CloudHub 2.0 Private Spaces and Networking: CIDR Planning, VPN or Transit Gateway, Firewall Rules and Endpoints',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'private-space', 'networking', 'vpn', 'transit-gateway', 'deployment'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'To save addresses, the network team proposes a `/24` block for the production private space "and we can enlarge it next year". What is the correct response?',
      options: [
        'The CIDR block cannot be resized or changed after the private space is created, so size it for growth now',
        'Fine: the block can be extended from the private space Network tab',
        'Fine: CloudHub 2.0 adds a secondary customer block automatically when it fills up',
        'The block size has no effect on deployments, so any value works',
      ],
      answer: 0,
      explain: 'The block is fixed at creation. The docs recommend `/22` and warn that exceeding the sizing guidance can leave replicas unschedulable for lack of IP addresses.',
    },
    {
      type: 'match',
      prompt: 'Match each case to the addresses your network team should expect.',
      pairs: [
        ['A Mule app calls on-prem Oracle over the VPN', 'Source address from the private space CIDR block'],
        ['A Mule app calls a public SaaS API over the internet', 'Source address from the Outbound Static IPs'],
        ['On-prem DNS or allowlists for reaching the internal load balancer', 'Private DNS target static IPs, constant for the life of the space'],
      ],
      explain: 'Outbound Static IPs apply to traffic leaving to the internet. Traffic into a VPN or Transit Gateway originates from the private space CIDR, so that block must be allowed on the corporate firewall.',
    },
    {
      type: 'single',
      prompt: 'The data-centre firewall team has configured only tunnel 1 of the Anypoint VPN connection because "the second one is spare". What is the risk?',
      options: [
        'Routine maintenance can briefly disable one tunnel; failover to the other tunnel only helps if both are configured on your endpoint',
        'None, because MuleSoft keeps tunnel 1 up at all times',
        'The VPN cannot be created until both tunnels carry traffic at the same throughput',
        'The second tunnel is only for Transit Gateway traffic',
      ],
      answer: 0,
      explain: 'Each VPN connection has two tunnels and the docs say you must configure both, because the service is often upgraded and maintenance can take one down.',
    },
    {
      type: 'single',
      prompt: 'You add a second, redundant VPN connection to another gateway in a different building. How does failover between the two connections behave?',
      options: [
        'Automatic with dynamic (BGP) routing; with static routing you fail over manually by modifying routes',
        'Always automatic, whichever routing type you use',
        'Always manual, whichever routing type you use',
        'Failover needs a MuleSoft support case',
      ],
      answer: 0,
      explain: 'That difference is a good reason to prefer BGP. A redundant VPN also needs two gateway endpoints with different public IP addresses.',
    },
    {
      type: 'multi',
      prompt: 'The company already has an AWS Transit Gateway and Direct Connect to its data centre. Which statements about attaching the private space are correct?',
      options: [
        'The private space and the transit gateway must be in the same region',
        'Transit Gateway connections are highly available by design, so you do not create redundant ones',
        'Direct Connect cannot be attached to the private space itself; the supported route is a transit gateway attachment',
        'Network connections are subject to your entitlement, and CloudHub 1.0 and 2.0 share that quota',
        'Each private space needs its own transit gateway in a separate AWS account',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Direct Connect is shown as not supported for CloudHub 2.0, with Transit Gateway as the replacement. Entitlements count VPNs and attachments across both CloudHub versions.',
    },
    {
      type: 'single',
      prompt: 'A warehouse system must reach a Mule app over raw TCP, not HTTP. What do the docs allow?',
      options: [
        'A firewall rule for a port in the 30500-32500 range, reachable only from within the private space or through a VPN or Transit Gateway',
        'Any port above 1024, from anywhere',
        'Port 8081 from the internet, because that is where the listener runs',
        'Nothing: CloudHub 2.0 accepts HTTP and HTTPS only',
      ],
      answer: 0,
      explain: 'No non-HTTP ports are open by default. TCP ingress is limited to that fixed range and to private connections, and you must create the firewall rule.',
    },
    {
      type: 'single',
      prompt: 'Two internal DNS servers are configured for `corp.example.com`. Only one of them has a record for `sap-prd.corp.example.com`. What happens?',
      options: [
        'Lookups fail intermittently: the space can query either server, and an `NXDOMAIN` from one is a valid response that is not retried on the other',
        'The space tries the second server after any `NXDOMAIN`',
        'The first server in the list always answers, so the order decides',
        'DNS servers are checked at save time, so the configuration is rejected',
      ],
      answer: 0,
      explain: 'The private space queries any configured server, in any order, and all of them must present the same records.',
    },
  ],
  description: `
A grocery retailer is building its first production private space in Sydney. Mule apps must reach on-prem SAP and Oracle, and warehouse systems must call Mule apps without going over the internet. The network team asks for a design review before anything is created.

| Item | Current state |
|---|---|
| Corporate network | Uses most of \`10.0.0.0/8\`; \`10.42.0.0/16\` is free |
| AWS | Existing Transit Gateway in the same region, with Direct Connect to the data centre |
| Second site | A disaster-recovery data centre reachable only through its own VPN gateway |
| Internal DNS | Two DNS servers for \`corp.example.com\` |
| Volumes | 45 apps in 18 months, mostly 2 replicas each |
| Security | Public APIs are limited to a partner API. Security asks about WAF and DDoS protection |

**Questions**
1. Choose the CIDR block and explain what must be true of it.
2. VPN or Transit Gateway? Explain high availability for each.
3. Which source addresses will on-prem firewalls see? What should the private space allow in and out?
4. Which endpoints does each app get, and how do you keep an app private?
5. How do custom domains and paths work?
6. How do apps call each other within the space?
7. How do you prove connectivity? What should you not rely on?
`,
  answerTemplate: `## CIDR planning

## Connectivity and high availability

## Addresses and firewall rules

## Endpoints

## Custom domains and paths

## App-to-app calls

## Testing connectivity
`,
  keyPoints: [
    'The CIDR block is fixed at creation, must be private and must not overlap other private spaces or the corporate network. Allowed sizes run from /16 to /24 and /22 is recommended.',
    'Reserved corporate CIDRs stop the platform using ranges that collide with your network. 100.64.0.0/10 and other listed blocks cannot be used.',
    'Each VPN connection has two tunnels, and both must be configured. Redundant VPNs fail over automatically with BGP and manually with static routes.',
    'Transit Gateway must be in the same region as the space and is highly available by design. Direct Connect reaches CloudHub 2.0 through a transit gateway.',
    'Traffic into a VPN or Transit Gateway comes from the private space CIDR; traffic to the internet comes from the Outbound Static IPs.',
    'By default ports 80 and 443 are open inbound and all traffic is allowed outbound. Non-HTTP TCP is limited to ports 30500-32500 over private connections. There is no built-in WAF or Layer 7 DDoS protection.',
    'Every app gets an external endpoint you can delete and an internal endpoint you cannot; internal endpoints work only from the private network, VPN or Transit Gateway.',
    'Ping is not a supported test. Use the Network Tools application.',
  ],
  solution: `
**CIDR planning.** Use \`10.42.0.0/22\`, the size the docs recommend. The block must come from private address space, must not overlap other private spaces or corporate ranges, and cannot be changed later. Allowed sizes are \`/16\` to \`/24\`. Sizing depends on the number of apps, replica sizes and counts, rolling deployments, auto-upgrades and platform headroom. If you exceed the guidance, deployments can fail with replicas unschedulable for lack of IP addresses. Also list corporate ranges as **reserved CIDRs**, so that platform infrastructure avoids them.

**Connectivity.**
- **Transit Gateway** for the data centre: it reuses the existing gateway and Direct Connect. It must be in the same region as the private space and is highly available by design, so do not create a redundant one.
- **Anypoint VPN** for the second site: each connection has two tunnels to one public IP address, and both must be configured. For gateway redundancy, create a second connection to another gateway with a different public IP address. Use **BGP** so failover is automatic; with static routes you must change routes by hand.
- Keep the route table small: the private spaces page allows a limited number of route table entries per space, so consolidate networks first.

**Addresses and firewall rules.**
- Inbound on-prem rules: allow the private space CIDR, because traffic into a VPN or Transit Gateway originates from it. A pod-network CIDR that is not allowlisted is a listed cause of "traffic reaches the firewall but gets no response".
- Partners that allowlist you: give them the **Outbound Static IPs**, which do not change during the life of the space.
- Private space firewall: a new space opens 443 and 80 inbound from anywhere and allows all outbound. Tighten these, but keep outbound 443 for Anypoint MQ, API Manager and Object Store v2. If you remove the default route and send \`0.0.0.0/0\` through a transit gateway, your firewall must allow the hostnames for the control plane's image registry, or deployments fail with \`ErrImagePull\` or \`ImagePullBackOff\`. The Networking page says this also applies to a VPN, but the VPN page lists advertising a default route as unsupported, so confirm before designing it over a VPN.
- WAF and Layer 7 DDoS protection are **not** included, so implement them externally for the partner API.

**Endpoints.** Each app gets two by default:
| Endpoint | Reachable from | Can you remove it? |
|---|---|---|
| External | Clients outside the network | Yes, delete it to prevent external traffic |
| Internal | The private network, VPN or Transit Gateway | No |

Default DNS names are \`<app>.<space-id>.<region>.cloudhub.io\` and \`<app>.internal-<space-id>.<region>.cloudhub.io\`. The internal load balancer accepts traffic on port 443. The app itself must listen on \`0.0.0.0\` and \`$\{http.port}\`, a value MuleSoft allocates, so clients never use the listener port directly.

**Custom domains and paths.** Upload a certificate in a TLS context; CloudHub 2.0 reads the CN and SAN list and offers those domains in the app's **Ingress** tab. Create a CNAME to \`<space-id>.<region>.cloudhub.io\` for public use or \`internal-<space-id>.<region>.cloudhub.io\` for internal use. **Path** is what clients request, and **Path Rewrite** is the base path the HTTP Listener expects, so \`/api\` can map to \`/v1/api\`. By default the load balancer forwards to the app over HTTP; **Last-Mile Security** enables HTTPS to the app, and the app must then listen on HTTPS.

**App-to-app calls.** Use the internal DNS name to keep traffic inside the private space. The cluster-local name (\`http://helloch2:8081/hello\`) also works in the same environment, but it is not highly available: it does not pass through the ingress load balancer, so it can fail during disaster recovery. It does not work across namespaces.

**Testing.** Use the **Network Tools** application. A failed ICMP ping proves nothing, because it is not a supported test. Check VPN tunnel status in the **Connections** section, and check route tables on both sides.
`,
  followUps: [
    {
      q: 'Can one private space serve production and non-production?',
      a: 'It can be associated with several environments, but you can create multiple private spaces in one region, which gives separate isolated networks for production and non-production. By default a private space is associated with the sandbox environments of its business groups.',
    },
    {
      q: 'What are the rules for internal DNS domains?',
      a: 'Apps must call backends by FQDN. MuleSoft and public domains such as cloudhub.io, amazonaws.com, com and local cannot be configured, including their subdomains. Create a CNAME on your own DNS to a permitted domain as a workaround.',
    },
    {
      q: 'Can you accept plain HTTP on a private space?',
      a: 'The Advanced tab offers Redirect to HTTPS, Accept HTTP or Drop HTTP, and Drop HTTP drops requests silently. You cannot accept only insecure HTTP. Shared spaces do not accept port 80.',
    },
    {
      q: 'Can you restrict egress per app rather than for the whole space?',
      a: 'Yes, the docs describe application-level egress rules. Check that page before designing them, because it lists what must stay reachable, such as Anypoint MQ, Object Store v2 and API Manager.',
    },
  ],
}
