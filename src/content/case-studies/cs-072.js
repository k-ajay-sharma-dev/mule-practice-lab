import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-072',
  category: 'case-studies',
  title: 'Automaker Running Recall and Software Update Campaigns Across 3,000 Dealers',
  level: 'ADVANCED',
  tags: ['automotive', 'partners', 'api-management', 'batch', 'events', 'notifications', 'compliance', 'crm'],
  estMinutes: 55,
  diagram: {
    task: 'draw the campaign design: a VIN expansion job that reads the campaign from the quality system and the affected vehicles from the vehicle registry, writes open campaigns to a campaign store and publishes one event per affected VIN; owner notifications and over-the-air updates acting on that event; and dealers checking a VIN through the gateway against the campaign store.',
    checks: [
      { label: 'Every dealer system enters through the API gateway', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'A dealer VIN check reaches the campaign store', rule: { type: 'path', from: 'partner', to: 'database', via: 'api-gateway' } },
      { label: 'A dealer VIN check never reaches the quality system or the vehicle registry', rule: { type: 'no-path', from: 'partner', to: ['legacy', 'oracle-db'] } },
      { label: 'A batch job expands the campaign into VINs from the vehicle registry', rule: { type: 'path', from: 'batch-job', to: 'oracle-db', via: 'system-api' } },
      { label: 'Affected VINs are published as events', rule: { type: 'edge', from: 'batch-job', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'The VIN event feeds at least two Process APIs (owners and over-the-air)', rule: { type: 'each', of: ['topic', 'event-stream'], edgeTo: 'process-api', kind: 'async', count: 2 } },
      { label: 'Owners are notified by a Process API acting on the event', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'notification', via: { type: 'process-api', label: ['owner', 'notif'] } } },
      { label: 'Owner contact details come from the CRM through a System API', rule: { type: 'only-via', target: 'crm', from: 'system-api' } },
      { label: 'The campaign store is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Software campaigns reach the over-the-air platform', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'external-api', via: { type: 'process-api', label: ['ota', 'over-the-air', 'software'] } } },
    ],
    reference: diagram(
      {
        dealer: ['partner', 'Dealer DMS (3,000 dealers)'],
        gw: ['api-gateway', 'API Manager (dealer client IDs)'],
        edl: ['experience-api', 'exp-dealer-campaigns-api'],
        pvin: ['process-api', 'prc-vin-campaign-status'],
        job: ['batch-job', 'Campaign VIN expansion (chunks of 10,000)'],
        squal: ['system-api', 'sys-quality-api'],
        qual: ['legacy', 'Quality and recall system'],
        sveh: ['system-api', 'sys-vehicle-registry-api'],
        veh: ['oracle-db', 'Vehicle registry (built VINs)'],
        scamp: ['system-api', 'sys-campaign-store-api'],
        cdb: ['database', 'Open campaigns by VIN'],
        top: ['topic', 'campaign-vin-assigned'],
        pown: ['process-api', 'prc-owner-notifications'],
        pota: ['process-api', 'prc-ota-campaigns'],
        scrm: ['system-api', 'sys-owner-crm-api'],
        crm: ['crm', 'Salesforce (owners)'],
        nt: ['notification', 'Email, SMS and letter provider'],
        ota: ['external-api', 'Over-the-air update platform'],
      },
      [
        'dealer -> gw', 'gw -> edl', 'edl -> pvin', 'pvin -> scamp', 'scamp -> cdb', 'job -> squal', 'squal -> qual', 'job -> sveh',
        'sveh -> veh', 'job -> scamp', 'job ~> top', 'top ~> pown', 'top ~> pota', 'pown -> scrm', 'scrm -> crm', 'pown -> nt', 'pota -> ota',
      ],
    ),
  },
  description: `
**Context.** A car maker sells in 28 countries through 3,000 dealers. It runs about 60 safety recalls and service campaigns a year, and since its new models went connected, also software update campaigns that can be done over the air (OTA).

**One recent campaign.** A brake hose recall covered 2.1 million vehicles built over 4 years. It took 3 weeks to send owner letters, and dealers kept missing open recalls when cars came in for a service, because the dealer systems had a monthly campaign file.

**Systems**
| System | Notes |
|---|---|
| Quality and recall system | On-premises, Java and Oracle; engineers define the campaign and the build criteria (model, plant, build dates, part numbers) |
| Vehicle registry | Oracle database of every built VIN with its options, about 14 million rows |
| Salesforce | Owners and their contact preferences; registration data from regional authorities |
| Dealer DMS | Each dealer's management system (CDK, Keyloop and 4 others); they want to check a VIN when a car arrives |
| OTA platform | Vendor service; accepts a list of VINs and a software package ID |
| Notification provider | Email, SMS and printed letters |

**Goals**
- Owners notified within 48 hours of a campaign launch (by law, within 60 days in most markets).
- A dealer gets the open campaigns for a VIN in under 1 second at service check-in.
- OTA-capable vehicles get the software campaign without a dealer visit.
- Completion data for the quarterly regulator report.

**Constraints**
- The quality system and the vehicle registry must not take dealer traffic (about 40,000 VIN checks a day, 30 per second peak).
- Owner contact data must stay in Salesforce in the owner's region.

**Your task.** Design the campaign integration.
`,
  answerTemplate: `## Launching a campaign: finding the VINs

## The campaign store and the dealer VIN check

## Owner notifications

## Over-the-air campaigns

## Completion tracking and regulator reporting
`,
  keyPoints: [
    'A VIN expansion job reads the campaign criteria from the quality system and the matching VINs from the vehicle registry in chunks, through System APIs.',
    'The job writes open campaigns per VIN to a campaign store and publishes one event per affected VIN.',
    'Dealer VIN checks go through API Manager and an Experience API that reads only the campaign store, so the source systems take no dealer traffic.',
    'An owner notifications Process API reads contact preferences from the regional CRM through a System API at send time; an OTA Process API sends OTA-capable VINs to the OTA platform.',
    'Remedy completions from dealers and the OTA platform close the campaign per VIN, and the store feeds the regulator report.',
  ],
  solution: `
**Launch.** When engineers release a campaign, a job:
1. reads the criteria through \`sys-quality-api\`
2. reads matching VINs through \`sys-vehicle-registry-api\` in chunks of 10,000, using a watermark so a restart resumes where it stopped
3. writes open campaigns to the campaign store through \`sys-campaign-store-api\`
4. publishes \`campaign-vin-assigned\` for each VIN

2.1 million VINs take about 2 hours.

**Dealer VIN check.** Dealer DMS systems call \`exp-dealer-campaigns-api\` behind API Manager (a client ID per DMS vendor and dealer, rate limits). \`prc-vin-campaign-status\` reads the campaign store; responses take under 200 ms. The quality system and registry are never on this path. A dealer marks the remedy done through the same API.

**Owners.** \`prc-owner-notifications\` consumes the VIN events, looks up the current owner and channel through \`sys-owner-crm-api\` in the owner's region, and sends through the provider. It sends at a steady rate to respect provider limits, and records each send for the regulator.

**OTA.** \`prc-ota-campaigns\` keeps only OTA-capable VINs, batches them and sends them to the OTA platform. Completion callbacks close the campaign for that VIN.

**Reporting.** The campaign store holds launch, notification and completion dates per VIN. A quarterly job builds the regulator report from it.
`,
  followUps: [
    { q: 'Why not let dealers query the vehicle registry directly?', a: 'Dealer traffic would load a core Oracle database and expose more data than needed. A campaign store sized for reads answers fast and keeps the registry private.' },
    { q: 'How do you make the VIN expansion restartable?', a: 'Read in chunks with a watermark and write each chunk with VIN plus campaign as the key. A restart resumes from the last chunk and repeats nothing harmful.' },
    { q: 'Why look up the owner at send time instead of copying owners into the event?', a: 'Owners change and contact data must stay in its region. Looking it up at send time uses the current owner and keeps personal data out of the event.' },
    { q: 'How do you avoid a dealer repairing a car that was already fixed over the air?', a: 'The OTA completion closes the campaign in the store. The dealer VIN check then shows it as done.' },
  ],
}
