export default {
  id: 'ms-114',
  category: 'mulesoft',
  title: 'Anypoint Monitoring by Subscription Tier: Insights, Log Search, Retention and the Three Alert Systems',
  level: 'INTERMEDIATE',
  tags: ['observability', 'anypoint-monitoring', 'api-management', 'api-manager', 'alerts', 'logging', 'runtime-manager'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'On a Gold subscription, an engineer wants one search across the logs of all 30 apps. What do the docs say?',
      options: [
        'Gold and Platinum have log search for a single application only, in Runtime Manager; cross-application search needs Titanium or the Advanced package',
        'Every subscription has cross-application search in Anypoint Monitoring',
        'Log search is not available at all on Gold',
        'Cross-application search needs only a custom dashboard',
      ],
      answer: 0,
      explain: 'The feature tables show single-application search for Starter, Gold and Platinum, and cross-application search for Advanced and Titanium.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'In the usage-based packages, which features are listed for Anypoint Integration Advanced and not for Starter?',
      options: [
        'Custom metrics',
        'Log points',
        'Raw log data downloads',
        'Built-in application dashboards',
        'Log tailing',
      ],
      answer: [0, 1, 2],
      explain: 'All organizations get fundamental monitoring, including built-in dashboards and log tailing. Custom metrics, custom dashboards, log points, raw downloads and retention beyond 30 days are in the Advanced package.',
    },
    {
      type: 'match',
      prompt: 'Match each alert need to the system that owns it.',
      pairs: [
        ['Email when a deployment fails on a hybrid server', 'Runtime Manager alert'],
        ['Email when an API instance returns too many 503s', 'Instance alert on the API (Anypoint Monitoring / API Manager)'],
        ['Email to administrators when a client app requests access', 'Contract alert, sent automatically'],
      ],
      explain: 'Runtime Manager alerts cover infrastructure and application lifecycle events. Instance alerts cover API behaviour. Contract alerts are automatic.',
    },
    {
      type: 'single',
      prompt: 'An engineer cannot find a Runtime Manager CPU alert on the Anypoint Monitoring Alerts page. Why?',
      options: [
        'The two systems are separate; Runtime Manager alerts are not listed on the Anypoint Monitoring Alerts page',
        'The alert was deleted when the app was redeployed',
        'CPU alerts are shown only after they trigger',
        'The page shows Production alerts only',
      ],
      answer: 0,
      explain: 'The docs say to use the alert page and API of the system that owns the alert. Runtime Manager keeps 30 days of alert history.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A flow logs a 20 KB JSON document in one logger call. What happens in Anypoint Monitoring?',
      options: [
        'The line is truncated at 8 KB, including date and thread metadata',
        'The line is split into three lines',
        'The whole line is stored, and only the search index is truncated',
        'The line is dropped',
      ],
      answer: 0,
      explain: 'The maximum length of a log line is 8 KB. To log more, split the data into chunks that are each below this limit.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A company moves from Titanium to Platinum. What must it do first with its logs?',
      options: [
        'Preserve them outside the platform, because storage is cleared within an hour of the change',
        'Nothing, because logs keep their retention for 365 days',
        'Open a support case to migrate the logs',
        'Export the custom dashboards only',
      ],
      answer: 0,
      explain: 'Log data is not migrated, and the docs say to back it up before a change. Metrics differ: they have a grace period before removal.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which statements about data limits are correct?',
      options: [
        'Advanced and Titanium retain built-in and custom metrics for 365 days',
        'Starter, Gold and Platinum retain application metrics for 30 days',
        'Data in the Client Applications tab is limited to one hour on all tiers',
        'When log storage is full, the oldest logs are deleted first',
        'Anypoint Monitoring provides VPC-level network traffic metrics',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Anypoint Monitoring collects application-level metrics from the Mule runtime. It does not provide VPC-level traffic metrics.',
    },
  ],
  description: `
A logistics company has 30 Mule apps and 18 managed APIs, and it is renewing its subscription. It is deciding between staying on **Anypoint Integration Starter** and moving to **Advanced**. The operations lead brings this list:

| Need | Today |
|---|---|
| Search all apps' logs for one correlation ID during an incident | Opens each app in Runtime Manager |
| Keep metrics for a year for capacity reviews | Only the last 30 days are there |
| A business metric: parcels scanned per hour | Not possible |
| Email on a failed deployment | Works |
| Email when an API's error count is high | Unclear who owns this |
| See which client app caused yesterday's spike | The chart is empty |
| Check one app's logs after an incident from two months ago | The logs are gone |

The team also uses older names for things. One engineer says "built-in dashboards" and another says "Anypoint Insights".

**Questions**
1. What do all subscriptions get, and what needs the higher tier?
2. For each need, say which feature solves it and whether the tier matters.
3. Compare Runtime Manager alerts, instance alerts and contract alerts.
4. Which data limits should the team know?
`,
  answerTemplate: `## What each tier offers

## Each need

## The alert systems

## Data limits
`,
  keyPoints: [
    'Plans are usage-based (Starter, Advanced) or legacy core-based (Gold, Platinum, Titanium). Feature availability also depends on the control plane.',
    'All tiers have built-in dashboards for apps and APIs, log tailing, and API Functional Monitoring (except Platinum on Government Cloud).',
    'Advanced and Titanium add cross-application log search, log points, raw log downloads, custom metrics, the Archive API and retention beyond 30 days.',
    'Anypoint Insights shows metrics across apps and APIs, with a lookback of 7 days (24 hours on Starter), and per entity up to 90 days on Advanced and Titanium, 30 days otherwise.',
    'Runtime Manager alerts cover infrastructure and lifecycle; they keep 30 days of history and are not listed on the Anypoint Monitoring Alerts page.',
    'Instance alerts cover API behaviour; contract alerts are automatic.',
    'Log lines are truncated at 8 KB. When storage is full the oldest logs go first. A subscription change clears logs within an hour.',
    'Enhanced API metrics are kept 30 days, and the Client Applications tab holds only one hour of data on every tier.',
  ],
  solution: `
**1. What each tier offers.** There are two pricing models. **Usage-based** packages are Anypoint Integration Starter and Advanced. **Core-based** plans are Gold, Platinum and Titanium, which the docs call legacy. Advanced corresponds to Titanium in most features.

| Feature | Starter, Gold, Platinum | Advanced, Titanium |
|---|---|---|
| Built-in app and API dashboards | Yes | Yes |
| Log tailing | Yes | Yes |
| Log search | Single app, in Runtime Manager | Across apps |
| Log points, raw log downloads | No | Yes |
| Custom metrics | No | Yes |
| Telemetry export | No | Yes |
| Archive API, reports | No | Yes |
| Metric retention | 30 days | 365 days |

Two differences matter. On the usage-based packages, Alerts and Custom dashboards are listed as Advanced features. On Gold and Platinum, basic alerts and basic custom dashboards are included. The feature tables have many more rows, so check the page for your plan and your control plane. For example, custom dashboards, custom metrics and traces are available on the US and EU clouds, and not on Canada or Japan.

The app and API charts appear both as built-in dashboards and in **Anypoint Insights**, and the docs say Canada and Japan clouds use Anypoint Insights for these charts. So both names can come up.

**2. Each need.**
- One search across apps: cross-application log search, which needs **Advanced**.
- Metrics for a year: 365-day retention, **Advanced**. Note the UI lookback for one entity is up to 90 days within that retention.
- Parcels scanned per hour: **custom metrics**, with the Anypoint Custom Metrics connector, **Advanced**. Use dimensions with few unique values.
- Failed deployment email: a Runtime Manager alert, and this already works.
- API error count: an instance alert on the API. The usage-based feature table lists Alerts for **Advanced** and not for Starter, so check this before staying on Starter.
- Client app behind yesterday's spike: the **Client Applications** tab holds one hour of data on every tier, so **no tier fixes this**. Upgrading will not help. Use your own logs, or export data.
- Logs from two months ago: Advanced has greater storage and raw log access. Otherwise, forward logs to your own system.

**3. The alert systems.**
| | Runtime Manager | Instance alerts | Contract alerts |
|---|---|---|---|
| About | Servers, clusters, deployments, CPU, memory | Response time, request count, response codes, policy violations | Access requests, approvals, revocations |
| Set up by | You | You | Automatic |
| Notes | 30 days of history; retriggers while the breach continues | Triggered on state change | Sent to administrators or app owners |

The Anypoint Monitoring page also has Basic and Advanced alerts, with a metric, a severity and a threshold. For a Runtime Fabric app, Runtime Manager alerts are not supported, and you use Anypoint Monitoring.

**4. Data limits.**
- A log line is truncated at 8 KB.
- Searchable logs cover the most recent logs, up to 10% of purchased storage, capped at 6 TB. Raw logs go to archival storage.
- You cannot delete logs yourself. MuleSoft deletes them only for sensitive data exposure, through a support case.
- Logs in Anypoint Monitoring and in Runtime Manager are stored separately, so purging one does not affect the other.
- Changing subscription clears logs within an hour; metrics have a grace period.
- Custom metrics group up to 100 unique dimension combinations, and the rest fall into **Other**.
`,
  followUps: [
    {
      q: 'Why might an app be missing from the Log Search filter?',
      a: 'The FAQ says it does not appear when recent log lines are unavailable, or when a large number of apps are reporting recent logs.',
    },
    {
      q: 'Does monitoring slow down an app?',
      a: 'The FAQ gives an expected CPU use of less than 5% for the monitoring agent. Data is collected asynchronously at one-minute resolution, so it does not block Mule processing.',
    },
    {
      q: 'Can metrics be seen across environments in one dashboard?',
      a: 'No. Application metrics are scoped to one environment. To combine them, query the Metrics API for each environment and add the results.',
    },
    {
      q: 'What is sent to an external tool such as Splunk?',
      a: 'The Telemetry Exporter on Advanced and Titanium exports audit logs and traces, with up to 10 connections per organization.',
    },
  ],
}
