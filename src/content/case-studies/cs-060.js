import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-060',
  category: 'case-studies',
  title: 'Seat Supplier Integrating Just-in-Sequence Calls With Car Plants',
  level: 'ADVANCED',
  tags: ['supply-chain', 'automotive', 'jit', 'jis', 'edifact', 'activemq', 'jms', 'oracle', 'sap'],
  estMinutes: 55,
  diagram: {
    task: 'draw the JIS integration at the supplier plant: OEM sequence calls arriving over AS2 into an Experience API, queued in order for a sequencing Process API that feeds the MES and keeps sequence state in Oracle, build-complete events triggering despatch, ASNs back to the OEM, and a gap-monitoring job raising alerts.',
    checks: [
      { label: 'OEM sequence calls arrive through an Experience API (AS2/EDI)', rule: { type: 'edge', from: 'partner', to: 'experience-api' } },
      { label: 'Calls are queued in order before sequencing', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'One sequencing Process API feeds the MES', rule: { type: 'path', from: 'queue', to: 'legacy', via: { type: 'process-api', label: ['sequenc', 'jis', 'call'] } } },
      { label: 'The MES is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Sequence state lives in Oracle behind a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Build-complete events from the line trigger despatch asynchronously', rule: { type: 'edge', to: { type: ['queue', 'topic'], label: ['build', 'complete', 'produced', 'finished'] }, kind: 'async' } },
      { label: 'A despatch Process API sends the ASN (DESADV) back to the OEM', rule: { type: 'path', from: { type: 'process-api', label: ['despatch', 'dispatch', 'ship', 'asn'] }, to: 'external-api' } },
      { label: 'A monitoring job detects sequence gaps and raises alerts', rule: { type: 'path', from: 'batch-job', to: 'notification' } },
    ],
    reference: diagram(
      {
        oem: ['partner', 'OEM plants (DELJIT sequence calls)'],
        eas2: ['experience-api', 'exp-oem-as2-inbound'],
        seq: ['process-api', 'prc-jis-sequencing'],
        desp: ['process-api', 'prc-despatch-asn'],
        mon: ['batch-job', 'Sequence gap & heartbeat monitor'],
        cq: ['queue', 'jis-calls (exclusive consumer)'],
        bq: ['queue', 'build-complete'],
        dlq: ['dlq', 'jis-calls DLQ'],
        smes: ['system-api', 'sys-mes-api'],
        sdb: ['system-api', 'sys-sequence-db-api'],
        ssap: ['system-api', 'sys-sap-delivery-api'],
        soem: ['system-api', 'sys-oem-as2-outbound'],
        mes: ['legacy', 'Line MES'],
        ora: ['database', 'Oracle sequence store'],
        sap: ['erp', 'SAP S/4HANA'],
        oemep: ['external-api', 'OEM AS2 endpoint'],
        notif: ['notification', 'Line supervisor & on-call alerts'],
      },
      [
        'oem -> eas2', 'eas2 ~> cq', 'cq ~> seq', 'cq ~> dlq', 'seq -> sdb', 'sdb -> ora', 'seq -> smes', 'smes -> mes',
        'smes ~> bq', 'bq ~> desp', 'desp -> sdb', 'desp -> ssap', 'ssap -> sap', 'desp -> soem', 'soem -> oemep',
        'mon -> sdb', 'mon -> notif',
      ],
    ),
  },
  description: `
**Context.** A tier-1 supplier builds car seats in a plant 20 km from two OEM assembly plants. Seats are delivered just-in-sequence (JIS): the OEM sends a sequence call for each car as it enters final assembly (EDIFACT DELJIT over AS2), and the supplier has about four hours to build the exact seat variant and deliver it in a rack in the same order as the cars on the line. Today a 15-year-old custom program on a single Windows server receives the calls and writes them into the MES database. When it stopped for 40 minutes last year, the supplier had to pay for line-stoppage time at the OEM.

**Goals**
- Receive, acknowledge and pass calls to the line within 1 minute, with no lost or out-of-order calls.
- Send ship notices (DESADV) per rack and invoices to the OEM automatically.
- Detect missing or duplicate sequence numbers immediately.
- Survive the loss of a server without stopping the line.

**Constraints**
| Item | Detail |
|---|---|
| OEM | Defines the message guidelines and AS2 setup; calls every ~60 seconds per line, 24/6 |
| MES | On-premises; accepts work orders through a vendor API on the local network |
| Oracle | Sequence and rack data held in an on-premises Oracle database |
| SAP | Deliveries and invoices posted in SAP S/4HANA |
| Network | Plant WAN to the cloud is a single link; the line must keep running if it fails |
| Messaging | ActiveMQ Artemis is the company standard for plant messaging |

**Your task.** Propose the architecture, deployment model, ordering and resilience approach, and how you test it.
`,
  answerTemplate: `## Message flow (call → build → rack → despatch → invoice)

## Ordering and duplicate handling

## Deployment and resilience (where runtimes and brokers run)

## Monitoring and alerting

## Testing with the OEM

## Cut-over from the legacy program
`,
  keyPoints: [
    'Run runtimes and the broker in the plant (on-premises or Runtime Fabric on local infrastructure), clustered/HA, because the line cannot depend on the WAN.',
    'Calls go onto a queue consumed in order (single active consumer, e.g. Artemis exclusive queue or message groups per line); sequence numbers are checked and gaps or duplicates raise immediate alerts.',
    'A sequencing Process API keeps sequence state in Oracle through a System API and creates MES work orders through the MES System API.',
    'Build-complete events drive despatch: rack build, SAP delivery, DESADV to the OEM, then invoicing.',
    'A heartbeat/gap monitor, a tested failover procedure and a manual fallback (print sequence from the OEM portal) protect against line stoppage.',
  ],
  solution: `
**Phases**
1. **Design and OEM onboarding (months 1–2).** Agree message guidelines, AS2 certificates and test plan with both OEMs; model the sequence call, rack and DESADV.
2. **Plant platform (months 2–4).** Two-node runtime cluster (or Runtime Fabric on plant servers) and an Artemis HA pair (primary/backup with replication or shared store) in the plant data room. Control plane in the cloud; the plant keeps running if the WAN is down.
3. **Inbound flow (months 3–5).** \`exp-oem-as2-inbound\` receives DELJIT, returns the MDN, validates the EDIFACT and publishes each call to \`jis-calls\`. \`prc-jis-sequencing\` consumes with a single active consumer per line (Artemis exclusive queue or JMS message groups keyed by line), so calls are processed strictly in order; it checks the OEM sequence number against the last value in Oracle (via \`sys-sequence-db-api\`, using a stored procedure that locks the line row), stores the call and creates the MES work order through \`sys-mes-api\`. Duplicates are acknowledged and ignored; gaps raise an alert.
4. **Despatch (months 5–6).** MES build-complete → \`build-complete\` queue → \`prc-despatch-asn\` assigns seats to racks, posts the delivery in SAP via \`sys-sap-delivery-api\` and sends DESADV through \`sys-oem-as2-outbound\`; invoicing follows from SAP.
5. **Cut-over (month 7).** Parallel run with the legacy program in shadow mode (both receive calls, only legacy feeds MES), compare outputs for two weeks, switch over on a weekend non-production day, with legacy kept warm for rollback.

**Resilience.** Failover tests of runtime and broker nodes during planned downtime; MANUAL ack or transacted listeners so a call is acknowledged only after Oracle and MES succeed; the \`jis-calls\` DLQ is monitored with immediate paging, because a stuck call blocks the sequence.

**Governance.** OEM-specific guideline versions tracked; change freeze rules aligned with OEM production calendars.

**Risks.** A poison call blocking an ordered queue (alert within a minute, runbook to fix and replay, never silently skip), clock or sequence resets at the OEM (agreed reset procedure), WAN loss affecting AS2 if the OEM link is internet-based (dual links or OEM-provided network), and MES API latency at shift start.
`,
  followUps: [
    { q: 'Why not run this on CloudHub?', a: 'The line must not depend on the WAN link, and the MES and Oracle are local. Running runtimes and the broker in the plant keeps the critical path local; the cloud control plane is only needed for management.' },
    { q: 'How do you keep strict ordering and still have high availability?', a: 'Use one active consumer per line (exclusive queue or message groups) with a standby node that takes over on failure, plus sequence checks in Oracle so a failover cannot reorder or duplicate calls.' },
    { q: 'What do you do with a call that fails validation?', a: 'Stop and alert immediately rather than skip it, because the rack must match the line. Operators fix or obtain the call from the OEM portal and replay it; the sequence check ensures it lands in the right place.' },
  ],
}
