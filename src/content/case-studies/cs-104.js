export default {
  id: 'cs-104',
  category: 'case-studies',
  title: 'Hospital Replacing Its Interface Engine Without Disrupting Clinical Feeds',
  level: 'INTERMEDIATE',
  tags: ['healthcare', 'hl7', 'mllp', 'migration', 'testing', 'governance', 'observability'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The hospital wants to move 180 interfaces off the old interface engine before its support ends in 18 months. Which approach carries the least clinical risk?',
      options: [
        'Rebuild all 180 interfaces in Mule, test them together and cut over on one weekend',
        'Move waves by receiving system, low-risk feeds first, each with a parallel run and rollback',
        'Move the lab results feeds first, since they carry the most clinical value',
        'Move one interface at a time in the order the old engine lists them',
      ],
      answer: 1,
      explain: 'Waves by receiving system let one vendor test and go live at a time. Starting with low-risk feeds builds the patterns and the team\'s confidence before results, orders and medication feeds move, and each wave can roll back. A weekend cut-over of 180 feeds has no safe rollback. Lab results first puts the riskiest feed on an untried platform. Moving one interface at a time in list order makes each receiving vendor test many times and will not finish in 18 months.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'How do you prove a migrated interface produces the same output as the old one? (choose all that apply)',
      options: [
        'Run old and new in parallel on the same inbound messages and compare the outbound messages field by field',
        'Replay a sample of archived production messages, including unusual ones (merges, cancellations, long notes), through the new interface',
        'Check that the new interface deploys without errors',
        'Agree with the receiving department which differences are acceptable (for example timestamp precision) and record the sign-off',
        'Compare message counts per day only',
      ],
      answer: [0, 1, 3],
      explain: 'Field-by-field comparison on real traffic and on replayed edge cases shows the mappings match. A recorded sign-off on known differences is part of the clinical safety case. Deploying cleanly or matching counts proves nothing about content.',
    },
    {
      type: 'single',
      prompt: 'During parallel running, both engines receive the EHR feed. How should the new interface handle its output so the receiving system is not affected?',
      options: [
        'Send to the live receiving system too, and let it drop duplicates by message id',
        'Write output to a comparison store; only the old engine sends to the live system',
        'Send a sample of messages to the live system so the department can check them',
        'Hold its output in a queue and deliver all of it to the receiver at cut-over',
      ],
      answer: 1,
      explain: 'Only one engine may deliver to a live clinical system, or patients could get duplicate orders or results. The new interface writes its output where it can be compared (or to a test instance of the receiver), then takes over at cut-over. Few clinical systems drop duplicates reliably, a live sample still creates duplicates, and replaying a held queue at cut-over would resend messages the old engine already delivered.',
    },
    {
      type: 'order',
      prompt: 'Put the cut-over steps for one wave in a sensible order.',
      items: [
        'Agree a low-activity cut-over window with the clinical and vendor contacts',
        'Pause the old engine\'s outbound connection and let its queue drain',
        'Start the new interface\'s outbound connection to the receiving system',
        'Check the first messages end to end with the department',
        'Watch error rates and queue depth for the agreed hypercare period',
        'Remove the interface from the old engine after the rollback period ends',
      ],
      explain: 'Draining the old engine first prevents both engines sending at once. Live checks with the department and a hypercare period come before the old interface is deleted, so rollback stays possible.',
    },
    {
      type: 'match',
      prompt: 'Match each finding from the old engine to the best decision.',
      pairs: [
        ['The same ADT mapping copied into 22 interfaces', 'One canonical ADT event with a subscriber per receiver'],
        ['Custom Java filters nobody understands', 'Rebuild from observed inputs and outputs, with tests'],
        ['14 interfaces with no traffic in a year', 'Confirm with owners and retire them'],
        ['Hand-written HL7 parsing in scripts', 'Use the HL7 connector and schemas'],
      ],
      explain: 'A migration is a chance to remove copies, retire dead interfaces and replace fragile code. Rebuilding from observed behaviour avoids reproducing logic that cannot be explained.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Clinical safety staff ask how the team will know a feed has silently stopped after cut-over. What is the best answer?',
      options: [
        'Alerts on errors and exceptions raised by each Mule application',
        'Alerts when an interface\'s message rate falls below its normal rate for that hour',
        'A daily report of message counts per interface, reviewed each morning',
        'Health checks that confirm each MLLP listener port is open',
      ],
      answer: 1,
      explain: 'A silent stop raises no error, so alerts must watch for missing traffic as well as failures. Rates compared with the usual pattern for that hour catch a stopped feed within minutes; add alerts on negative ACKs and queue depth too. Error alerts miss a feed that stops sending, a daily report finds it a day late, and an open port says nothing about whether messages flow.',
    },
  ],
  description: `
**Context.** A 1,100-bed teaching hospital runs about 180 interfaces on an interface engine bought 14 years ago. The engine connects the EHR with the lab, radiology, pharmacy, theatres, cardiology, patient billing and national services. Most traffic is HL7 v2 over MLLP; some is files and SOAP. The vendor ends support in 18 months.

**The situation.**
- Three engineers know the engine. One retires in a year.
- Many interfaces were copied from each other; nobody knows which are still used.
- Several include custom scripts that change messages in ways no document describes.
- The hospital has chosen MuleSoft on Runtime Fabric in its own data centre, with Anypoint MQ not allowed for patient data, so it uses a local broker.

**Goals**
- Every needed interface runs on MuleSoft before support ends.
- No clinical incident caused by the migration.
- Fewer, clearer interfaces at the end, with monitoring the clinical safety team trusts.

**Constraints**
| Item | Detail |
|---|---|
| Volume | About 1.5 million messages a day; the lab results feed peaks at 120 a second |
| Clinical safety | Each change to a clinical interface needs a hazard assessment and sign-off by the clinical safety officer |
| Vendors | Receiving systems belong to 25 vendors; some need weeks to arrange a test window |
| Change freeze | No changes to clinical systems during winter pressure weeks (about 8 weeks a year) |

**Your task.** Answer the questions about migration strategy, testing, cut-over and monitoring.
`,
  answerTemplate: `## Inventory and what to retire

## Wave plan

## Proving equivalence

## Cut-over and rollback

## Monitoring after cut-over

## Clinical safety and people
`,
  keyPoints: [
    'Start with an inventory: traffic per interface, owner, receiving system and risk; retire what is unused.',
    'Move in waves grouped by receiving system, low risk first, avoiding the winter change freeze, each wave with a rollback.',
    'Prove equivalence with parallel running and replayed production messages, compared field by field, with signed-off differences.',
    'Only one engine delivers to a live system at a time; the new one writes to a comparison store until cut-over.',
    'Monitor for missing traffic as well as errors, so a silently stopped feed is noticed in minutes.',
    'Capture the retiring engineer\'s knowledge early, by pairing and by recording observed behaviour as tests.',
  ],
  solution: `
**Inventory (months 1 to 2).** Export the engine configuration and 30 days of traffic statistics. Record per interface: source, receivers, message types, volume, owner, custom code and clinical risk. Expect 10% to have no traffic; confirm and retire them.

**Patterns (months 2 to 4).** Build the shared pieces once: an MLLP listener System API per source, canonical ADT and results events on the local broker, a subscriber Process API per receiver, archive and replay, and monitoring. Copied mappings become one canonical event.

**Waves (months 4 to 16).** Group by receiving system and order by risk: billing and reporting feeds first, then theatres and cardiology, then pharmacy, radiology and lab. Plan around the winter freeze. Each wave: build, replay archived messages, parallel run for two weeks into a comparison store, hazard assessment and sign-off, cut-over in a quiet window, hypercare, then remove from the old engine after the rollback period.

**Monitoring.** Per interface: messages per 15 minutes against the usual rate for that time and day, negative ACKs, queue depth and age of the oldest message. Alerts go to the integration on-call and, for clinical feeds, to the clinical safety on-call.

**People.** Pair the retiring engineer with the Mule team on the hardest interfaces first. Every behaviour observed in parallel runs is captured as an MUnit test, so knowledge stays after people leave.
`,
  followUps: [
    { q: 'Why group waves by receiving system rather than by message type?', a: 'Each receiving vendor then tests and goes live once. Grouping by message type would make the same vendor take part in many waves.' },
    { q: 'How do you migrate a custom script nobody can explain?', a: 'Capture its inputs and outputs from real traffic and rebuild the behaviour from them. Write the observed cases as tests and confirm the result with the receiving department.' },
    { q: 'What makes rollback possible after cut-over?', a: 'Keep the old interface configured but stopped until the rollback period ends. Keep a replay archive so messages sent during a failed cut-over can be resent.' },
  ],
}
