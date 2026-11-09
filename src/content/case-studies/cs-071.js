import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-071',
  category: 'case-studies',
  title: 'Fulfilment Centre Connecting an Autonomous Mobile Robot Fleet to Its WMS',
  level: 'ADVANCED',
  tags: ['supply-chain', 'wms', 'iot', 'kafka', 'event-driven', 'high-volume', 'edge', 'e-commerce'],
  estMinutes: 55,
  diagram: {
    task: 'draw the robot integration: released pick tasks leaving the WMS through a System API onto a queue, a dispatch Process API sending them to the fleet manager through a System API, fleet events flowing into an on-site Kafka stream, and three consumers of that stream: a task-status Process API that updates the WMS, a feed to the data lake and an alerts Process API.',
    checks: [
      { label: 'Released pick tasks reach the fleet manager through a queue', rule: { type: 'path', from: 'wms', to: 'external-api', via: 'queue' } },
      { label: 'The fleet manager is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Fleet events go into an event stream', rule: { type: 'edge', from: 'external-api', to: 'event-stream', kind: 'async' } },
      { label: 'The robot event stream feeds at least three consumers', rule: { type: 'each', of: 'event-stream', edgeTo: ['process-api', 'data-warehouse', 'batch-job', 'queue'], count: 3 } },
      { label: 'Robot events reach the WMS only through the task-status Process API', rule: { type: 'no-path', from: 'event-stream', to: 'wms', unless: { type: 'process-api', label: ['status', 'task-complet'] } } },
      { label: 'The task-status Process API updates the WMS', rule: { type: 'path', from: { type: 'process-api', label: ['status', 'task-complet'] }, to: 'wms', via: 'system-api' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'Telemetry goes from the stream to the data lake', rule: { type: 'edge', from: 'event-stream', to: 'data-warehouse', kind: 'async' } },
      { label: 'Every line into or out of the event stream is an async message', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
      { label: 'Tasks the fleet manager rejects go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq' } },
    ],
    reference: diagram(
      {
        wms: ['wms', 'Manhattan WMS'],
        swms: ['system-api', 'sys-wms-api'],
        tq: ['queue', 'pick-tasks'],
        dlq: ['dlq', 'pick-tasks DLQ'],
        pt: ['process-api', 'prc-robot-task-dispatch'],
        sfl: ['system-api', 'sys-fleet-manager-api'],
        fm: ['external-api', 'AMR fleet manager (on site)'],
        es: ['event-stream', 'robot-events (Kafka, on site)'],
        ps: ['process-api', 'prc-task-status'],
        pa: ['process-api', 'prc-robot-alerts'],
        dl: ['data-warehouse', 'Operations data lake'],
        nt: ['notification', 'Floor supervisor alerts'],
      },
      [
        'wms -> swms', 'swms ~> tq', 'tq ~> pt', 'tq ~> dlq', 'pt -> sfl', 'sfl -> fm', 'fm ~> es', 'es ~> ps', 'ps -> swms', 'swms -> wms',
        'es ~> dl', 'es ~> pa', 'pa -> nt',
      ],
    ),
  },
  description: `
**Context.** An online retailer's largest fulfilment centre (FC) is adding 220 autonomous mobile robots (AMRs). The robots bring totes to pickers, so pickers stop walking the aisles. The robot vendor supplies a fleet manager server that runs on site and plans robot routes.

**The interfaces**
| System | Interface |
|---|---|
| Manhattan WMS (on site, shared by 3 FCs) | Releases pick waves; can call a REST endpoint per released task; accepts task completion updates through its API (about 200 calls per second) |
| AMR fleet manager | REST API to create, cancel and reprioritise tasks; publishes every robot event to an on-site Kafka cluster |
| Operations data lake (cloud) | Wants all robot telemetry for productivity and battery analysis |

**Event volumes from the fleet manager**
- Robot position and battery telemetry: about 3,000 events per second
- Task events (assigned, at location, tote picked, task done, task failed): about 40 per second, 120 at peak
- Robot faults (blocked, low battery, e-stop): a few per hour

**Constraints**
- Picking must continue if the internet link fails; the WMS and the fleet manager are both on site.
- The WMS must receive only task results, not telemetry. Last year a different vendor's telemetry flooded the WMS API and stopped all three FCs for 40 minutes.
- Floor supervisors must know about a blocked robot within 30 seconds.
- In peak season the FC ships 180,000 orders a day.

**Your task.** Design the integration between the WMS, the robot fleet and the data lake.
`,
  answerTemplate: `## Runtimes and where things run

## Sending pick tasks to the robots

## Robot events: one stream, several consumers

## Protecting the WMS

## Alerts, analytics and failure modes
`,
  keyPoints: [
    'Run the Mule apps on site (Runtime Fabric or on-premises runtimes) so picking works without the internet link.',
    'The WMS releases tasks to a System API that queues them; a dispatch Process API sends them to the fleet manager through its System API at a controlled rate.',
    'All fleet events land in the on-site Kafka stream; consumers pick what they need instead of one flow handling everything.',
    'Only the task-status Process API writes to the WMS, filtering to task results (about 40 per second) and limiting its rate, so telemetry can never flood the WMS.',
    'Telemetry goes to the data lake in batches; robot faults go to an alerts Process API that notifies supervisors within seconds.',
  ],
  solution: `
**Runtimes.** A Runtime Fabric cluster in the FC hosts all Mule apps; the control plane stays in the cloud. The internet link is only needed for the data lake feed, which can catch up later because Kafka keeps 3 days of events.

**Tasks out.** The WMS calls \`sys-wms-api\` for each released task. The System API puts it on \`pick-tasks\`. \`prc-robot-task-dispatch\` maps it to the fleet manager task format and calls \`sys-fleet-manager-api\`. Tasks the fleet manager rejects (unknown location, tote locked) go to the DLQ and back to the WMS as exceptions.

**Events in.** The fleet manager publishes all events to \`robot-events\` on the on-site Kafka cluster. Three consumer groups read it:
- \`prc-task-status\` keeps only task events, de-duplicates by event ID and updates the WMS through \`sys-wms-api\`, capped at 150 calls per second.
- A Kafka Connect sink (or a Mule batch consumer) sends telemetry to the data lake in compressed batches every minute.
- \`prc-robot-alerts\` keeps only fault events and pushes them to supervisor handhelds.

**Protecting the WMS.** Nothing but \`prc-task-status\` can write to the WMS, and \`sys-wms-api\` has a rate limit policy shared by all three FCs. Telemetry never has a route to the WMS.

**Failure modes.** If the fleet manager is down, tasks wait on the queue and the WMS falls back to manual picking. If the WMS is slow, task events wait in Kafka and are applied in order per task.
`,
  followUps: [
    { q: 'Why put the robot events on Kafka instead of calling the WMS from the fleet manager?', a: 'There are 3,000 events per second and the WMS only needs 40. Kafka lets each consumer read what it needs at its own pace, and the WMS gets only task results.' },
    { q: 'How do you make sure telemetry can never flood the WMS again?', a: 'Only the task-status Process API has a route to the WMS. It filters to task events and a rate limit on the WMS System API caps the calls.' },
    { q: 'What happens to picking if the internet link fails?', a: 'The WMS, the fleet manager, Kafka and the Mule apps all run on site, so picking continues. Only the data lake feed waits and catches up later.' },
    { q: 'How do you keep task updates in the right order?', a: 'Key the Kafka events by task ID so each task stays in one partition. The consumer applies them in that order.' },
  ],
}
