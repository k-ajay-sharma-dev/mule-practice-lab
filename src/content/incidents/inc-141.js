export default {
  id: 'inc-141',
  category: 'incidents',
  title: 'Security Narrows the Default Egress Rule Group and Apps Fail: Cluster Port 5701, Anypoint MQ and Object Store v2',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'egress', 'firewall', 'clustering', 'anypoint-mq', 'insurance'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '2026-09-21 09:00:12 INFO  [audit] private space prod-eu: App-Level Egress Rules enabled, user s.lindqvist', relevant: true, why: 'The feature is switched on. Until now its default group allows any protocol to any destination, so nothing breaks yet.' },
      { text: '2026-09-21 09:04:40 INFO  [audit] Default-Egress-Rule-Group updated: 3 rules (HTTPS to api.broker-hub.example, api.rates.example, sftp.partner.example)', relevant: true, why: 'Changes to the default group affect all applications in the private space, and these rules allow only three partner domains.' },
      { text: '2026-09-21 09:06:02 ERROR [prc-claims-events] Anypoint MQ subscriber: cannot reach mq-eu-central-1.anypoint.mulesoft.com: connection failed', relevant: true, why: 'The MQ domain is no longer allowed by the rule group that the app uses.' },
      { text: '2026-09-21 09:06:30 ERROR [prc-policy-sync] Object store call to object-store-eu-central-1.eu1.anypoint.mulesoft.com failed: connection failed', relevant: true, why: 'Object Store v2 also needs an application-level rule for its regional domain.' },
      { text: '2026-09-21 09:07:15 INFO  [exp-broker-quotes] POST https://api.rates.example/v2/quote 200 (240 ms)', relevant: true, why: 'Allowed partner domains still work, so the rules are being applied as written.' },
      { text: '2026-09-21 09:08:33 INFO  [runtime] prc-claims-rules: restarting replicas after configuration change', relevant: false },
      { text: '2026-09-21 09:11:04 WARN  [prc-claims-rules] Hazelcast: could not connect to member 10.60.4.21:5701, cluster join failed', relevant: true, why: 'Clustered replicas discover each other over port 5701 on the local private network, and that traffic now needs a rule.' },
      { text: '2026-09-21 09:12:00 INFO  [firewall] private space outbound rules unchanged: HTTPS 443 and TCP all ports to 0.0.0.0/0', relevant: true, why: 'The private space firewall is not the cause. The block comes from the application-level layer.' },
      { text: '2026-09-21 09:13:20 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'The default egress rule group, which applies to all apps that have no custom group, was narrowed to three partner domains, so platform services and cluster traffic are now blocked at the application level',
          'The private space firewall dropped outbound 443',
          'Anypoint MQ and Object Store v2 are both down in the region',
          'App-Level Egress Rules block all traffic the moment they are enabled',
        ],
        answer: 0,
        explain: 'Enabling the feature alone changes nothing, because the default rule allows any protocol to any destination. The damage came from editing the default group, and the docs say those changes affect all applications in the private space.',
      },
      {
        type: 'single',
        prompt: 'What is the best immediate action?',
        options: [
          'Restore the Allow any protocol to any destination rule in the default group, then rebuild the restrictions in custom rule groups',
          'Turn off the App-Level Egress Rules toggle while custom groups exist',
          'Add port 5701 to the private space inbound firewall rules',
          'Restart every app in the private space',
        ],
        answer: 0,
        explain: 'Restoring the original rule returns the space to its working state and keeps the feature on. In this case no custom groups exist yet, but in general the toggle deletes all custom rule groups and allows all application-level egress, so it is not a safe habit.',
      },
      {
        type: 'match',
        prompt: 'Match each app to the egress rule it needs.',
        pairs: [
          ['`prc-claims-rules` (clustered)', 'TCP to the local private network on port 5701'],
          ['`prc-claims-events` (Anypoint MQ)', 'HTTPS to the control plane domain and the MQ domain from the connector URL'],
          ['`prc-policy-sync` (Object Store v2)', 'HTTPS to the control plane domain and the regional Object Store domain'],
          ['Apps with API Manager policies', 'HTTPS to the control plane, `exchange-files` and `analytics-ingest` domains'],
        ],
        explain: 'Each is listed on the application-level egress page. Depending on your use case, API Manager can need more Anypoint Platform hostnames. All of these services also need outbound 443 at the private space level.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent design?',
        options: [
          'Keep the default group permissive or carefully minimal, and assign custom rule groups to apps on the Firewall Rules tab',
          'Build shared rule groups for platform services, clustering and partner sets, within the recommended limits',
          'Roll out new groups in a non-production space first, using the same app types',
          'Add retry handling, because DNS timing can cause intermittent connection failures',
          'Add a wildcard rule for `*.anypoint.mulesoft.com`',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Wildcard records are not supported, so each hostname must be listed. The recommended limits are 20 active rule groups, 8 domains per group and 800 groups and rules combined.',
      },
      {
        type: 'order',
        prompt: 'Order the response steps.',
        items: [
          'Link the failures to the 09:04 rule group change in the audit log',
          'Confirm that the private space firewall has not changed',
          'Restore the allow-any rule in the default group',
          'Verify Anypoint MQ, Object Store and cluster formation for each affected app',
          'Design custom rule groups, test them in non-production and assign them app by app',
        ],
        explain: 'Find the change, rule out the other layer, restore service, verify each app, and then bring the audit control back in a way that does not break platform services.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 09:06: \`prc-claims-events\` stops receiving Anypoint MQ messages, and \`prc-policy-sync\` fails on its Object Store v2 calls.
- 09:11: \`prc-claims-rules\`, which runs in cluster mode with 3 replicas, reports that it cannot form its cluster.
- Apps that call partner APIs still work. All apps show as RUNNING.

## Change / Context
- An audit finding requires tighter outbound control in private space \`prod-eu\`, on the EU control plane.
- At 09:00 a security engineer enabled **App-Level Egress Rules**. At 09:04 she edited **Default-Egress-Rule-Group**, replacing the allow-any rule with HTTPS rules for three partner domains, so that "all apps get the safe list".
- No app has been assigned a custom rule group.
- Private space firewall rules were not changed.

## Logs
\`\`\`
09:00:12 INFO  [audit] App-Level Egress Rules enabled
09:04:40 INFO  [audit] Default-Egress-Rule-Group updated: 3 rules
09:06:02 ERROR [prc-claims-events] cannot reach mq-eu-central-1.anypoint.mulesoft.com
09:06:30 ERROR [prc-policy-sync] object-store-eu-central-1.eu1.anypoint.mulesoft.com failed
09:07:15 INFO  [exp-broker-quotes] POST https://api.rates.example/v2/quote 200
09:11:04 WARN  [prc-claims-rules] Hazelcast: could not connect to member 10.60.4.21:5701
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Application-level rules and private space firewall rules are independent, and egress must pass both.',
    'Enabling the feature activates a default group that allows any protocol to any destination. Editing that group affects all apps in the private space.',
    'Clustered apps need a rule for TCP to the local private network on port 5701, or clustering fails.',
    'Anypoint MQ and Object Store v2 need rules for the control plane and their own domains, plus outbound 443 at the private space level.',
    'API Manager needs the control plane, exchange-files and analytics-ingest domains, and possibly more.',
    'Disabling the feature deletes all custom rule groups, so use it with care.',
    'Wildcards are not supported; list each domain.',
  ],
  solution: `
**Diagnosis.** Failures follow the 09:04 change, not the 09:00 toggle. Traffic to allowed partner domains works, and traffic to platform services and between replicas does not. The private space firewall is unchanged. That points to the application-level layer.

**Immediate mitigation.**
- Restore the **Allow any protocol to any destination** rule in the default group.
- Verify MQ consumption, Object Store calls and cluster formation.
- Check whether messages were redelivered during the outage, and check for duplicates.
- Tell the audit owner that the control is paused and give a date for a safe rollout.

**Root cause.** A space-wide control was treated as a partner allowlist. The default rule group applies to all apps without a custom group, and the rule set omitted the Anypoint Platform domains and the cluster port.

**Permanent fix.**
- Design custom rule groups for sets of destinations, for example \`platform-services\`, \`clustered-apps\` and \`partner-rates\`.
- For this EU space, use \`eu1.anypoint.mulesoft.com\` for the control plane, plus the MQ domain from the connector URL.
- For Object Store v2, use the regional domain, and confirm the exact value for your control plane: the Object Store REST API page lists \`object-store-eu-central-1.eu1.anypoint.mulesoft.com\`, while the egress page gives \`eu1.anypoint.mulesoft.com\` for prod-eu.
- Add TCP to the local private network on port 5701 to the group of each clustered app.
- Assign groups on the **Firewall Rules** tab, and apply changes app by app.

**Prevention.**
- Test the rule groups in a non-production private space with the same app types.
- Keep an inventory of each app's outbound dependencies, including the platform services it uses.
- Require review of any change to the default group.
- Keep to the recommended limits, and add retries for intermittent DNS timing errors.
`,
  followUps: [
    { q: 'Why did the partner call keep working?', a: 'Its domain was in the rule group, and the traffic also passed the private space firewall, which still allowed outbound traffic. Egress must pass both layers.' },
    { q: 'Can a single rule cover all Anypoint hostnames?', a: 'No. Wildcard records are not supported, and a domain does not cover its subdomains, so each hostname must be listed.' },
    { q: 'What if the outbound 443 rule was also removed at the private space level?', a: 'Then the application-level rules would not be enough. The docs require outbound 443 at the private space level for Anypoint MQ, Object Store v2 and API Manager.' },
  ],
}
