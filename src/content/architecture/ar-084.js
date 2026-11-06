import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-084',
  category: 'architecture',
  title: 'CloudHub 2.0 Private Space Connected to On-Premises Systems',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'private-space', 'hybrid', 'vpn', 'api-led', 'deployment', 'healthcare'],
  estMinutes: 45,
  diagram: {
    task: 'draw a CloudHub 2.0 private space design in which partners and the patient portal come in through the public ingress, on-premises staff apps come in through the internal ingress, and the hospital systems in the data centre are reached only through System APIs.',
    checks: [
      { label: 'The portal and the laboratories enter through the public ingress', rule: { type: 'each', of: ['web-app', 'partner'], min: 2, edgeTo: { type: 'load-balancer', label: ['public', 'external'] } } },
      { label: 'A separate internal ingress exists for on-premises clients', rule: { type: 'node', match: 'load-balancer', min: 2 } },
      { label: 'Ward apps use the internal ingress, not a direct call to an API', rule: { type: 'each', of: 'internal-app', edgeTo: { type: 'load-balancer', label: 'internal' } } },
      { label: 'Ingress routes to Experience or Process APIs', rule: { type: 'edge', from: 'load-balancer', to: ['experience-api', 'process-api'], min: 2 } },
      { label: 'The Oracle patient database is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'The mainframe is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Lab results are handed off asynchronously through a queue', rule: { type: 'edge', from: ['process-api', 'experience-api'], to: ['queue', 'topic'], kind: 'async' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Ward apps never touch the public ingress', rule: { type: 'no-edge', from: 'internal-app', to: { type: 'load-balancer', label: ['public', 'external'] } } },
      { label: 'The public ingress routes to every Experience API', rule: { type: 'each', of: 'experience-api', edgeFrom: { type: 'load-balancer', label: ['public', 'external'] } } },
      { label: 'The internal ingress routes to an API', rule: { type: 'edge', from: { type: 'load-balancer', label: 'internal' }, to: ['experience-api', 'process-api'] } },
      { label: 'Every Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', min: 2, edgeTo: ['oracle-db', 'legacy', 'database'] } },
      { label: 'Lab results reach the mainframe through the queue', rule: { type: 'path', from: 'partner', to: 'legacy', via: ['queue', 'topic'] } },
      { label: 'No chain of sync calls joins the lab API to the mainframe, so the nightly batch loses nothing', rule: { type: 'no-path', from: { type: ['experience-api', 'process-api'], label: ['lab', 'result', 'partner'] }, to: 'legacy', kind: 'sync' } },
      { label: 'The portal reads patient records over sync calls, through a System API', rule: { type: 'path', from: 'web-app', to: 'oracle-db', via: 'system-api', kind: 'sync' } },
      { label: 'Load balancers forward live requests, so their lines are sync calls', rule: { type: 'lines', touching: 'load-balancer', kind: 'sync' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['experience-api', 'process-api'], to: ['process-api', 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['oracle-db', 'database', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Patient portal'],
        labs: ['partner', 'Partner laboratories'],
        ward: ['internal-app', 'Ward desktop app (on-prem, via VPN)'],
        pub: ['load-balancer', 'Private space ingress: public endpoints'],
        int: ['load-balancer', 'Private space ingress: internal endpoints (443)'],
        idp: ['identity-provider', 'Hospital identity provider'],
        expPortal: ['experience-api', 'exp-patient-portal'],
        expLabs: ['experience-api', 'exp-lab-partners'],
        prcAppt: ['process-api', 'prc-patient-records'],
        prcResults: ['process-api', 'prc-lab-results'],
        q: ['queue', 'lab.results'],
        dlq: ['dlq', 'lab.results.dlq'],
        sysPat: ['system-api', 'sys-patients-oracle (via VPN)'],
        sysBill: ['system-api', 'sys-billing-mainframe (via VPN)'],
        ora: ['oracle-db', 'Patient administration (data centre)'],
        mf: ['legacy', 'Billing mainframe (data centre)'],
        os: ['cache', 'Object Store v2'],
        mon: ['monitoring', 'Anypoint Monitoring'],
      },
      [
        'portal -> pub', 'labs -> pub', 'ward -> int', 'pub -> expPortal', 'pub -> expLabs', 'int -> prcAppt',
        'expPortal -> idp', 'expPortal -> prcAppt', 'expLabs -> prcResults', 'prcResults ~> q', 'q ~> dlq',
        'q ~> prcAppt', 'prcAppt -> sysPat', 'prcAppt -> sysBill', 'prcAppt -> os', 'sysPat -> ora', 'sysBill -> mf', 'prcAppt -> mon',
      ],
    ),
  },
  description: `
A regional hospital group is moving its integrations to CloudHub 2.0. The patient administration system (Oracle) and a billing mainframe stay in its data centre. Other systems are SaaS. Volumes: about 200,000 API calls per day, peaks at clinic opening time, and 30,000 lab results per day from partner laboratories.

Constraints:
- The **patient portal** and **partner laboratories** connect over the internet.
- **Ward desktop apps** run on-prem and must not use the internet to reach Mule.
- The data centre allows only a named network range through its firewall. The security team must approve every open port.
- One data centre, with two internet gateways. There is no AWS footprint, so no transit gateway exists.
- The billing mainframe closes for a nightly batch, so lab results must not be lost while it is down.
- Production and test must be isolated from each other.

**Questions:**
- Draw the target architecture.
- How is the private space connected to the data centre, and how does that connection stay available?
- How do external and on-premises clients reach apps?
- What does the firewall team need to allow, in each direction?
- Where does state live, and what happens during a replica restart?
`,
  answerTemplate: `## Target architecture

## Connectivity to the data centre

## Client access and endpoints

## Firewall and addressing

## State and resilience
`,
  keyPoints: [
    'A private space gives an isolated network with its own CIDR, connected to the data centre by Anypoint VPN or a transit gateway. With no AWS footprint, VPN is the natural choice.',
    'Use both tunnels on each VPN connection, and a redundant connection through the second gateway with BGP so failover is automatic.',
    'Public clients use external endpoints; ward apps use internal endpoints through the VPN on port 443.',
    'Traffic into the VPN comes from the private space CIDR, so that range goes on the data-centre firewall. Choose a block that does not overlap the corporate network.',
    'Oracle and the mainframe are reached only through System APIs; internal DNS lets those APIs use on-prem FQDNs.',
    'Lab results go through a queue, so they survive the mainframe batch window, with a DLQ for repeated failures.',
    'State lives in Object Store v2 or a database, because replica storage is cleared on restart.',
    'Use separate private spaces for production and non-production.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Patient portal ─┐
 Partner labs   ─┴─► Public ingress ─► exp-patient-portal ─► prc-patient-records ─► sys-patients-oracle ──VPN──► Oracle
                                       exp-lab-partners ─► prc-lab-results ─~► lab.results ─~► prc-patient-records
 Ward app (on-prem) ──VPN──► Internal ingress (443) ─► prc-patient-records ─► sys-billing-mainframe ──VPN──► Mainframe
\`\`\`
The catalogue has no "private space" component: the two ingress nodes and everything from the API layers down run inside it, apart from the data-centre systems. The VPN is shown as a label on the System APIs.

**Connectivity.**
- Create separate private spaces for production and non-production, in the same region if you wish; each one is an isolated network.
- Choose a CIDR block that is private, does not overlap corporate ranges and is sized for growth. It cannot be changed later, and the docs recommend \`/22\`.
- Use **Anypoint VPN**. Each connection has two tunnels, and you must configure both, because maintenance can take one down. To survive a gateway failure, create a second connection to the other gateway with a different public IP address. Use **BGP**, so failover between connections is automatic.
- Configure the internal DNS servers so System APIs can use on-prem FQDNs. All servers must return the same records.

**Client access.**
- Portal and laboratories use external endpoints, with custom domains from a TLS context. The private space has no built-in WAF or Layer 7 DDoS protection, so add one in front if the security team requires it.
- Ward apps call internal endpoints over the VPN, on port 443. For stable URLs, use a custom domain with a CNAME to \`internal-<space-id>.<region>.cloudhub.io\`.
- For apps that need no public access, such as \`prc-patient-records\`, delete the external endpoint. The internal endpoint stays.
- Apps call each other using internal DNS names, so traffic stays in the private network.

**Firewall and addressing.**
| Direction | What to allow |
|---|---|
| Mule to data centre | On the corporate firewall: the private space CIDR, because traffic into the VPN originates from it, to the Oracle and mainframe ports |
| Ward apps to Mule | Corporate firewall: outbound to the internal load balancer on 443. The private DNS target IPs stay constant for the life of the space |
| Internet to Mule | Private space inbound rules for 443; drop or redirect HTTP in the Advanced tab |
| Mule outbound | Keep 443 for Anypoint MQ, API Manager and Object Store v2; tighten the rest |

**State and resilience.**
- Run at least two replicas per app for availability across zones.
- Local disk is cleared on restart, so keep state in Object Store v2, Anypoint MQ or the database.
- \`prc-lab-results\` publishes to \`lab.results\` and the consumer retries. When the mainframe is closed, messages wait; repeated failures go to \`lab.results.dlq\`.
- Design for routine restarts: patching, rebalancing and, in private spaces, weekly node consolidation.
`,
  followUps: [
    { q: 'What would change if the group later adopted AWS with Direct Connect?', a: 'Use a transit gateway attachment. It must be in the same region as the private space and is highly available by design, so no redundant attachment is needed. Direct Connect is not attached to the private space itself.' },
    { q: 'Why not expose the ward app traffic through the public endpoint with an IP allowlist?', a: 'It would send internal clinical traffic over the internet for no benefit. Internal endpoints are reachable only from the private network, VPN or Transit Gateway.' },
    { q: 'How do you test the VPN path?', a: 'Use the Network Tools application from inside the private space, not ping, and then test a real transaction from each consumer network.' },
  ],
}
