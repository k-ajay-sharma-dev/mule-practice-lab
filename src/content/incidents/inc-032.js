export default {
  id: 'inc-032',
  category: 'incidents',
  title: 'On-Prem Mule Loses All Outbound HTTPS After a Proxy Migration',
  level: 'INTERMEDIATE',
  tags: ['proxy', 'networking', 'http', 'on-prem', 'tls'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '07:02:13.551 ERROR [sf-sync] HTTP:CONNECTIVITY ... Connect to proxy-old.corp:8080 failed: Connection refused', relevant: true, why: 'The app still points at the old proxy, which was switched off.' },
      { text: '07:02:14.020 INFO  [inventory-sync] GET http://erp.corp.internal/api/stock 200 (85 ms)', relevant: true, why: 'Internal calls (no proxy) work, so the runtime and internal network are fine; only the proxied path fails.' },
      { text: '07:30:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '07:41:20.002 ERROR [sf-sync] HTTP:CONNECTIVITY ... Proxy returned 407 Proxy Authentication Required', relevant: true, why: 'The new proxy requires credentials; Mule sends none.' },
      { text: '07:45:00.310 INFO  [scheduler] payments-reconcile next run at 08:00', relevant: false },
      { text: '08:15:44.910 ERROR [sf-sync] HTTP:CONNECTIVITY ... PKIX path building failed: unable to find valid certification path to requested target', relevant: true, why: 'TLS inspection: the proxy presents a certificate signed by the corporate root CA that the JVM truststore does not trust.' },
      { text: '08:15:45.002 INFO  [sf-sync] Retry 2/3 scheduled', relevant: false },
    ],
    questions: [
      {
        type: 'match',
        prompt: 'Match each error to its cause.',
        pairs: [
          ['Connection refused to proxy-old.corp:8080', 'Apps still configured for the decommissioned proxy'],
          ['407 Proxy Authentication Required', 'New proxy needs credentials Mule is not sending'],
          ['PKIX path building failed', 'Proxy re-signs TLS with a corporate CA the JVM does not trust'],
        ],
        explain: 'Three layers failed in turn: host, authentication, then TLS trust.',
      },
      {
        type: 'single',
        prompt: 'Why do browsers on the same server work?',
        options: [
          'They use system proxy settings and the OS trust store, which already contains the corporate CA; the JVM uses its own settings and truststore',
          'Browsers ignore certificate errors',
          'Browsers bypass the proxy',
          'Browsers use HTTP/2, which the proxy does not inspect',
        ],
        answer: 0,
        explain: 'The JVM does not pick up the OS proxy and trust settings automatically, so Mule needs explicit proxy config and a truststore that trusts the corporate CA (or no inspection).',
      },
      {
        type: 'single',
        prompt: 'What is the best way to restore service?',
        options: [
          'Set `insecure="true"` on the trust store of the TLS context on all HTTP requests',
          'Ask network to bypass TLS inspection for Salesforce and the payment gateway (or trust the corporate CA), and add proxy credentials from secure properties',
          'Remove the proxy config so Mule connects directly',
          'Roll back the proxy for the whole company',
        ],
        answer: 1,
        explain: 'Bypassing inspection for API/payment hosts is usually right anyway; credentials go in secure properties. `insecure=true` disables certificate validation and is not acceptable in production.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'proxy-config with host, port, username and secure password from properties, plus a correct nonProxyHosts list',
          'An agreed truststore strategy: managed truststore with the corporate CA, or interception excluded for pinned/mTLS endpoints',
          'Integration team on the stakeholder list for proxy changes and a pre-cutover test from a non-prod runtime',
          'Store the proxy password in plain text in the properties file for easy rotation',
        ],
        answer: [0, 1, 2],
        explain: 'Configurable, secure proxy settings, a deliberate TLS trust decision, and change management. Plain-text passwords are a security risk.',
      },
    ],
  },
  description: `
## Symptoms
- On-prem Mule 4 runtimes in the data centre call Salesforce and a payment gateway over the internet through the corporate proxy.
- Since Monday 07:00, **all outbound HTTPS** calls fail. Internal calls are fine.
- Browsers on the same servers can open the SaaS sites.

## Change / Context
- IT replaced the old proxy \`proxy-old.corp:8080\` with a new one \`webproxy.corp:3128\` which **requires authentication** and does **TLS inspection** with a corporate root CA.
- The Mule apps define proxy settings in a shared \`<http:request-connection>\` using \`<http:proxy-config><http:proxy host="..." port="..."/></http:proxy-config>\`, with values from a properties file per environment.

## Logs
\`\`\`
07:02:13.551 ERROR [sf-sync] HTTP:CONNECTIVITY ... Connect to proxy-old.corp:8080 failed: Connection refused
--- after ops changed the property to webproxy.corp:3128 and restarted ---
07:41:20.002 ERROR [sf-sync] HTTP:CONNECTIVITY ... Proxy returned 407 Proxy Authentication Required
--- after adding proxy username/password ---
08:15:44.910 ERROR [sf-sync] HTTP:CONNECTIVITY ... PKIX path building failed: unable to find valid certification path to requested target
\`\`\`

## Your tasks
1. Explain each of the three errors.
2. What do you do to restore service?
3. What is the permanent fix?
4. How do you prevent this?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Error 1: apps still point at the decommissioned proxy (connection refused).',
    'Error 2: 407 means the new proxy requires credentials; Mule\'s proxy config needs username/password (or NTLM settings) from secure properties.',
    'Error 3: TLS inspection re-signs certificates with the corporate CA, which the Mule truststore/JVM cacerts does not trust → PKIX error.',
    'Fix: trust the corporate CA (or get the SaaS hosts excluded from TLS inspection), store proxy creds securely, keep non-proxy hosts list correct.',
    'Browsers work because the OS trust store already contains the corporate CA and they use system proxy settings — the JVM does not automatically.',
    'Prevention: involve integration teams in proxy changes and test from a non-prod Mule runtime before cut-over.',
  ],
  solution: `
