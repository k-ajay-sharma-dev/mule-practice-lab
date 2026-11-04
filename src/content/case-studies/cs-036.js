import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-036',
  category: 'case-studies',
  title: 'Agritech Company Feeding Farm Sensor Data to Crop Trading',
  level: 'INTERMEDIATE',
  tags: ['agriculture', 'iot', 'batch', 'data-pipeline', 'partners'],
  estMinutes: 35,
  diagram: {
    task: 'draw where Mule fits: raw sensor data staying in the IoT/data platforms, a nightly forecast import, a consent-checking Process API, the buyer API behind API Manager, and one queued adapter per FMS product.',
    checks: [
      { label: 'Sensors feed the IoT platform directly — raw telemetry does not flow through Mule', rule: { type: 'edge', from: 'device', to: ['saas', 'data-warehouse', 'event-stream'] } },
      { label: 'No sensor talks to the API layers', rule: { type: 'no-edge', from: 'device', to: ['api-gateway', 'experience-api', 'process-api', 'system-api'] } },
      { label: 'A scheduled job imports the nightly forecast output through a System API', rule: { type: 'path', from: 'batch-job', to: 'data-warehouse', via: 'system-api' } },
      { label: 'Outbound flows check a central consent service', rule: { type: 'edge', from: 'process-api', to: { type: ['system-api', 'database', 'cache'], label: ['consent'] } } },
      { label: 'Buyers reach the forecast Experience API through API Manager', rule: { type: 'path', from: 'partner', to: 'experience-api', via: 'api-gateway' } },
      { label: 'Each FMS vendor has its own queue to isolate outages and rate limits', rule: { type: 'edge', from: 'process-api', to: 'queue', kind: 'async', min: 2 } },
      { label: 'FMS products are reached only through per-vendor System APIs', rule: { type: 'only-via', target: { type: 'saas', label: ['fms', 'farm management', 'farm-management'] }, from: 'system-api' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        sensors: ['device', 'Farm sensors'],
        buyer: ['partner', 'Grain buyers / trading desk'],
        gw: ['api-gateway', 'API Manager (client ID, OAuth, per-buyer limits)'],
        beapi: ['experience-api', 'exp-buyer-forecast-api'],
        prc: ['process-api', 'prc-forecast-api'],
        job: ['batch-job', 'Nightly forecast import (watermark)'],
        qa: ['queue', 'fms-a-deliveries'],
        qb: ['queue', 'fms-b-deliveries'],
        sfc: ['system-api', 'sys-forecast-api'],
        scon: ['system-api', 'sys-consent-api'],
        sfa: ['system-api', 'sys-fms-a-api'],
        sfb: ['system-api', 'sys-fms-b-api'],
        iot: ['saas', 'IoT cloud platform'],
        dsp: ['data-warehouse', 'Data-science platform (forecasts)'],
        con: ['database', 'Consent grants'],
        fa: ['saas', 'FMS A'],
        fb: ['saas', 'FMS B'],
      },
      [
        'sensors -> iot', 'job -> sfc', 'sfc -> dsp', 'job -> prc', 'prc -> scon', 'scon -> con', 'prc ~> qa', 'prc ~> qb',
        'qa ~> sfa', 'qb ~> sfb', 'sfa -> fa', 'sfb -> fb', 'buyer -> gw', 'gw -> beapi', 'beapi -> prc',
      ],
    ),
  },
  description: `
**Context.** An agritech company supplies soil-moisture, weather and yield sensors to 3,000 farms. Readings go to an IoT cloud platform (vendor-managed). The company now offers a service where farms can share aggregated yield forecasts with grain buyers and a commodity trading desk, who use them to pre-contract harvests. Farms also want forecasts in their farm-management software (FMS) — four popular FMS products, each with its own API.

**Goals**
- Daily yield forecasts per field shared with authorised buyers/trading desk.
- Push field data into each farm's chosen FMS.
- Farms control who sees their data and can withdraw consent at any time.

**Constraints**
- Rural connectivity: sensors upload in bursts, sometimes days late.
- The forecast model runs in a data-science platform (batch, nightly).
- Buyers must not see individual farm identities unless the farm opts in.
- Raw readings: ~50 million/day; buyers need aggregates, not raw data.

**Your task.** Propose what Mule should and should not do in this pipeline, the API products for buyers and FMS vendors, and how consent is enforced.
`,
  answerTemplate: `## Where Mule fits (and where it does not)

## Data flow from sensors to forecasts

## Buyer / trading desk API

## FMS integrations

## Consent and anonymisation

## Risks
`,
  keyPoints: [
    'High-volume raw telemetry stays in the IoT/data platform; Mule integrates at the edges (forecast outputs, partner APIs, FMS connections), not every sensor reading.',
    'Late-arriving data is handled by the data platform recalculating forecasts; APIs expose a version/as-of timestamp.',
    'Buyer APIs expose aggregated, anonymised forecasts by region/crop unless the farm has opted in to share identity.',
    'A consent service is the single source of truth checked by every outbound flow; withdrawal stops future sharing immediately.',
    'One adapter (System API) per FMS behind a common contract, with per-farm OAuth tokens managed securely.',
  ],
  solution: `
**Where Mule fits.** 50M readings/day is a data-pipeline job: ingestion stays in the IoT platform and the data-science platform. Mule handles (1) importing farm/field master data, (2) reading the nightly forecast output, (3) serving partner APIs, and (4) pushing to FMS products. Saying this explicitly is part of a good answer.

**Flow.**
1. Nightly, the forecast job writes results (per field, crop, expected yield, confidence, as-of date) to a data store/object storage.
2. \`forecast-sapi\` reads new results (batch job with watermark).
3. \`forecast-papi\` joins with \`consent-sapi\` and farm master data, then produces (a) per-farm outputs for FMS and (b) aggregated outputs for buyers.

**Buyer API.** \`buyer-forecast-eapi\`: \`GET /forecasts?crop=wheat&region=...\` returning aggregates (minimum number of farms per aggregate to prevent re-identification). Opted-in farms appear individually in \`GET /offers\`. Client ID + OAuth, per-buyer rate limits and contracts managed in API Manager; usage reported per buyer.

**FMS.** \`fms-<vendor>-sapi\` per product behind a common internal contract. Farms connect their FMS via OAuth consent; refresh tokens are stored encrypted. A queue per FMS vendor isolates outages and rate limits.

**Consent.** \`consent-sapi\` stores per-farm, per-purpose grants (share with FMS, share aggregated, share identified with buyer X). Every outbound flow checks it at send time (cached with a short TTL); withdrawal events invalidate the cache immediately. Consent changes are audited.

**Late data.** Forecasts are versioned by as-of date; when late readings change a forecast, a new version is published and consumers see the newest.

**Risks.** Re-identification from small aggregates (minimum group size), wrong consent decisions (central service, tests per purpose), FMS API changes (per-vendor adapters), and treating Mule as a big-data tool (scope it clearly).
`,
  followUps: [
    { q: 'Why not stream all sensor readings through Mule for flexibility?', a: 'It adds cost and a scaling bottleneck without value; the IoT and data platforms are built for that volume. Mule adds value where systems and partners need to be connected and governed.' },
    { q: 'How do you stop a buyer identifying a farm from aggregates?', a: 'Enforce a minimum number of farms per aggregate and suppress or merge small groups, and avoid exposing fine-grained location or rare crops in aggregated views.' },
    { q: 'What happens when a farm withdraws consent after data was already shared?', a: 'Future sharing stops immediately; already-shared data is covered by the buyer contract terms (e.g. deletion obligations), which the business and legal teams define.' },
  ],
}
