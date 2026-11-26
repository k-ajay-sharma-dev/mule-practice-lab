export default {
  id: 'ms-177',
  category: 'mulesoft',
  title: 'Getting Telemetry Out: the Anypoint Monitoring Agent on Hybrid Servers, Sidecars on Runtime Fabric and Custom Metrics Limits',
  level: 'ADVANCED',
  tags: ['deployment', 'observability', 'anypoint-monitoring', 'hybrid', 'runtime-fabric', 'custom-metrics', 'logging'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'A hybrid server group has four servers. How is Anypoint Monitoring installed?',
      options: [
        'On each server, then restart each one from Runtime Manager',
        'Once on the first server, which replicates it to the group',
        'Automatically, by the Runtime Manager agent on each server',
        'Once in the control plane, with nothing on the servers',
      ],
      answer: 0,
      explain: 'In a server group you use Runtime Manager to restart the server so that it starts collecting metrics. To use Anypoint Monitoring across a server group or cluster, you must install it on each server. Installing needs root or administrative privileges, and Mule must already be installed and running.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each point to the Anypoint Monitoring agent installer version.',
      pairs: [
        ['Outbound to `us1.ingest.mulesoft.com:8443`', '3.x installer'],
        ['Outbound to `dias-ingestor-router.us-east-1.prod.cloudhub.io:443`', '2.x installer'],
        ['Proxy must support HTTP or HTTPS, not SOCKS5', 'Proxy rule for 3.x'],
        ['Proxy must support SOCKS5, not HTTP or HTTPS', 'Proxy rule for 2.x'],
      ],
      explain: 'A move between installer major versions changes both the network path and the proxy protocol. Port 443 is needed by all versions, and 8443 by 3.x versions. A 3.x agent requires Runtime Manager agent 2.7.1 or higher.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'A hybrid server group runs the 3.x Anypoint Monitoring agent. During one quarter the team makes the changes below. After which of them must the agent be reinstalled?',
      options: [
        'The Runtime Manager agent is upgraded on each server',
        'A fourth Mule runtime is added to the server group',
        'One Mule runtime is removed from the server group',
        'The organization moves to a higher subscription tier',
        'Every app in the group is redeployed with a new version',
      ],
      answer: [0, 1, 2],
      explain: 'An upgrade of the Runtime Manager agent, and adding or removing a runtime in a cluster or server group, all need a reinstall. A subscription tier change needs a reinstall only on a 2.x agent, so it does not apply to this 3.x group. App redeployments never require it. To update, stop Mule, run `./bin/uninstall`, delete the `am` folder, install again and restart Mule.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'Node 3 of a hybrid cluster shows Running in Runtime Manager and its 3.x agent install finished, but its JVM charts in Anypoint Insights are still empty an hour later. What is the documented next step?',
      options: [
        'Read the Mule log in `$MULE_HOME/logs`, where the agent writes its send errors',
        'Open outbound port 443 only, since the 3.x agent sends all its data on that port',
        'Verify connectivity, then look for connection failures in the agent log in `./am/logs`',
        'Set the root logger of each app to DEBUG, so that the agent can read JVM metrics',
      ],
      answer: 2,
      explain: 'The documented check is that CPU Utilization and Memory Utilization show data on the JVM tab in Anypoint Insights. If the charts stay empty, verify connectivity, then read the data-transfer agent log: `./am/logs` for 3.x (or `/var/log/otel-collector` when running as a Linux service) and look for connection failures or retries. The Mule log is not where the agent writes. Port 443 alone is not enough, because 3.x also needs outbound 8443. App log levels have nothing to do with JVM metrics.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each Runtime Fabric telemetry fact to its documented value.',
      pairs: [
        ['Metrics cached per replica when the connection is interrupted', 'Up to 100 MB, typically at least four days'],
        ['Log data stored on disk per replica', 'Up to 450 MB, then older data rotates'],
        ['Log forwarding rate of the sidecar', 'Up to 300 KB per second per replica'],
        ['Subscription for metrics', 'All plans'],
        ['Subscription for logs and traces', 'Anypoint Platform Integration Advanced'],
      ],
      explain: 'A chatty app can exceed 300 KB per second, and custom metrics may consume the cache faster. Size log levels with this in mind.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which rules apply to sending Runtime Fabric logs to Splunk with a custom Log4j configuration?',
      options: [
        'Custom Log4j is on by default, so the `log4j2.xml` packaged in the app is used as it is',
        'Only the application-level `log4j2.xml` can be customized',
        'Only asynchronous appenders may be used',
        'File appenders such as RollingFileAppender are removed automatically',
        'MuleSoft Support helps with custom logging problems',
        'With custom Log4j, the app logs no longer appear in Anypoint Monitoring',
      ],
      answer: [1, 2, 3],
      explain: 'Only the application-level `log4j2.xml` can be customized, only asynchronous appenders may be used, and file appenders such as RollingFileAppender are removed automatically. Custom Log4j is disabled by default and must be enabled, for example in `Values.yaml` or the `custom-properties` secret. MuleSoft Support does not assist with custom logging configurations. With custom Log4j, logs remain available in Anypoint Monitoring. Runtime Fabric itself does not forward logs to external systems.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A custom metric counts meter reads with two dimensions: `region`, with 12 values, and `meterId`, with 50,000 values. What does the dashboard show?',
      options: [
        'The 20 busiest combinations, as for endpoint metrics, and the rest are dropped',
        'Every combination, at the cost of a slower dashboard as the count grows',
        'Up to 100 meter IDs for each region, because the limit applies per dimension',
        'Up to 100 combinations, and the lower-volume ones are grouped under Other',
      ],
      answer: 3,
      explain: 'Anypoint Monitoring supports up to 100 unique combinations of dimension values, and lower-volume combinations beyond 100 are grouped under a single Other category. The limit applies to all custom dimensions combined, not per dimension, so `meterId` is a poor dimension. The figure of 20 belongs to built-in endpoint metrics, which track up to 20 of the most frequently called endpoints or operations each minute.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Order IDs are mixed-case strings, and a dashboard counts `/orders/aBcDe/items` and `/orders/kLmNo/items` as separate endpoints. What should you look at?',
      options: [
        'Endpoint path normalization, and a custom pattern for it',
        'A wildcard in the HTTP Listener `path`, such as `/orders/*`',
        'The limit of 20 endpoints in the built-in endpoint metrics',
        'The number of custom metric dimensions in use',
      ],
      answer: 0,
      explain: 'The default normalization replaces segments that contain digits or are all uppercase, and `anypoint.platform.config.analytics.endpoint.patterns` sets a custom pattern. Normalized paths make charts count requests to the same endpoint together. Mixed-case segments stay as they are by default, so dynamic IDs like `PAisdf` need a custom pattern.',
    },
  ],
  description: `
A utilities company has two estates:
- A **hybrid cluster of three nodes** behind an outbound proxy, with an existing Filebeat agent on each node for the security team.
- A **Runtime Fabric** cluster where the operations team wants every log in Splunk, and business teams want a "meter reads per region and per meter" dashboard.

The monitoring lead must write a standard. So far:
- Nodes 1 and 2 show metrics, node 3 does not.
- The install script refused to run on one server.
- A new business dashboard became very slow.
- Someone asked whether metrics survive a network outage.

**Questions**
1. How is Anypoint Monitoring installed and verified on the hybrid cluster?
2. What are the network requirements?
3. When does the agent need reinstalling, and what blocks installation?
4. How does telemetry leave Runtime Fabric, and what are its limits?
5. How do you get logs to Splunk?
6. How do you design a sensible custom metric for the dashboard?
`,
  answerTemplate: `## Installing on hybrid

## Network requirements

## Reinstalling and blockers

## Telemetry on Runtime Fabric

## Logs to Splunk

## Custom metric design
`,
  keyPoints: [
    'Install the agent on every server in a group or cluster. A server cannot have an existing Filebeat instance running.',
    'Installation needs root or administrative rights, and a running Mule instance managed through Runtime Manager.',
    'Hardware minimum: 2 GHz CPU or 1 virtual CPU, 1 GB RAM, 4 GB disk, Intel x86 or x64.',
    'Installer 3.x: outbound 8443 to the ingest host, plus 443. It supports an HTTP or HTTPS proxy. Installer 2.x: port 443 and SOCKS5.',
    'SSL inspection or blocked 8443 stops metrics export; the proxy needs SSL passthrough.',
    'Reinstall after a Runtime Manager agent upgrade, or if a runtime joins or leaves a cluster or group.',
    'Verify after 10 minutes on the JVM tab, then read the agent logs.',
    'Traces on hybrid need installer 3.2.14 or later, a JVM property and the `-g 4317` option.',
    'Log forwarding can be disabled per server, not per app, with a JVM property.',
    'On Runtime Fabric, a sidecar transmits telemetry, with mutual TLS for metrics. Each node needs outbound access to the regional ingest host.',
    'Runtime Fabric does not forward logs externally: use a compatible forwarder such as Fluent Bit, or Log4j appenders.',
    'Custom metrics need the Custom Metrics connector, low cardinality dimensions, and numeric facts. Up to 100 combinations are kept before an Other group.',
    'A custom metric without measurements for two consecutive days no longer appears in the metric list.',
  ],
  solution: `
**1. Install and verify.** On each node: confirm that Mule is running and managed in Runtime Manager, use **Settings** > **Hybrid** in Anypoint Monitoring to get \`am.zip\`, extract it and run the installer with root or administrator rights. Node 3 having no metrics points to a missing install or a failed connection on that node. Wait 10 minutes, then check CPU Utilization and Memory Utilization on the **JVM** tab in Anypoint Insights. If there is no data, read \`./am/logs\` (or \`/var/log/otel-collector\` as a Linux service) for connection failures or retries.

**2. Network.** Allow outbound 443 for all agents and 8443 for 3.x agents. The US control plane endpoints for 3.x are \`us1.ingest.mulesoft.com:8443\`, \`data-authenticator.anypoint.mulesoft.com:443\` and \`s3.amazonaws.com:443\`. To use the proxy, first set up Runtime Manager with the proxy, then install with \`-p\`:

\`\`\`bash
./install -p https://user:password@https-server:1080
\`\`\`

Percent-encode reserved characters in the user or password. A proxy that performs SSL inspection stops metric export, so configure SSL passthrough.

**3. Reinstall and blockers.** The agent cannot be installed on a server with an existing filebeat instance running, which explains the refusal: agree with the security team how to handle that server. Reinstall after a Runtime Manager agent upgrade, and if a runtime is added to or removed from a cluster or group. To update: stop Mule, \`./bin/uninstall\`, delete \`am\`, install again, restart Mule. A 3.x agent needs Runtime Manager agent 2.7.1 or higher.

**4. Runtime Fabric.** Each replica has a monitoring sidecar. On agent 3.0.0 and later it carries metrics, logs and traces. On a broken connection each replica caches up to 100 MB of metrics, typically at least four days, so a short outage is covered. Log limits are 450 MB on disk and 300 KB per second per replica; multi-line entries might not be fully transmitted across a rotation. Metrics are on all plans, while logs and traces need Anypoint Platform Integration Advanced. Runtime Fabric does not provide support for integrating third-party monitoring solutions.

**5. Logs to Splunk.** There are two documented routes:
- An external forwarder that is compatible with your Kubernetes environment, such as Fluent Bit, which you install and manage.
- A Log4j appender: enable custom Log4j, add an asynchronous appender such as \`SplunkHttp\` to \`src/main/resources/log4j2.xml\`, and do not change the console or Anypoint Monitoring appenders. File appenders are removed automatically. If you enable it through the secret, restart the agent pod and the app.

**6. Custom metrics.** Add the connector and use **Send Custom Metric**. "Per meter" is a high cardinality dimension, the same kind of field as \`customer_id\` or \`order_id\`, and the docs say not to add such data. It slows dashboards, and beyond 100 unique combinations the lower-volume ones go to **Other**. Use \`region\` and perhaps \`meter_type\`, with a numeric fact such as \`reads\`. Keep the per-meter detail in logs or a data platform.

Three more rules: non-numeric fact values are not validated at design time and cause a runtime exception after deployment; a custom metric shows in the \`metric_name\` list only after it emits data, and drops off after two consecutive days without measurements; and restricted keywords such as \`SELECT\`, \`GROUP\` and \`TIME\` cannot be used as names.
`,
  followUps: [
    {
      q: 'What does "Throw runtime exception on validation failure" do?',
      a: 'If it is selected, invalid metric values break the flow. If it is left unchecked, an error is logged and the flow continues. For a business flow, you normally do not want metrics to stop processing.',
    },
    {
      q: 'Does enabling monitoring cost performance?',
      a: 'It can affect CPU and memory depending on the app. The docs ask you to test the impact in pre-production before enabling it in production.',
    },
    {
      q: 'Can I run two agents on one Linux host?',
      a: 'Yes. Assign a unique telemetry port with `-t` (default 8888), and for service installs also a unique `-n` name of up to eight alphanumeric characters.',
    },
    {
      q: 'Can you disable monitoring for one Runtime Fabric app?',
      a: 'Yes. Pass `anypoint.platform.config.analytics.agent.enabled=false` at deployment. The docs limit this to compliance or geospecific needs, and only if you are not contractually obliged to send metrics for usage and billing.',
    },
  ],
}
