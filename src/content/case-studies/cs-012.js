import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-012',
  category: 'case-studies',
  title: 'Utility Ingesting Smart-Meter Readings',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'utilities', 'high-volume', 'batch', 'streaming', 'iot'],
  estMinutes: 35,
  diagram: {
    task: 'draw the smart-meter data flow: the bulk file path into MDM, the separate real-time alarm path to the outage system, the portal usage path, and the bulk route to analytics that does not go through Mule.',
    checks: [
      { label: 'A batch job picks up the HES reading files from file/object storage', rule: { type: 'edge', from: 'batch-job', to: 'file-store' } },
      { label: 'The batch job loads readings through an MDM System API', rule: { type: 'edge', from: 'batch-job', to: 'system-api' } },
      { label: 'MDM is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'database', 'erp', 'legacy'], label: ['mdm', 'meter data'] }, from: 'system-api' } },
      { label: 'Alarms are published as asynchronous events, separate from the bulk files', rule: { type: 'edge', to: ['event-stream', 'topic', 'queue'], kind: 'async' } },
      { label: 'Alarm events reach the outage system through an events Process API', rule: { type: 'path', from: ['event-stream', 'topic', 'queue'], to: { type: ['legacy', 'saas', 'external-api', 'database'], label: ['outage', 'oms'] }, via: 'process-api' } },
      { label: 'Raw readings go to analytics on a bulk path (file drop / stream), not through Mule APIs', rule: { type: 'edge', from: ['file-store', 'event-stream'], to: 'data-warehouse' } },
      { label: 'The portal reads usage through an API backed by a cache / read store', rule: { type: 'path', from: 'web-app', to: ['cache', 'database'] } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Customer portal'],
        eport: ['experience-api', 'portal-usage-eapi', { vCores: '1' }],
        ingest: ['batch-job', 'meter-file-ingest (streaming batch)'],
        pev: ['process-api', 'meter-events-papi'],
        alarms: ['event-stream', 'meter-alarms'],
        smdm: ['system-api', 'mdm-sapi'],
        susage: ['system-api', 'usage-sapi', { vCores: '1' }],
        soms: ['system-api', 'outage-sapi'],
        hes: ['legacy', 'Head-end system (HES)'],
        files: ['file-store', 'HES files (SFTP / object storage)'],
        mdm: ['saas', 'MDM (validation, estimation)'],
        ucache: ['cache', 'Usage read store / cache'],
        oms: ['legacy', 'Outage management system'],
        dw: ['data-warehouse', 'Analytics platform / data lake'],
      },
      [
        'portal -> eport', 'eport -> susage', 'susage -> ucache', 'susage -> mdm',
        'ingest -> files', 'ingest -> smdm', 'smdm -> mdm',
        'hes ~> alarms', 'alarms ~> pev', 'pev -> soms', 'soms -> oms',
        'files -> dw',
      ],
    ),
    simulation: {
      systems: [
        { match: 'saas', latencyMs: 150, maxRps: 50 },
        { match: { type: 'legacy', label: 'outage' }, latencyMs: 100, maxRps: 50 },
      ],
      cache: { hitRatio: 0.9 },
      tests: [
        {
          name: 'Evening portal peak',
          about: 'Customers check their usage 300 times a second in the evening, and MDM takes 50 requests a second. The read store answers 9 in 10, and the portal APIs have the capacity for the rest.',
          traffic: [{ name: 'usage reads', from: 'web-app', rps: 300, to: 'saas' }],
          expect: { answers: [{ minSuccess: 0.99 }], peakRps: [{ node: 'saas', max: 50 }] },
        },
        {
          name: 'A storm of outage alarms',
          about: 'A storm sends 150 meter alarms a second for 5 minutes, and the outage system takes 50 a second. The event stream holds the alarms, the outage system is never pushed over its limit, and none is lost.',
          traffic: [{ name: 'alarms', from: { type: 'legacy', label: 'head-end' }, rps: 5, to: { type: 'legacy', label: 'outage' }, kind: 'write', spikes: [{ at: 2, forMin: 5, rps: 150 }] }],
          durationMin: 40,
          expect: { peakRps: [{ node: { type: 'legacy', label: 'outage' }, max: 50 }], delivered: [{ to: { type: 'legacy', label: 'outage' }, min: 0.99 }], lost: { max: 0 }, backlog: [{ queue: 'event-stream', maxEnd: 0 }] },
        },
      ],
    },
  },
  description: `
**Context.** An electricity and gas utility is rolling out 2 million smart meters. A head-end system (HES) collects readings every 30 minutes and makes them available in two ways:
- large files (every 30 minutes)
- a REST API for on-demand reads

Readings must reach the meter data management system (MDM) for validation and estimation, then:
- billing
- a customer portal ("your usage today")
- an analytics platform

**Goals**
- All readings delivered to MDM within 1 hour of collection.
- Customers see usage in the portal the same day.
- Network events (power outage, tamper alerts) reach the outage system within a minute.

**Constraints**
- ~96 million readings per day; files of several hundred MB.
- Meters occasionally send late or duplicate readings.
- Some customers have opted out of fine-grained data use for analytics.
- The portal gets about 300 usage reads a second in the evening and MDM takes 50 a second. A storm can send 150 alarms a second for 5 minutes, and the outage system takes 50 a second.
- Assume a usage read store or cache answers 9 in 10 portal reads. Give the portal Experience API and the usage System API 1 vCore each for the evening peak.

**Your task.** Propose how MuleSoft fits into this data flow, including what you would *not* put through Mule.
`,
  answerTemplate: `## Overall data flow

## Bulk reading ingestion

## Real-time alarms and events

## Data quality (late, duplicate, missing reads)

## Consent and data use

## What not to route through Mule
`,
  keyPoints: [
    'Separates bulk interval readings (file/batch path) from real-time alarm events (event path) with different designs.',
    'Large files are streamed and processed in chunks (e.g. Batch Job with streaming/deferred reading, or partitioned files), never loaded fully into memory.',
    'Duplicate and late readings are handled with a natural key (meter ID + interval timestamp) and upserts, not by assuming files are clean.',
    'High-volume raw data to analytics is moved by a bulk/streaming platform or direct file transfer; Mule orchestrates, monitors and handles the lower-volume business integrations.',
    'Alarm events are routed in near real time via a queue/topic to the outage system with priority over bulk loads.',
    'Consent/opt-out flags are applied before data is sent to analytics, and data is minimised per consumer.',
  ],
  solution: `
**Flow.** HES → (files every 30 min) → MDM (validation, estimation) → billing, portal, analytics. Alarms: HES → event stream → outage management system.

**Bulk ingestion.** A Mule app picks up each file (SFTP/File connector or object storage) and **streams** it with repeatable file-store streams. It validates structure and loads it into MDM in chunks (Batch Job with a tuned block size, or MDM's bulk import API if it has one). Often the best option is letting Mule trigger and monitor MDM's native bulk loader. Track every file: received, rows, rejected, loaded. Split large files or use several workers/replicas to process files in parallel.

**Portal usage.** The portal reads from MDM or a read-optimised usage store via a \`usage-sapi\` with caching; it does not query raw files.

**Analytics.** Raw readings go to the analytics platform via a bulk path (direct file drop to the data lake or a streaming platform such as Kafka); Mule may move pointers/metadata and enforce the opt-out filter, but should not be the pipe for ~100 million records a day if a cheaper bulk path exists.

**Alarms.** The HES pushes alarms to an API or topic; \`meter-events-papi\` filters, enriches (meter → address/feeder) and publishes to the outage system within seconds. Runs on separate capacity so bulk loads never delay it.

**Data quality.** Key = meter ID + interval start. Upserts make duplicates harmless; late reads trigger re-validation in MDM. Daily completeness report: expected vs received reads per meter.

**Risks.** Memory/throughput limits (load-test with real file sizes), cost of vCores if Mule carries raw volume, and privacy breaches from fine-grained data (consent filter + minimisation).
`,
  followUps: [
    { q: 'How would you size the Mule side?', a: 'Load-test with production-sized files and measure throughput per replica/worker; size for the busiest 30-minute window plus catch-up after an outage, not the daily average.' },
    { q: 'What if a file is half-processed when the app crashes?', a: 'Track progress per file and make loads idempotent by key, so reprocessing the whole file is safe; move the file to an archive folder only after success.' },
    { q: 'Why not stream everything through Anypoint MQ?', a: 'Message-per-reading at ~100 million per day is costly and unnecessary; bulk files or a streaming platform suit raw telemetry better, while MQ fits lower-volume business events like alarms.' },
  ],
}