## Diagnosis
Three layers failed in turn:
1. **Connection refused** — the apps still used the old proxy host, which was switched off.
2. **407 Proxy Authentication Required** — the new proxy requires credentials; Mule was sending none.
3. **PKIX path building failed** — the new proxy does **TLS inspection**: it terminates TLS and presents a certificate signed by the **corporate root CA**. The JVM/app truststore doesn't trust that CA, so the handshake fails. Browsers work because the corporate CA is in the OS trust store and they use system proxy settings; the JVM uses its own.

## Immediate mitigation
Ask the network team to **bypass TLS inspection** for the integration hosts (Salesforce, payment gateway). This is usually the right answer for payment and API traffic anyway. Or add the corporate CA to the truststore used by the HTTP request configs. Store proxy credentials in **secure properties** and restart.

## Root cause
A proxy migration that changed the host, introduced authentication and TLS interception, without an impact assessment for server-side Java applications.

## Permanent fix
- \`<http:proxy-config><http:proxy host="$\{proxy.host}" port="$\{proxy.port}" username="$\{proxy.user}" password="$\{secure::proxy.password}" nonProxyHosts="$\{proxy.nonProxyHosts}"/></http:proxy-config>\` (or an NTLM proxy if required).
- Truststore strategy agreed with security: either corporate CA added to a managed truststore, or interception excluded for pinned/payment endpoints.
- Use a service account for the proxy whose password rotation is managed.

## Prevention
- Integration platform on the stakeholder list for network/proxy/firewall changes.
- Pre-cutover test from a non-prod runtime through the new proxy.
- Synthetic checks against each external dependency with alerts on HTTP:CONNECTIVITY/SECURITY spikes.
`,
  followUps: [
    { q: 'Why is TLS inspection a problem for some integrations even when the CA is trusted?', a: 'Some partners use mutual TLS or certificate pinning; a proxy that terminates TLS breaks client-certificate auth and pinning, so those hosts must be excluded from inspection.' },
    { q: 'What is nonProxyHosts for?', a: 'It lists hosts (e.g. internal domains) that should be called directly rather than through the proxy, so internal traffic does not depend on the internet proxy.' },
  ],
}
