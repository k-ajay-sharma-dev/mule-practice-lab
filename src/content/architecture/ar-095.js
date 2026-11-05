import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-095',
  category: 'architecture',
  title: 'Running CloudHub 1.0 and 2.0 Side by Side: A Phased Migration Behind One Vanity Domain',
  level: 'ADVANCED',
  tags: ['cloudhub', 'cloudhub-2', 'deployment', 'migration', 'dlb', 'ingress', 'api-led'],
  estMinutes: 45,
  diagram: {
    task: 'draw the coexistence state in the middle of the migration: clients keep calling the existing DLB domain, the DLB serves one Experience API still on CloudHub 1.0 and forwards to private space ingress for a migrated one, the migrated Process API calls a CloudHub 1.0 System API back through the DLB, and backends are reached only through System APIs.',
    checks: [
      { label: 'Partners and web clients still enter through the dedicated load balancer', rule: { type: 'each', of: ['partner', 'web-app'], edgeTo: { type: 'load-balancer', label: ['dlb', 'dedicated'] } } },
      { label: 'There are two load balancing layers: the DLB and private space ingress', rule: { type: 'node', match: 'load-balancer', min: 2 } },
      { label: 'The DLB forwards migrated traffic to private space ingress', rule: { type: 'edge', from: { type: 'load-balancer', label: ['dlb', 'dedicated'] }, to: { type: 'load-balancer', label: ['ingress', 'private space', 'cloudhub 2'] } } },
      { label: 'Ingress reaches a migrated Experience API', rule: { type: 'edge', from: { type: 'load-balancer', label: ['ingress', 'private space', 'cloudhub 2'] }, to: 'experience-api' } },
      { label: 'The DLB still serves an Experience API that has not moved', rule: { type: 'edge', from: { type: 'load-balancer', label: ['dlb', 'dedicated'] }, to: 'experience-api' } },
      { label: 'The migrated Process API calls back through the DLB to reach CloudHub 1.0', rule: { type: 'edge', from: 'process-api', to: { type: 'load-balancer', label: ['dlb', 'dedicated'] } } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Clients never call a System API directly', rule: { type: 'no-edge', from: ['partner', 'web-app'], to: 'system-api' } },
    ],
    reference: diagram(
      {
        p1: ['partner', 'Partner systems (mTLS)'],
        web: ['web-app', 'Customer web portal'],
        dlb: ['load-balancer', 'DLB on api.example.com (CloudHub 1.0 VPC)'],
        ing: ['load-balancer', 'Private space ingress (CloudHub 2.0)'],
        e1: ['experience-api', 'exp-partner-orders (migrated, CloudHub 2.0)'],
        e2: ['experience-api', 'exp-portal (still CloudHub 1.0)'],
        pr: ['process-api', 'prc-orders (migrated, CloudHub 2.0)'],
        s1: ['system-api', 'sys-sap-orders (still CloudHub 1.0)'],
        s2: ['system-api', 'sys-customers (migrated, CloudHub 2.0)'],
        erp: ['erp', 'SAP (on-premises)'],
        db: ['database', 'Customer database (on-premises)'],
        mon: ['monitoring', 'Log platform and wave dashboards'],
      },
      [
        'p1 -> dlb', 'web -> dlb', 'dlb -> e2', 'dlb -> ing', 'ing -> e1', 'ing -> pr', 'e1 -> pr', 'e2 -> ing',
        'pr -> dlb', 'dlb -> s1', 'pr -> s2', 's1 -> erp', 's2 -> db', 'e1 -> mon',
      ],
    ),
  },
  description: `
An energy supplier runs 48 applications on **CloudHub 1.0** in one Anypoint VPC. It must move to **CloudHub 2.0** in four waves over eight months, because the business will not accept a single cutover.

Current setup:
- A DLB on \`api.example.com\` in front of the applications.
- Partner mTLS and 30 mapping rules.
- A Transit Gateway to SAP and a customer database on premises.

Constraints:
- Clients and partners must not change URLs or certificates.
- In every wave, some layers have moved and some have not, so calls run in both directions between the platforms.
- SAP allowlists source IPs, and the SAP team needs two weeks of notice for each firewall change.
- The team chose a manually created private space, to test it ahead of the first wave.

**Questions:**
- Draw the mid-migration state, with one migrated and one remaining Experience API.
- How do calls between the platforms work in each direction?
- What happens to DLB features as apps move?
- How does on-premises connectivity work during the waves?
- How do you order the waves, and when can the DLB and VPC be decommissioned?
`,
  answerTemplate: `## Mid-migration architecture

## Calls between platforms

## DLB features during the waves

## On-premises connectivity

## Wave order and decommissioning
`,
  keyPoints: [
    'Clients keep the same domain; the DLB switches traffic for vanity domains when the default CloudHub endpoint is removed.',
    'HTTPS through the DLB needs Last-Mile Security on the 2.0 app and upstream TLS 1.2 or higher on the DLB.',
    'CloudHub 2.0 apps keep the same URLs to 1.0 apps, but the DLB allowlist must include the infrastructure CIDR ranges.',
    'CloudHub 1.0 apps need an ingress firewall rule for the VPC CIDR on the private space, and a valid TLS context.',
    'A manually created private space has its own CIDR and needs a new Transit Gateway attachment alongside the existing one.',
    'Outbound static IPs are per private space; keep old and new in SAP allowlists until decommissioning.',
    'Mapping rules become per-app Ingress settings, and mTLS moves to TLS contexts at the private space.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Partners, portal ─► DLB (api.example.com) ─► exp-portal (1.0) ─► private space ingress
                       │        ▲                                      │
                       ▼        └── prc-orders (2.0) ◄─ exp-partner-orders (2.0) ◄─┘
                     sys-sap-orders (1.0) ─► SAP       prc-orders ─► sys-customers (2.0) ─► Customer DB
\`\`\`

**Calls between platforms.**
- **CloudHub 2.0 to 1.0**: the target URL stays the same. CloudHub 2.0 uses a separate infrastructure CIDR pool, so add \`100.64.0.0/16\`, \`100.66.0.0/16\`, \`100.67.0.0/16\` and \`100.68.0.0/16\` to the DLB allowlist.
- **CloudHub 1.0 to 2.0**: add ingress firewall rules for the VPC CIDR on the private space, and confirm that the app has a valid TLS context for HTTPS. Ask the network team whether this traffic crosses the public internet or can use internal routing.

**DLB features.** For each app that moves, turn mapping rules into path and path rewrite on the Ingress tab. Set up mTLS in a TLS context and truststore, with Forward SSL Session where the app needs client certificate details. Use custom TLS contexts for cipher suites. To switch at the DLB, remove the default endpoint from the CloudHub 1.0 app, so that the switch does not happen at the shared load balancer. Vanity domains must match on both platforms. The application upgrade tool works only in private spaces upgraded from a VPC, so with a manually created private space, confirm with MuleSoft how the switch applies before you plan on it.

**On-premises connectivity.** The private space has a different CIDR block and inherits no Transit Gateway connections, so you run both attachments during the migration. Add the private space outbound IPs to the SAP allowlist ahead of each wave, and keep the old ones.

**Waves.** Build the private space and connectivity first, then move apps with few dependencies, and leave heavily shared APIs until their consumers are ready. Keep each CloudHub 1.0 app STARTED until the app link is established. Decommission the DLB and VPC only when no app, partner or allowlist depends on them.
`,
  followUps: [
    { q: 'Why not use the VPC upgrade path instead?', a: 'It transfers Transit Gateway connections automatically and needs no new attachment. However, it drops firewall rules outside ports 80, 443 and 30500 to 32500, and the VPC is locked for infrastructure changes afterwards, so plan those changes first.' },
    { q: 'Can a new app in an upgraded private space share the vanity domain?', a: 'A new CloudHub 2.0 app in an upgraded private space with the same domain cannot be reached by CloudHub 1.0 apps through it. The documented workaround is to deploy it to CloudHub 1.0 first and then migrate it.' },
    { q: 'Could the partner traffic bypass the DLB early?', a: 'Only by changing where the domain points, and that is a client-facing cutover. Keep the DLB as the single entry until the last app behind it has moved, so that each wave stays reversible.' },
  ],
}
