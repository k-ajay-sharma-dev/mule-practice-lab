export default {
  id: 'ar-019',
  category: 'architecture',
  title: 'Hybrid Connectivity to On-Prem Systems',
  level: 'ADVANCED',
  tags: ['hybrid', 'private-space', 'vpn', 'runtime-fabric'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each integration to where it runs.',
      pairs: [
        ['Mobile / Experience APIs', 'CloudHub 2.0 Private Space (in-country region)'],
        ['Patient 360 Process API combining Salesforce and the EHR', 'CloudHub 2.0 Private Space, calling the on-prem EHR System API'],
        ['EHR System API and HL7 MLLP listeners', 'Runtime Fabric on the on-prem Kubernetes'],
        ['Nightly imaging metadata files', 'Runtime Fabric on-prem, files stay local'],
      ],
      explain: 'Put on-prem only what must be there (residency, LAN latency, inbound from devices, large files) and run the rest on managed CloudHub 2.0.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Security forbids inbound internet connections to the data center. How does the Private Space reach on-prem?',
      options: [
        'Open port 443 on the data center firewall to the internet',
        'Private connectivity: IPsec VPN or a Transit Gateway attachment to the existing network hub, with no inbound internet exposure',
        'Through the shared CloudHub space public endpoint',
        'By copying the EHR database to the cloud',
      ],
      answer: 1,
      explain: 'Tunnels or transit attachments carry private traffic. The shared space cannot provide this private connectivity, which is why a Private Space is required.',
    },
    {
      type: 'multi',
      prompt: 'A CloudHub 2.0 Private Space, an isolated network for Mule apps, will connect to a data center over a VPN. Security forbids inbound connections from the internet to the data center. Which three should the network design include?',
      options: [
        'Non-overlapping CIDR ranges for the Private Space and the data center',
        'Firewall rules that let only the Private Space CIDR reach specific on-prem endpoints',
        'DNS settings so that Private Space apps can resolve internal hostnames',
        'Cloud apps that query the on-prem database directly, skipping the System API',
        'A public port on the data center firewall that the cloud apps can call',
      ],
      answer: [0, 1, 2],
      explain: 'CIDR overlaps are hard to fix later, so plan them early. The firewall allows only the Private Space CIDR, and internal DNS lets apps use names and not IPs. Tunnels are initiated from the cloud side, so nothing is exposed inbound from the internet. Cloud apps call the on-prem System API, never the database directly, and TLS (ideally mTLS) protects those calls.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'With runtimes on-prem, what does the Anypoint control plane receive?',
      options: [
        'All patient payloads processed by the apps',
        'Management data, metadata and metrics — payloads stay on-prem, but logs/metrics sent to it must be reviewed for patient data',
        'Nothing at all',
        'A full copy of the EHR database',
      ],
      answer: 1,
      explain: 'Control plane and runtime plane are separate. Still check the control plane region against the regulation, and keep logs that could contain patient data local.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What is the main operational cost of Runtime Fabric on-prem?',
      options: [
        'MuleSoft charges per log line',
        'The hospital team owns the cluster, capacity, OS/Kubernetes patching, HA across nodes and runtime upgrades',
        'Apps cannot be deployed from Runtime Manager',
        'API policies cannot be applied',
      ],
      answer: 1,
      explain: 'Control and locality come at the price of running infrastructure yourself, which is why the on-prem footprint is kept minimal.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The VPN goes down. What still works?',
      options: [
        'Nothing; every integration stops',
        'On-prem flows on RTF (HL7, nightly files) keep running; cloud APIs that need the EHR fail and should return clear errors',
        'Everything, because CloudHub caches the EHR',
        'Only the mobile app',
      ],
      answer: 1,
      explain: 'Design for it with redundant tunnels, tunnel monitoring, clear error responses and queued writes where possible.',
    },
  ],
  description: `
A hospital group is moving integrations to Anypoint Platform. Systems:

- **Cloud:** Salesforce Health Cloud, a SaaS appointment booking tool, mobile app.
- **On-prem data center:** the **EHR** (electronic health records) database and HL7 v2 feeds over MLLP, a lab system, Active Directory.
- **Regulation:** patient data must stay within the country; the security team does not allow any inbound connections from the internet to the data center and wants all traffic encrypted and auditable.
- Some flows are **latency-sensitive** (clinicians' lookups < 500 ms end to end); one flow moves **large imaging metadata files** nightly.
- The data center already has an **AWS Direct Connect**/VPN setup for other projects and runs a VMware/Kubernetes platform.

**Questions:**
- Which deployment model(s) do you use: CloudHub 2.0 in a Private Space with private connectivity, Runtime Fabric on-prem, standalone hybrid Mule runtimes — or a mix? Why?
- How does network connectivity work (VPN, transit gateway, firewall rules, DNS)?
- Where does each integration run, considering data residency and latency?
- What are the operational trade-offs of running runtimes on-prem?
`,
  answerTemplate: `## Deployment model(s)

## Network connectivity

## Placement of integrations

## Operational trade-offs
`,
  keyPoints: [
    'A mixed model is justified: CloudHub 2.0 Private Space (in an in-country region) for cloud-facing APIs, and Runtime Fabric (or hybrid runtimes) on-prem for flows that are latency-sensitive or must not leave the data center.',
    'Private Space connects to the data center through private connectivity (IPsec VPN or AWS Transit Gateway attachment to the existing network), initiated from known IP ranges, with no inbound internet exposure.',
    'Firewall rules allow only the Private Space CIDR to specific on-prem hosts/ports; internal DNS resolution of on-prem hostnames is configured for the Private Space.',
    'The control plane (Anypoint management, API Manager) is separate from the runtime plane; with on-prem runtimes, patient payloads stay on-prem and only metadata/metrics go to the control plane — residency of the control plane region must still be checked.',
    'On-prem runtimes (RTF/hybrid) shift responsibility for infrastructure, scaling, patching and HA to the customer team — the cost of control.',
  ],
  solution: `
**Deployment model — a mix.**
- **CloudHub 2.0 Private Space** in a region inside the country: Experience/Process APIs consumed by the mobile app, Salesforce and the booking SaaS. MuleSoft manages the runtime; you get isolation, private ingress, and custom network connectivity.
- **Runtime Fabric on the existing on-prem Kubernetes** (or standalone hybrid runtimes if there's no K8s skill): the **EHR System API**, HL7/MLLP listeners, the lab integration and the nightly imaging-file flow. Reasons: data stays inside the data center, latency to the EHR is LAN-level, HL7 MLLP listeners must be reachable by on-prem devices, and large files don't cross the WAN.

**Network connectivity.**
- Connect the Private Space to the data center with **IPsec VPN** or, since AWS connectivity already exists, a **Transit Gateway** attachment to the hospital's network hub. That hub reaches on-prem over Direct Connect/VPN. Tunnels are initiated from the cloud side; **nothing is exposed inbound from the internet**.
- Plan **non-overlapping CIDRs** (Private Space vs data center) early — overlaps are hard to fix later.
- **Firewall:** allow only the Private Space CIDR → specific on-prem endpoints (e.g. the RTF ingress for the EHR System API on 443). Cloud apps call the **on-prem System API**, not the EHR database directly.
- **DNS:** configure the Private Space to resolve internal hostnames (internal DNS servers) so apps use names, not IPs.
- **TLS end to end** (mTLS between cloud Process API and on-prem System API), logs of every call for audit.

**Placement.**
| Integration | Runs on | Why |
|---|---|---|
| Mobile/Experience APIs | CloudHub 2.0 PS | Internet-facing, managed scaling |
| Patient 360 Process API | CloudHub 2.0 PS | Combines Salesforce + EHR SAPI |
| EHR System API, HL7 MLLP | RTF on-prem | Residency, latency, inbound from devices |
| Imaging metadata nightly | RTF on-prem | Large files stay local |
Latency check: clinician lookup = cloud Process API + VPN round trip (~10–30 ms in-country) + EHR — feasible under 500 ms. If clinicians are on-prem, they can call an on-prem Experience API instead.

**Control plane.** Runtime Manager, API Manager and Monitoring live in the Anypoint control plane (e.g. the US or EU hosted control plane; Anypoint Platform Private Cloud Edition exists if even the control plane must be on-prem — check what the regulation requires). Payload data processed by on-prem runtimes stays on-prem; metrics/logs sent to the control plane must be reviewed (disable/forward logs locally if they could contain patient data).

**Operational trade-offs.** RTF/hybrid gives control and locality but the hospital team owns: Kubernetes cluster, capacity, OS/K8s patching, HA across nodes, backups, and runtime upgrades (with MuleSoft-supplied components). Keep the on-prem footprint **minimal** (only what must be there) and run the rest on CloudHub 2.0.
`,
  followUps: [
    { q: 'The VPN goes down. What still works?', a: 'On-prem flows on RTF keep running (HL7, nightly files), and cloud APIs that need the EHR fail. Design for it: redundant tunnels, clear error responses, queued writes where possible, and monitoring of tunnel status.' },
    { q: 'Why not deploy everything on RTF on-prem to keep it simple?', a: 'Then internet-facing APIs need inbound exposure of the data center (which security forbids) or a DMZ, and the team must run all capacity itself. Cloud-facing workloads are cheaper and safer on CloudHub 2.0.' },
    { q: 'How do you justify the cost of a Private Space versus the shared space?', a: 'The shared space cannot provide private connectivity to the data center or network isolation; the requirement for VPN/Transit Gateway and in-country isolation makes a Private Space necessary rather than optional.' },
  ],
}
