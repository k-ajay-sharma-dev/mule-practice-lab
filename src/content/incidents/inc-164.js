export default {
  id: 'inc-164',
  category: 'incidents',
  title: 'Calls to a Legacy Clearing Gateway Fail After a Hybrid Runtime Moves From Mule 4.9 to 4.13: TLS 1.0 and 1.1 Are Gone',
  level: 'ADVANCED',
  tags: ['deployment', 'tls', 'upgrade', 'hybrid', 'on-prem', 'release-channels', 'environments', 'finance'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-21 02:15:10 INFO  [change] node1: upgrade-tool completed: Mule 4.9.x -> 4.13.x', relevant: true, why: 'The runtime crossed the Mule 4.10 line, where support for TLS 1.0 and 1.1 was removed.' },
      { text: '2026-11-21 02:30:44 INFO  [prc-settlement] Application started, DEPLOYED', relevant: false },
      { text: '2026-11-21 06:00:03 ERROR [prc-settlement] HTTP:CONNECTIVITY javax.net.ssl.SSLHandshakeException: No appropriate protocol (protocol is disabled or cipher suites are inappropriate), host clearing-gw.partner.example:8443', relevant: true, why: 'Illustrative line: the handshake fails before any HTTP exchange, on the one endpoint that offers an old protocol.' },
      { text: '2026-11-21 06:00:03 WARN  [prc-settlement] Reconnection attempt 1/3 for clearing-gw.partner.example', relevant: false },
      { text: '2026-11-21 06:00:41 INFO  [prc-settlement] sys-accounts call OK (TLSv1.3, 78 ms)', relevant: true, why: 'Other TLS endpoints work, so trust stores and the app are healthy in general.' },
      { text: '2026-11-21 06:12:18 INFO  [network] openssl s_client -tls1_2 clearing-gw.partner.example:8443: handshake failure; -tls1_1: Protocol TLSv1.1, Cipher AES256-SHA', relevant: true, why: 'The partner endpoint negotiates TLS 1.1 only, which Mule 4.10 and later no longer support.' },
      { text: '2026-11-21 06:13:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause?',
        options: [
          'Mule 4.10 removed support for TLS 1.0 and 1.1, and the clearing gateway only offers TLS 1.1',
          'The partner\'s certificate has expired',
          'The Mule Upgrade Tool corrupted the truststore',
          'The Runtime Manager agent is blocking the port',
        ],
        answer: 0,
        explain: 'Other endpoints work and the failing endpoint negotiates only TLS 1.1. The Edge and LTS page states the removal, and warns that it can break existing apps.',
      },
      {
        type: 'single',
        prompt: 'Why did this not happen automatically on the company\'s CloudHub 2.0 apps?',
        options: [
          'Apps on Mule 4.9 or earlier are not auto-upgraded to 4.10 or later because of this TLS change; on Hybrid Standalone the upgrade was the team\'s own action',
          'CloudHub 2.0 still supports TLS 1.0 in all Mule versions',
          'CloudHub 2.0 apps cannot call partners',
          'Auto-upgrades are not available at all on CloudHub 2.0',
        ],
        answer: 0,
        explain: 'Hybrid Standalone has no auto-upgrade, and so no platform safeguard either: an upgrade tool run crosses the line whenever you decide.',
      },
      {
        type: 'single',
        prompt: 'Settlement must run today and the partner cannot change for weeks. What is the safest documented way to restore service?',
        options: [
          'Roll back to the previous Mule version with the `rollback` subcommand of the Mule Upgrade Tool, then verify the gateway call',
          'Add TLSv1.1 to `enabledProtocols` in `tls:context`',
          'Turn off certificate validation',
          'Switch the runtime to FIPS mode',
        ],
        answer: 0,
        explain: 'Rollback to the previously used version is a documented action for Hybrid Standalone, and the subcommand works only after a successful upgrade with the tool. An app can only use protocols that the runtime allows, and support for this one was removed. Turning off validation would not help the protocol issue and would weaken security.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix and prevention?',
        options: [
          'Agree a date with the partner to support TLS 1.2 or later',
          'Inventory the TLS versions of every outbound and inbound endpoint before crossing a runtime line',
          'Test upgrades in non-production against real or equivalent legacy endpoints',
          'Read the lifecycle and release notes for the target version, not just the patch list',
          'Stay on Mule 4.9 forever',
        ],
        answer: [0, 1, 2, 3],
        explain: '4.9 LTS has Standard Support until August 2027, which gives time, but it does end. Treat the partner fix as a project with an owner.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm that the failure is limited to one endpoint and is a handshake failure',
          'Test which protocols the endpoint offers',
          'Decide with the business whether to roll back',
          'Stop the node and roll back with the upgrade tool, on every node if clustered',
          'Run settlement and reconcile the failed run',
          'Open the partner remediation and add a TLS inventory check to the upgrade process',
        ],
        explain: 'Evidence comes first, then a controlled rollback. On a cluster, keep Mule, agent and Java versions the same across nodes when the work ends.',
      },
    ],
  },
  description: `
## Symptoms
- Saturday 06:00: the morning settlement run fails. Every call from \`prc-settlement\` to the partner's **clearing gateway** fails with a TLS handshake error.
- All other outbound HTTPS calls work. Mule started normally, and the app shows as deployed.

## Change / Context
- On Friday night the team upgraded a hybrid server from Mule 4.9 to the latest version, 4.13, "to stay current". The Java version stayed at 17, and its security settings were not changed: they had been relaxed long ago so that this partner could connect.
- Apps were not changed. The test environment points to a mock of the clearing gateway, because the partner offers no test system.
- The partner says its gateway hardware is scheduled for replacement next quarter.
- The team's CloudHub 2.0 apps, also on 4.9, are unaffected.

## Logs
\`\`\`
02:15:10 INFO  [change] node1: upgrade-tool completed: Mule 4.9.x -> 4.13.x
06:00:03 ERROR [prc-settlement] javax.net.ssl.SSLHandshakeException: No appropriate protocol
         (protocol is disabled or cipher suites are inappropriate), host clearing-gw.partner.example:8443
06:00:41 INFO  [prc-settlement] sys-accounts call OK (TLSv1.3, 78 ms)
06:12:18 INFO  [network] openssl s_client -tls1_2: handshake failure; -tls1_1: Protocol TLSv1.1
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
    'Mule 4.10 removed support for TLS 1.0 and 1.1. The docs warn that this can cause compatibility issues and break existing apps.',
    'The evidence is one failing endpoint, a handshake error, and an endpoint that negotiates only TLS 1.1.',
    'Apps on CloudHub and CloudHub 2.0 at 4.9 or earlier are auto-upgraded no further than the 4.9 line for this reason.',
    'Hybrid Standalone has no auto-upgrade, so nothing stops you crossing the line.',
    'Rollback to the previous version is available on Hybrid with the Mule Upgrade Tool.',
    'A `tls:context` can only use protocols and suites that the runtime configuration or defaults include.',
    'A mock in the test environment hid the partner\'s real TLS version.',
    'Moving to 4.13 also moves the server onto an Edge version with a shorter support window than 4.9 LTS.',
  ],
  solution: `
