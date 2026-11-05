export default {
  id: 'ms-176',
  category: 'mulesoft',
  title: 'Edge or LTS: Release Channels, Java Support, End-of-Support Planning and What Each Target Does When a Version Expires',
  level: 'ADVANCED',
  tags: ['deployment', 'release-channels', 'lts', 'edge', 'java', 'upgrade', 'hybrid', 'runtime-fabric', 'environments'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each channel property to its documented value.',
      pairs: [
        ['Edge release cadence', 'Up to three times per year'],
        ['LTS release cadence', 'Periodic, scheduled for February'],
        ['Edge Standard Support (4.9 and later)', 'Until one month after the next Edge version is released'],
        ['LTS Standard Support (4.6 and later)', 'A minimum of 18 months'],
        ['Edge Extended Support (4.9 and later)', '3 months'],
        ['LTS Extended Support (4.6 and later)', 'A minimum of 6 months'],
      ],
      explain: 'Edge suits teams that want new features and accept frequent upgrades, and Edge versions are not FedRAMP approved. LTS adopts capabilities after they arrive through Edge releases and is maintained for longer.',
    },
    {
      type: 'single',
      prompt: 'It is November 2026. According to the published table, what is the status of Mule 4.6 LTS?',
      options: [
        'Past End of Standard Support (August 2026), in Extended Support until February 2027',
        'In Standard Support until August 2027',
        'Already past End of Extended Support',
        'Supported indefinitely because it runs Java 8',
      ],
      answer: 0,
      explain: 'MuleSoft gave 4.6 LTS an extended window because of its compatibility with Java 8, 11 and 17. Mule 4.9 LTS has End of Standard Support in August 2027 and End of Extended Support in February 2028.',
    },
    {
      type: 'match',
      prompt: 'Match each target to how minor version upgrades happen.',
      pairs: [
        ['CloudHub 2.0, Edge channel', 'Auto-upgraded six weeks after End of Standard Support, with a self-upgrade window'],
        ['CloudHub 2.0, LTS channel', 'Not auto-upgraded at End of Standard Support; you upgrade manually'],
        ['Runtime Fabric', 'Not upgraded by MuleSoft without customer action'],
        ['Hybrid Standalone', 'No auto-upgrade; you use the Mule Upgrade Tool'],
      ],
      explain: 'Auto-patching within a minor version is a separate monthly process, and it applies to CloudHub and CloudHub 2.0.',
    },
    {
      type: 'multi',
      prompt: 'What happens when a version reaches End of Extended Support, or later End of Life, on customer-hosted targets?',
      options: [
        'Runtime Fabric: you cannot deploy new apps on that version',
        'Runtime Fabric: at End of Life, you can still restart or redeploy apps on the same runtime version',
        'Hybrid Standalone: you can still deploy new apps',
        'Hybrid Standalone: at End of Life, MuleSoft reserves the right to close the connection of the runtime server to Anypoint Platform',
        'Runtime Fabric and Hybrid Standalone: MuleSoft shuts down the running apps',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Running apps keep running on these targets, but they are no longer in a supported state. Shutdown and forced upgrade are CloudHub and CloudHub 2.0 behaviours. For Hybrid, the End of Extended Support row says you can deploy new apps, while the same table\'s deploy row says to deploy while versions are in support. So do not plan on it.',
    },
    {
      type: 'single',
      prompt: 'An app moved to 4.7 Edge for one feature. It now wants to return to LTS. Which move is supported?',
      options: [
        'To a later LTS version, such as 4.9 LTS',
        'Back to 4.6 LTS',
        'To any LTS version',
        'It can never leave Edge',
      ],
      answer: 0,
      explain: 'MuleSoft does not support switching an app from Edge to an older LTS version, because it might lose features.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about Java and Mule versions are correct?',
      options: [
        '4.6 LTS supports Java 8, 11 and 17',
        '4.9 LTS and later versions support Java 17 only',
        'From Mule 4.9.0 you can compile projects and dependencies for Java 17 or lower',
        'Before Mule 4.9.0, you must compile projects and dependencies for Java 8',
        'Mule 4.6 supports running on Java 21',
      ],
      answer: [0, 1, 2, 3],
      explain: 'In Mule 4.6.0 and later the maximum supported version for running apps is Java 17. A jump from 4.6 on Java 8 to 4.9 therefore includes a Java upgrade.',
    },
    {
      type: 'single',
      prompt: 'Your API proxies and Mule Gateway policies must move to Java 17 along with the apps. What order does the Java Support page insist on?',
      options: [
        'Upgrade policies before upgrading API proxies or Mule apps',
        'Upgrade apps first, then policies',
        'Upgrade proxies first, then policies',
        'The order makes no difference',
      ],
      answer: 0,
      explain: 'The page marks this as important: it ensures that proxies and apps stay protected during the upgrade. Connectors and modules must also be on Java 17-compatible versions first.',
    },
    {
      type: 'multi',
      prompt: 'Why would a CloudHub 2.0 app on Mule 4.9 not auto-upgrade to 4.10 or later?',
      options: [
        'Mule 4.10 removes support for TLS 1.0 and 1.1, which could break apps',
        'Apps on 4.9 or earlier are auto-upgraded at most to the Mule 4.9 line',
        'To use 4.10 or later, you upgrade the app manually',
        'The 4.10 runtime is not available on CloudHub 2.0',
      ],
      answer: [0, 1, 2],
      explain: 'Customer-hosted targets get no such protection, because the upgrade is your own action. Check the TLS versions of every endpoint before you cross this line on hybrid or Runtime Fabric.',
    },
  ],
  description: `
In November 2026, an energy company reviews its Mule estate:

| Group | Target | Mule | Java |
|---|---|---|---|
| A: 40 apps | Hybrid Standalone cluster | 4.6 LTS | 8 |
| B: 25 apps | Runtime Fabric | 4.8 Edge | 11 |
| C: 30 apps | CloudHub 2.0 | 4.9 LTS | 17 |
| D: 12 API proxies with custom Java policies | Hybrid Standalone | 4.6 LTS | 8 |

Management asks for a one-page plan. The compliance lead asks whether Edge can be used in a FedRAMP context. The Group B owner asks why the apps were not moved automatically.

**Questions**
1. Compare Edge and LTS, and recommend a channel per group.
2. What is the support status of each group today?
3. What happens if nothing is done on each target?
4. What is the Java impact, and what is the upgrade order?
5. What does the version string tell you on each target?
`,
  answerTemplate: `## Edge against LTS

## Support status today

## If nothing is done

## Java upgrade path

## Version strings
`,
  keyPoints: [
    'Both channels exist on Runtime Fabric, CloudHub, CloudHub 2.0 and Hybrid Standalone. Edge: up to three releases a year. LTS: periodic, scheduled for February.',
    'Edge versions are not FedRAMP approved.',
    'Patch updates follow a monthly schedule; the channel cadence is about new runtime versions.',
    'From the table: 4.6 LTS ended Standard Support in August 2026 and ends Extended Support in February 2027. 4.8 Edge ended Extended Support in June 2025. 4.9 LTS runs to August 2027 and February 2028.',
    'CloudHub and CloudHub 2.0 auto-patch monthly and auto-upgrade Edge apps. Runtime Fabric and Hybrid Standalone do not upgrade apps without your action.',
    'At End of Extended Support: Runtime Fabric cannot deploy new apps; Hybrid can.',
    'Mule 4.10 removes TLS 1.0 and 1.1, so 4.9 and earlier are not auto-upgraded past the 4.9 line.',
    'Moving from Edge to LTS requires a later LTS.',
    'Java: 4.6 LTS supports 8, 11 and 17; 4.9 onward supports 17. Upgrade connectors first, policies before proxies and apps.',
    'Version format: `4.6.0:1e` is Edge and `4.6.0:1` is LTS on CloudHub, CloudHub 2.0 and Runtime Fabric. Hybrid uses `Major.Minor.Patch`.',
  ],
  solution: `
**1. Channels.** Edge gives new features up to three times a year with short support. LTS releases are scheduled for February and have at least 18 months of Standard Support and at least 6 months of Extended Support. Recommended:
- Groups A, C and D: LTS, because the priority is fewer upgrades and, for a regulated company, longer windows.
- Group B: move to LTS too, unless the team really needs Edge features. If so, they accept frequent upgrades and no FedRAMP approval.

**2. Status in November 2026.**
- A and D (4.6 LTS): in Extended Support until February 2027.
- B (4.8 Edge): past End of Extended Support, which was June 2025.
- C (4.9 LTS): in Standard Support until August 2027.

**3. If nothing is done.**
- *Runtime Fabric (B):* apps keep running. They are not auto-upgraded. New apps cannot be deployed on that version, and the apps are outside support. Existing apps can still be restarted or redeployed on the same version once they reach End of Life. This is the reason they were not moved automatically: Runtime Fabric needs a customer action.
- *Hybrid (A, D):* apps keep running and new apps can still be deployed. There is no auto-upgrade. After End of Life, MuleSoft reserves the right to close the connection between the runtime server and Anypoint Platform.
- *CloudHub 2.0 (C):* apps are auto-patched monthly as long as the TLS version is compatible. LTS apps are not auto-upgraded at End of Standard Support, and apps that stay until End of Extended Support are subject to a forced upgrade. Do not plan on relying on that.

**4. Java and order.** Moving A, B and D to 4.9 LTS means Java 17, because 4.9 and later support only 17. The Java Support page sets out this approach:
1. Review the current setup, and write a plan with testing and rollback.
2. Upgrade the runtime, then connectors and modules to Java 17-compatible versions. Custom Java needs extra work.
3. Upgrade **policies before** API proxies or apps. Group D's custom Java policies need extra certification effort.
4. Test in a controlled environment, then monitor.

After the move, expect different heap patterns. On Runtime Fabric allocate at least 1400 MB of memory for 0.50 vCPU replica sizes. On hybrid and standalone, the page says to tune garbage collection. Also review TLS: moving a server from Java 8 to Java 11 or later changes cipher preference to the server side.

For Group B moving from Edge, the LTS target must be later than the Edge version they run, which is true of 4.8 to 4.9 LTS.

**5. Version strings.** On CloudHub, CloudHub 2.0 and Runtime Fabric, \`4.9.0:3\` has the form Major.Minor.Patch:Build, and a trailing \`e\` marks Edge. A new build can change the image or OS without changing the runtime. On Hybrid Standalone, a version is plain semantic versioning, such as \`4.9.3\`.
`,
  followUps: [
    {
      q: 'What is the Mule 4.13 situation?',
      a: 'The table lists 4.13 Edge, released October 2026, with Standard Support to March 2027 and Extended Support to June 2027. Choose it only if you accept that short window.',
    },
    {
      q: 'Does rollback exist if the upgrade goes wrong?',
      a: 'Yes: the lifecycle table says rollback is available to the previously used version on all targets, on Hybrid Standalone through the Mule Upgrade Tool.',
    },
    {
      q: 'Can you pin a Runtime Fabric app to an exact build?',
      a: 'Yes. Redeployment is supported when a build tag is provided. Without a tag, the app defaults to the latest patch of the minor version, and a wrong or unsupported tag fails the deployment.',
    },
    {
      q: 'Are the support dates fixed for good?',
      a: 'Take them from the Edge and LTS page and the MuleSoft support policy at planning time. The channel table states minimums for LTS, so check the current table before you commit a plan.',
    },
  ],
}
