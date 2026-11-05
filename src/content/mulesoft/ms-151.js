export default {
  id: 'ms-151',
  category: 'mulesoft',
  title: 'Rolling Update or Recreate on CloudHub 2.0: Replica Status, Grace Periods, Failed Updates and Rollback',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'rolling-update', 'rollback', 'replicas', 'operations'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: '`prc-settlement` runs on one replica with a Scheduler that fires every few minutes. The team chose **Recreate** because redeployment is faster. What is the documented consequence during a restart?',
      options: [
        'The sole replica is terminated first, traffic sees a brief downtime, and a schedule that triggers during that downtime is missed',
        'A new replica starts first and two replicas run until the old one has stopped',
        'The platform holds schedule triggers and fires them when the new replica is ready',
        'Nothing changes, because the deployment model applies only to apps with two or more replicas',
      ],
      answer: 0,
      explain: 'The second option describes a single replica with a rolling restart. There, the old replica stops receiving new connections and stops triggering schedules once it is in Stopping status.',
    },
    {
      type: 'single',
      prompt: '`prc-fraud-scoring` runs in cluster mode. The next Mule runtime version changes the Hazelcast version. Which update strategy do the docs tell you to use, and why?',
      options: [
        'Recreate, because a rolling update can leave cluster members on incompatible Hazelcast versions and fail with a serialization error',
        'Rolling update, because clustered replicas must never all stop at the same time',
        'Rolling update, because the platform upgrades Hazelcast before the runtime',
        'Either one, because clustered replicas do not exchange data during an update',
      ],
      answer: 0,
      explain: 'The patch updates page calls this out for clustered apps. A short outage from Recreate is the trade-off that avoids a mixed-version cluster.',
    },
    {
      type: 'order',
      prompt: 'Order the events of a normal application deployment.',
      items: [
        'The expected state is stored, including the application bundle and number of replicas',
        'The replica status is PENDING',
        'When compute and memory are available, each replica is attached to a node',
        'The replica status is STARTING',
        'The replica finishes loading the application',
        'The replica status is STARTED and it can perform work',
      ],
      explain: 'If the status never reaches RUNNING for the application, the replicas carry a state and reason that explain why.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A replica shows PENDING with the message `CrashLoopBackoff`, then alternates between RECOVERING and PENDING. What does this mean?',
      options: [
        'The replica cannot restart, for example because it relies on an unavailable network resource, and CloudHub 2.0 keeps trying with exponential backoff',
        'The replica is waiting for a vCore allocation to be increased',
        'The app has been stopped by the monthly patch cycle',
        'The configuration has been rolled back and the replica is idle',
      ],
      answer: 0,
      explain: 'CloudHub 2.0 restarts a crashed replica at once, then backs off exponentially if restarts keep failing, until the cause is resolved.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'A long-running flow is cut short during shutdown. Match each case to the documented behaviour.',
      pairs: [
        ['Infrastructure-triggered restart with no custom `shutdownTimeout`', 'A grace period of up to 12 hours'],
        ['User-triggered stop, restart, update or redeploy', 'The configured `shutdownTimeout` is honoured, with no 12-hour extension'],
        ['Default `shutdownTimeout` of the Mule runtime', 'Five seconds'],
        ['Timeout for deleting the app from Mule on stop, restart, update or redeploy', 'Five minutes, then the whole instance is shut down'],
      ],
      explain: 'The practical rule: a deployment you start yourself does not get the 12-hour allowance. If in-flight work needs longer than the default, set `shutdownTimeout` in the Mule configuration, for example `shutdownTimeout="150000"`.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An update does not deploy. What does the Updating Apps page say happens?',
      options: [
        'CloudHub 2.0 reports that it did not apply the configuration, the status is `Update failed`, and the deployment attempts to roll back to the last successful version, which might not always succeed',
        'The new configuration stays active and the old replicas are deleted',
        'Rollback always succeeds, so no follow-up is needed',
        'The failed configuration is removed from the history',
      ],
      answer: 0,
      explain: 'A failed configuration appears in the Config changes history without a label. Check the replica status, because a rollback can also fail.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which statements about configuration history and rollback are correct?',
      options: [
        'The Config changes tab includes the last 10 configuration deployments, each identified by a unique hash',
        'When you roll back, the configuration moves to the top of the history with a new deployment date and keeps its original hash',
        'You can change the runtime version of a previous configuration as part of the rollback',
        'On the first deployment of an app there is no rollback version, so a failed deployment stays in failed status',
        'A rollback generates a new hash, so the old configuration can no longer be traced',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Rollback is a redeployment of a previous configuration. Because you can adjust settings before clicking Deploy, you can roll back and still keep a newer runtime version.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'On a production app during business hours, which of these actions cause a restart or redeployment?',
      options: [
        'Changing the log level and clicking Apply Changes',
        'Adding an application property and clicking Apply Changes',
        'Changing a schedule on the Schedules tab',
        'Filtering the Logs page by replica',
        'Searching the Logs page for a transaction ID',
      ],
      answer: [0, 1, 2],
      explain: 'Each of the first three is documented as restarting or redeploying the app, so treat them as changes, not as harmless console clicks. Reading logs has no effect on the app.',
    },
  ],
  description: `
A payments company is writing its release standard for **CloudHub 2.0**. It runs three kinds of application:

| App | Shape | Current setting |
|---|---|---|
| \`exp-payments\` | Stateless API, 3 replicas | Rolling update |
| \`prc-settlement\` | Scheduler every 5 minutes, 1 replica | Recreate, chosen because it is faster |
| \`prc-fraud-scoring\` | Cluster mode, 2 replicas | Rolling update |

Three things happened last quarter:
- A Thursday update of \`exp-payments\` failed. The release engineer was unsure which version was live and how to return to the last good state.
- A 20-minute reconciliation flow in \`prc-settlement\` was cut short during a redeploy, although someone remembered "a 12-hour grace period".
- A support engineer changed a log level at 11:00 on a working day to investigate a ticket and the app restarted.

The platform owner also wants to know how to read replica statuses during a deployment.

**Questions**
1. Compare Rolling Update and Recreate, and choose one for each app.
2. Describe replica statuses during a healthy and a failing deployment.
3. Explain the grace periods, and what protects a long flow during a release.
4. How do failed updates, configuration history and rollback work?
5. Which console actions must go through change control?
`,
  answerTemplate: `## Deployment model per app

## Replica statuses

## Grace periods

## Failed updates and rollback

## Console actions that restart the app
`,
  keyPoints: [
    'Rolling update maintains availability by updating replicas incrementally, so versions overlap and must be compatible. Recreate terminates replicas first, redeploys faster and needs no additional resources.',
    'A single replica on Recreate has brief downtime, and a schedule due in that window is missed.',
    'Clustered apps should use Recreate when a runtime version changes Hazelcast, to avoid a serialization error between incompatible members.',
    'Normal start: PENDING, STARTING, STARTED. Failure: TERMINATED, RECOVERING, then PENDING with CrashLoopBackoff and exponential backoff if restarts keep failing.',
    'Infrastructure-triggered restarts allow up to 12 hours. User-triggered actions honour the configured shutdownTimeout and do not get that extension.',
    'A failed update shows Update failed and attempts to roll back to the last successful configuration; the rollback can also fail.',
    'Config changes holds the last 10 deployments; a rollback moves the configuration to the top and keeps its hash. A first deployment has nothing to roll back to.',
    'Log level changes, property changes and schedule changes all restart or redeploy the app.',
  ],
  solution: `
**1. Models.**
- \`exp-payments\`: **Rolling update**. Requests continue while replicas are replaced. Both versions run for a time, so contracts and any shared state must work across them.
- \`prc-settlement\`: **Rolling update** is the safer choice. With one replica, a new replica starts before the old one begins its graceful shutdown, so there is no downtime window in which a trigger is missed. Two replicas run for a short time, so keep the job idempotent. Recreate saves time at deployment and risks missed triggers.
- \`prc-fraud-scoring\`: normally rolling, but use **Recreate** for a runtime update that changes the Hazelcast version.

Patch updates follow the same setting. They use blue-green or rolling replacement for apps on the Rolling Update model, and an app with one replica or on Recreate has slight downtime.

**2. Statuses.** A healthy start goes PENDING, STARTING, STARTED. After a crash a replica goes TERMINATED, then RECOVERING, then STARTED. If it cannot restart it shows PENDING with \`CrashLoopBackoff\`, alternating with RECOVERING, until the cause is resolved. Application status **Running** means at least one replica is receiving traffic, so it can hide a partly failed deployment. Always open **View status**.

**3. Grace periods.** On a user-triggered action, the platform honours the configured \`shutdownTimeout\`, and the 12-hour allowance does not apply. The runtime default is five seconds, and the instance timeout on stop, restart, update and redeploy is five minutes. To protect the 20-minute flow, make it resumable and idempotent, and release outside its run window. A timeout cannot be a substitute for that.

**4. Failed updates.** The status becomes \`Update failed\`, the configuration appears in **Config changes** without a label, and the deployment attempts to roll back to the last successful version. To roll back yourself, open **Settings > Configuration**, select the version, adjust settings if needed and click **Deploy**. The configuration moves to the top and keeps its hash. On a first deployment there is no version to return to.

**5. Change control.** Changing a log level, changing properties and changing schedules all restart or redeploy. Note that an update creates a new configuration, so the Logs page may look empty until you select the earlier config.
`,
  followUps: [
    { q: 'Can I rename an app with an update?', a: 'No. The app name cannot be changed after deployment. To change it, delete the app and deploy it again under the new name.' },
    { q: 'What does the Unknown application status mean?', a: 'The target is disconnected. The Updating Apps page says that this value indicates a MuleSoft-related outage or incident, so check the status page before changing anything.' },
    { q: 'Does a rolling update guarantee zero downtime in every case?', a: 'No. The architecture page notes edge cases: long in-flight requests that do not complete during the grace period mean zero downtime is not guaranteed.' },
    { q: 'What happens to a running batch job during an update?', a: 'If the whole application is updated or redeployed while the batch runs, the rest of the batch job does not continue, according to the Clustering page. If Mule restarts in the same deployment, the status persists and the batch continues.' },
  ],
}