**Diagnosis.** A failure limited to one endpoint rules out a general truststore or network problem. The failure is at the handshake, before any HTTP response. A direct test shows the endpoint fails with TLS 1.2 and succeeds with TLS 1.1. The upgrade crossed Mule 4.10, which removes TLS 1.0 and 1.1. The exact exception text is illustrative, so rely on the protocol test.

**Immediate mitigation.**
- With the business, decide on rollback. Settlement is time-critical and the partner cannot change today.
- Roll back with the Mule Upgrade Tool's \`rollback\` subcommand, which restores the backup in \`$MULE_HOME/.upgrade-tool-backup\`. The docs require a stopped instance for an upgrade and do not state this for a rollback, so stop the instance first.
- If the server is in a cluster, plan the rollback for all nodes: every node must be rolled back to the same Mule version, and nodes must share agent and Java versions.
- Rerun settlement and reconcile.
- Check Anypoint Monitoring afterwards: the agent may need reinstalling after this kind of work.

**Root cause.** A minor version line with a security removal was treated as routine. Only a mock was used in test, so the old protocol was invisible. Nobody held an inventory of partner TLS versions.

**Permanent fix.**
- Work with the partner to support TLS 1.2 or later. Their replacement is planned next quarter, so give it a tracked date.
- Consider a controlled intermediary only if the risk owner accepts it and it is documented. It moves the weak link rather than removing it.
- Once the partner is ready, upgrade again.
- Choose the target deliberately. 4.13 is an Edge version with Standard Support to March 2027, while 4.9 LTS has Standard Support to August 2027.

**Prevention.** Keep a TLS inventory per endpoint and review it before crossing a line. Test real protocol behaviour, for example with a stand-in configured for the same protocol. Read the Edge and LTS page and release notes at planning time.
`,
  followUps: [
    {
      q: 'Can you re-enable TLS 1.1 in tls-default.conf on Mule 4.13?',
      a: 'Do not rely on it. The docs say Mule 4.10 removes support for TLS 1.0 and 1.1. Ask MuleSoft Support before any attempt, and do not present it as a fix.',
    },
    {
      q: 'What about the -Drtf.allow.TLSv1.0+ argument in Runtime Fabric notes?',
      a: 'That note belongs to a 2021 security fix that disabled those versions by default on Runtime Fabric. It predates the Mule 4.10 removal, so verify it for your version rather than assume it still works.',
    },
    {
      q: 'Would the same upgrade be blocked on Runtime Fabric?',
      a: 'No automatic upgrade happens there either: MuleSoft does not upgrade Runtime Fabric apps without customer action, so a team that chooses a 4.10 or later version takes on the same risk.',
    },
    {
      q: 'How would you find endpoints at risk before the upgrade?',
      a: 'List every `tls:context` and HTTPS target from configuration, test each with explicit protocol versions from the runtime network zone, and search for `enabledProtocols` values below TLS 1.2.',
    },
  ],
}
