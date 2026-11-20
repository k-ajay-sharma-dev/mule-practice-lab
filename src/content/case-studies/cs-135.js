export default {
  id: 'cs-135',
  category: 'case-studies',
  title: 'Integration Team Asked to Cut Platform Cost by a Third Across 120 Small Mule Apps',
  level: 'EXPERT',
  tags: ['cost', 'capacity', 'cloudhub', 'operations', 'governance'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Most of the 120 apps run on more capacity than they use. What is the first step?',
      options: [
        'Measure each app’s use over a normal month and a peak before changing it',
        'Cut every app’s capacity by a third on the same day',
        'Turn off the 40 apps with the least traffic to save quickly',
        'Move every app to the smallest size and scale up any that fail',
      ],
      answer: 0,
      explain: 'Data shows which apps are oversized and by how much. Cutting all apps the same way breaks the ones that need their capacity, low traffic does not mean unused, and waiting for failures hurts service.',
    },
    {
      type: 'single',
      prompt: 'Thirty apps each poll a different folder or table once an hour and do little else. What can save the most?',
      options: [
        'Group related jobs into fewer apps where they share an owner and releases',
        'Lower each of the 30 apps to the smallest worker size and leave it',
        'Merge all 30 jobs into one app, whoever owns them',
        'Run each job less often, such as once a day instead of once an hour',
      ],
      answer: 0,
      explain: 'Many tiny apps each pay for their own minimum capacity, so shrinking them saves little. Grouping related jobs shares that capacity, as long as they can be released together. Merging unrelated jobs couples them, and polling less often changes the service, not the cost.',
    },
    {
      type: 'multi',
      prompt: 'Which three risks come with merging apps?',
      options: [
        'One faulty job can affect the others in the same app',
        'A change to one job means redeploying all of them',
        'Teams lose clear ownership if unrelated jobs are mixed',
        'Merged apps cannot be monitored in Anypoint Monitoring',
      ],
      answer: [0, 1, 2],
      explain: 'Merging trades cost for coupling. Group only jobs with the same owner, the same rhythm of change and a similar risk. A merged app is still monitored like any other app.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Sandbox environments run 24 hours a day with full copies of every app. What do you change?',
      options: [
        'Stop them out of hours, and keep only the apps each team is working on',
        'Delete all sandbox environments and test directly in production',
        'Keep them running all day, and cut production capacity instead',
        'Merge every sandbox app into one large app per environment',
      ],
      answer: 0,
      explain: 'Non-production capacity is often idle at night and at weekends. Scheduling it saves money without hurting delivery, while testing in production or cutting production puts service at risk.',
    },
    {
      type: 'match',
      prompt: 'Match each saving to how it is made.',
      pairs: [
        ['Oversized apps', 'Right size from measured use with headroom'],
        ['Many tiny jobs', 'Group by owner and release cycle'],
        ['Idle non-production', 'Scale down out of hours'],
        ['Unused apps', 'Retire after checking nobody calls them'],
      ],
      explain: 'Each kind of waste has its own fix, and each fix has its own risk to manage.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Measure use per app and list owners',
        'Retire apps nobody calls',
        'Right size oversized apps in small steps, watching after each',
        'Group related small jobs where owners agree',
        'Report monthly cost per app and per team',
      ],
      explain: 'Measure first, take the safe wins, then the riskier changes, and keep cost visible so it does not creep back.',
    },
  ],
  description: `
**Context.** A retail group runs **120 Mule apps** on CloudHub. The CFO asks the integration team to cut platform cost by **a third** this year, without hurting service.

**Facts gathered so far**
- Most apps were given the same capacity when created, whatever they do.
- 40 apps handle less than one request a minute. 30 of them are small scheduled jobs.
- Non-production environments hold a full copy of every app and run all day.
- Nobody knows the owner of about 15 apps.
- Two apps have real peaks at sale times and need their capacity then.

**Opinions**
- CFO: "A third, this year."
- Head of integration: "I will not risk the sale-time apps."
- Developers: "Merging apps makes releases harder."

**Your task.** Plan how to cut cost by a third, which changes to make, in what order, and how to keep service safe.
`,
  answerTemplate: `## Decision

## Measuring

## Quick wins

## Right sizing

## Grouping small apps

## Non-production

## Keeping it down

## Risks
`,
  keyPoints: [
    'Measure use per app over normal and peak periods before changing anything.',
    'Retire apps nobody calls, after checking the logs and asking around.',
    'Right size in small steps and watch after each one.',
    'Group small jobs only when they share an owner and a release cycle.',
    'Scale down non-production out of hours.',
    'Report cost per app and per team every month.',
  ],
  solution: `
**Decision.** A measured programme: retire, right size, group and schedule, while sale-time apps keep their capacity.

**Measuring.** Collect CPU, memory and traffic per app for a normal month and a peak. Find an owner for every app.

**Quick wins.** Apps with no traffic for months are confirmed unused with their likely owners and retired. Non-production apps are scaled down or stopped out of hours, and only the apps a team is working on stay in their sandbox.

**Right sizing.** Lower capacity for oversized apps step by step, with headroom, watching errors and latency after each change. Sale-time apps are sized for their peak.

**Grouping.** Small scheduled jobs that share an owner and change together are merged into fewer apps. Unrelated jobs stay apart.

**Keeping it down.** A monthly report of cost per app and team, and a review of capacity for every new app.

**Risks.** Hidden peaks such as month end, owners who resist merging, and savings that creep back as new apps are added.
`,
  followUps: [
    { q: 'How do you find out if an app is really unused?', a: 'Check traffic and logs over a long period, look for callers in API analytics, ask likely owners, and stop it for a while before deleting it.' },
    { q: 'Why not merge everything?', a: 'One app with many unrelated jobs couples their releases and failures. Savings are not worth a shared outage.' },
    { q: 'How do you protect the sale-time apps?', a: 'Exclude them from cuts, size them from last year’s peak, and load test before each sale.' },
    { q: 'How do you show the CFO progress?', a: 'A monthly cost report against the target, with savings by type: retired, right sized, grouped and scheduled.' },
  ],
}
