export default {
  id: 'cs-140',
  category: 'case-studies',
  title: 'Integration Team Building Monitoring and Alerts Across 200 APIs After Customers Found Outages First',
  level: 'EXPERT',
  tags: ['observability', 'slo', 'alerting', 'tracing', 'operations'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Customers report outages before the team knows. What do you measure first?',
      options: [
        'Error rate and response time of the top APIs against targets',
        'CPU and memory of every app, with alerts above 80 percent',
        'Health check endpoints on every app, polled each minute',
        'Error counts from the logs of every app, summed per day',
      ],
      answer: 0,
      explain: 'Callers feel errors and slowness, not CPU. A health check says the app is up, not that callers get good answers, and a daily count comes too late. Targets on what callers see tell you when it matters.',
    },
    {
      type: 'single',
      prompt: 'Today 900 alerts fire a week and people ignore them. What do you change?',
      options: [
        'Alert only when a target is at risk, with an owner and runbook',
        'Raise the CPU and memory thresholds so fewer alerts fire',
        'Send every alert to one shared channel that all teams watch',
        'Group the alerts into one summary email each morning',
      ],
      answer: 0,
      explain: 'An alert nobody acts on trains people to ignore alerts. Higher thresholds still alert on things callers do not feel, and a shared channel or a morning email has no owner. Fewer alerts, each with an owner and a clear action, are read.',
    },
    {
      type: 'multi',
      prompt: 'Which three make a problem across several APIs quick to find?',
      options: [
        'One correlation ID passed through every layer and logged on every line',
        'The same field names for IDs and status in every app',
        'Logs from every app in one place with search by field',
        'A dashboard per API showing its own error rate and response time',
        'Each team adds its own request ID, in a field name it chooses',
        'Lower CPU and memory alert thresholds on every app so issues show sooner',
      ],
      answer: [0, 1, 2],
      explain: 'One request seen across all its hops is what you need in an incident. That only works with one ID, one naming and one place to search. A dashboard per API shows that each one is failing but not that they fail on the same request. A request ID per team still breaks at each hop, because the next app uses another ID and another field. Lower CPU and memory thresholds add to the 900 ignored alerts and say nothing about which request failed.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Two hundred APIs belong to 15 teams. How do you get them all to follow the standard?',
      options: [
        'A shared template with logging, IDs and metrics built in, checked in the pipeline',
        'A logging standard document that each team reads and applies',
        'A central team that rewrites the logging of every API',
        'Each team picks its own tools, as long as logs reach the central tool',
      ],
      answer: 0,
      explain: 'The default should be the right way. A template makes it free for new APIs, and a pipeline check keeps it there.',
    },
    {
      type: 'match',
      prompt: 'Match each signal to what it answers.',
      pairs: [
        ['Error rate and latency per API', 'Are callers getting good service now?'],
        ['Correlation ID in logs', 'What happened to this one request?'],
        ['Queue depth and age', 'Is async work falling behind?'],
        ['Dependency call times', 'Which downstream system is slow?'],
      ],
      explain: 'Each signal answers one question in an incident. Together they shorten the time to find the cause.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Agree targets for the ten most used APIs with their callers',
        'Add correlation IDs and the logging standard to the shared template',
        'Build dashboards and alerts on the targets, each with an owner and runbook',
        'Remove the alerts nobody acts on',
        'Roll the template out to the other APIs at their next release',
      ],
      explain: 'Start where callers feel pain, make the right way the default, then grow and prune.',
    },
  ],
  description: `
**Context.** A logistics group runs **200 Mule APIs** owned by 15 teams. In the last quarter, customers reported three major outages before the integration team noticed.

**Facts gathered so far**
- Each team logs in its own way. Some log full payloads, some log almost nothing.
- There is no common correlation ID. Following one request across layers takes hours.
- About 900 alerts fire each week, mostly on CPU and memory. Most are ignored.
- Logs go to a central log tool, but field names differ between apps.
- Nobody has agreed what "good service" means for any API.

**Opinions**
- Head of integration: "I want to know before customers do."
- Team leads: "We have no time to rewrite logging in 200 apps."
- On-call engineers: "Most alerts are noise."

**Your task.** Plan how the team gets reliable monitoring and alerting across the estate, what to measure, and how to roll it out.
`,
  answerTemplate: `## Decision

## What good service means

## Logging and correlation

## Metrics and dashboards

## Alerts and ownership

## Rolling it out

## Risks
`,
  keyPoints: [
    'Measure what callers feel: good requests and response time against targets.',
    'Start with the most used APIs and agree targets with their callers.',
    'One correlation ID across every layer and every log line.',
    'One logging standard with the same field names, in a shared template.',
    'Alert only when a person must act, with an owner and runbook.',
    'Remove alerts nobody acts on.',
  ],
  solution: `
**Decision.** A programme that starts with targets for the most used APIs, a shared template for logging and IDs, and alerts tied to those targets.

**What good service means.** For each top API, agree with its callers a target such as 99.5% good requests and 95% under 800 ms over 30 days.

**Logging and correlation.** A shared template sets a correlation ID at the edge and passes it on every call. It logs one line in and one line out per request, with the same field names everywhere, and never full payloads at INFO.

**Metrics and dashboards.** Error rate and latency per API, call times per dependency, and queue depth and age. One dashboard per service, owned by its team.

**Alerts and ownership.** Alerts fire when a target is at risk, not on CPU alone. Each alert has an owner and a runbook. Alerts with no action are removed.

**Rolling it out.** Top ten APIs first. The others adopt the template at their next release, checked in the pipeline.

**Risks.** Teams that do not adopt the template, targets set without callers, and log costs rising if payloads creep back.
`,
  followUps: [
    { q: 'Why not alert on CPU?', a: 'High CPU does not always hurt callers, and callers can be hurt with low CPU. Alert on what they feel and use CPU to find the cause.' },
    { q: 'How do you pass the correlation ID?', a: 'Read it from an agreed header at the edge or create one, keep it in the event, and send it on every outbound call and message.' },
    { q: 'What is a runbook?', a: 'A short page for one alert: what it means, how to check, and the first steps to take.' },
    { q: 'How do you show progress?', a: 'Outages found by the team before customers, time to find the cause, and alerts per week that led to action.' },
  ],
}
