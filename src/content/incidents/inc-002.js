export default {
  id: 'inc-002',
  category: 'incidents',
  title: 'TLS Handshake Failures After a Partner Rotated Its Certificate',
  level: 'BEGINNER',
  tags: ['tls', 'certificates', 'truststore', 'http'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '00:04:58.210 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '00:05:12.331 INFO  [shipping] Sending shipment 55120 to carrier corrId=c01a', relevant: false },
      { text: '00:05:12.512 ERROR [shipping] HTTP:CONNECTIVITY  Error sending HTTP request to https://api.carrier.example/v1/shipments', relevant: true, why: 'The failure happens while connecting to the carrier, before any HTTP response, so it is a connection-level (TLS) problem, not an API error.' },
      { text: '  Caused by: javax.net.ssl.SSLHandshakeException: PKIX path building failed: unable to find valid certification path to requested target', relevant: true, why: 'PKIX path building failed means our client does not trust the certificate chain the server presented.' },
      { text: '00:05:12.890 INFO  [shipping] GET https://orders-sapi.internal.example.com/orders/88120 -> 200 corrId=c01a', relevant: true, why: 'Calls to our own APIs still succeed, so the network and the app are fine; only the carrier certificate is the problem.' },
      { text: '00:05:13.020 INFO  [shipping] Sending shipment 55121 to carrier corrId=d7e3', relevant: false },
      { text: '00:05:13.190 ERROR [shipping] HTTP:CONNECTIVITY  ... SSLHandshakeException: PKIX path building failed ... corrId=d7e3', relevant: true, why: 'Every carrier call fails the same way since 00:05, right after the carrier renewed its certificate with a new CA on Sunday night.' },
      { text: '00:05:30.004 INFO  [scheduler] Poll for pending shipments: 214 found', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'Our custom truststore only holds the old carrier certificate, so the new certificate from a different CA is not trusted',
          'The carrier API is down since Sunday night',
          'A firewall rule now blocks outbound traffic from shipping-sapi',
          'Our own client certificate expired over the weekend',
        ],
        answer: 0,
        explain: '**PKIX path building failed** is a trust failure on the client side. The carrier switched CA and our truststore pins the old certificate. `curl` works because the laptop trusts public CAs, and our own APIs still work, so it is not the network or the carrier being down.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now** to restore service?',
        options: [
          'Set insecure="true" on the trust store of the TLS context until the carrier fixes it',
          'Import the verified new carrier CA chain into the truststore, redeploy and re-send the failed shipments',
          'Restart the application to clear the TLS session cache',
          'Ask the carrier to roll back to the old certificate',
        ],
        answer: 1,
        explain: 'Trust the new chain (checked against what the carrier publishes), redeploy and replay what failed. `insecure="true"` disables server verification and opens the door to man-in-the-middle attacks; a restart changes nothing.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Trust the issuing CA chain (or the default JVM truststore for a public CA) instead of pinning the leaf certificate',
          'Keep a certificate and truststore inventory with expiry alerts',
          'A synthetic check that calls the partner endpoint and alerts on handshake failures',
          'Disable hostname verification on all outbound TLS contexts',
        ],
        answer: [0, 1, 2],
        explain: 'Trusting the CA survives routine leaf renewals, and inventory plus synthetic checks catch the next change early. Disabling verification removes the security TLS is there for.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Read the PKIX error and connect it to the carrier certificate change',
          'Obtain and verify the new CA chain from the carrier',
          'Import it into the truststore and redeploy',
          'Re-send the shipments that failed since 00:05 and confirm with the business',
          'Switch to trusting the CA chain and add certificate expiry monitoring',
        ],
        explain: 'Diagnose, restore trust safely, recover the lost business data, then make the setup resilient to the next certificate change.',
      },
    ],
  },
  description: `
## Symptoms
- Since **Monday 00:05**, every call from \`shipping-sapi\` to the carrier's API fails. No orders are being sent to the carrier.
- Nothing was deployed on our side over the weekend.
- \`curl\` to the same URL from a developer laptop works fine.
- Other outbound calls from the same app (to our own APIs) work.

## Context
- The HTTP Request config for the carrier uses a **TLS context with a custom truststore** (\`carrier-truststore.jks\`) that the team created two years ago by importing the carrier's certificate.
- The carrier sent an email last month: *"We are renewing our TLS certificate on Sunday night; the new certificate is issued by a different certificate authority."*

## Logs
\`\`\`
00:05:12.331 INFO  [shipping] Sending shipment 55120 to carrier corrId=c01a
00:05:12.512 ERROR [shipping] HTTP:CONNECTIVITY  Error sending HTTP request to https://api.carrier.example/v1/shipments
  Caused by: javax.net.ssl.SSLHandshakeException: PKIX path building failed:
    sun.security.provider.certpath.SunCertPathBuilderException:
    unable to find valid certification path to requested target
00:05:13.020 INFO  [shipping] Sending shipment 55121 to carrier corrId=d7e3
00:05:13.190 ERROR [shipping] HTTP:CONNECTIVITY  Error sending HTTP request to https://api.carrier.example/v1/shipments
  Caused by: javax.net.ssl.SSLHandshakeException: PKIX path building failed ...
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now** to restore service?
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
    'Identifies that the TLS handshake fails because our truststore does not trust the carrier\'s new certificate chain (PKIX path building failed).',
    'Explains why curl works: the laptop uses the OS/default CA store, while the app uses a custom truststore containing only the old certificate.',
    'Immediate fix: add the new CA root/intermediate (from the carrier) to the truststore, redeploy, and replay/resend the failed shipments.',
    'Rejects disabling validation (insecure="true") as a fix in production.',
    'Permanent fix: trust the CA chain (or use the default JVM truststore) rather than pinning a single leaf certificate; keep truststores in secure config, not hard-coded.',
    'Prevention: certificate inventory with expiry monitoring/alerts, act on partner change notices, test against the partner\'s new cert in a lower environment before the switch.',
  ],
  solution: `
**Diagnosis.** \`PKIX path building failed ... unable to find valid certification path\` means the client (our Mule app) **does not trust the server's certificate chain**. The carrier switched to a cert from a **different CA** on Sunday night. Our TLS context uses a custom truststore that only holds the **old** carrier certificate, so the new one can't be validated. \`curl\` works because the laptop trusts public CAs from the OS store. Our own APIs still work because their certs didn't change.

**Immediate mitigation.**
1. Get the new chain (root + intermediate) from the carrier, or export it with \`openssl s_client -showcerts\` and **verify it against what the carrier publishes**.
2. Import it into \`carrier-truststore.jks\` (\`keytool -importcert\`), redeploy (or update the secure property/file).
3. Re-send the shipments that failed since 00:05 (from the error queue/logs) and confirm with the business.

Do **not** set \`insecure="true"\` on the TLS context's trust store — that disables server verification and opens the door to man-in-the-middle attacks.

**Root cause.** The truststore pinned the carrier's **leaf certificate** instead of trusting the issuing CA, and the partner's change notice wasn't acted on.

**Permanent fix.** Trust the **CA chain** (or, if the carrier uses a public CA, use the default JVM truststore). Manage truststores per environment through secure properties/secrets, not committed in the app.

**Prevention.** Keep an inventory of certificates and truststores used by each app with expiry dates and alerts (e.g. 60/30/7 days). Route partner change notices to the integration team. Test the new cert in a lower environment before the switch date. Add a synthetic check that calls the partner endpoint and alerts on handshake failures.
`,
}
