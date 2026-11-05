export default {
  id: 'inc-042',
  category: 'incidents',
  title: 'Our New Certificate Works in Browsers but Partner Integrations Fail',
  level: 'INTERMEDIATE',
  tags: ['tls', 'certificates', 'keystore', 'certificate-chain', 'http-listener'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '[change] Sat 10:00 partner-gateway-eapi keystore replaced: new-server.jks (1 entry: PrivateKeyEntry, chain length 1)', relevant: true, why: 'The new keystore holds only the leaf certificate; the intermediate CA was not imported.' },
      { text: '09:12:39.800 INFO  [partner-gateway-eapi] POST /orders 201 client=203.0.113.10 (browser-based portal)', relevant: false },
      { text: '09:12:40.012 DEBUG [partner-gateway-eapi] TLS handshake failed with client 203.0.113.44: Received fatal alert: certificate_unknown', relevant: true, why: 'The partner client rejects our certificate during the handshake.' },
      { text: 'partner (Java): javax.net.ssl.SSLHandshakeException: PKIX path building failed: unable to find valid certification path to requested target', relevant: true, why: 'Java cannot build a path to a trusted root without the intermediate.' },
      { text: 'openssl s_client: 0 s:CN = api.partners.example   i:CN = Example Public CA - Intermediate G2', relevant: true, why: 'Only depth 0 (the leaf) is sent; the intermediate is missing from the chain.' },
      { text: 'openssl s_client: Verify return code: 21 (unable to verify the first certificate)', relevant: true, why: 'OpenSSL confirms the server is not sending the chain.' },
      { text: '09:13:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is wrong with the certificate deployment?',
        options: [
          'The keystore contains only the leaf; the server does not send the intermediate CA, so strict clients cannot build the chain',
          'The new certificate is self-signed',
          'The certificate has expired',
          'The private key does not match the certificate',
        ],
        answer: 0,
        explain: 'openssl shows depth 0 only and "unable to verify the first certificate": the classic missing-intermediate symptom.',
      },
      {
        type: 'single',
        prompt: 'Why does Chrome still show a valid padlock?',
        options: [
          'Browsers cache common intermediates or fetch them via the AIA extension; Java and OpenSSL clients rely on the server sending them',
          'Chrome ignores certificate errors for public CAs',
          'Chrome uses a different port',
          'The browser path goes through a different load balancer',
        ],
        answer: 0,
        explain: 'Browser testing hides a missing intermediate, which is why it is not enough to verify a renewal.',
      },
      {
        type: 'single',
        prompt: 'What is the correct fix?',
        options: [
          'Ask every partner to import our intermediate and leaf into their truststores',
          'Rebuild the keystore so the private key entry has the full chain (leaf + intermediate), redeploy (rolling) and verify with openssl',
          'Switch the listener to plain HTTP until partners update',
          'Add the root CA to our truststore',
        ],
        answer: 1,
        explain: 'The server must present the chain. The truststore is for verifying the other side, not for what we present.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Inspect the presented chain with openssl s_client -showcerts',
          'Build a PKCS#12/JKS from key + leaf + intermediate',
          'Update the TLS context and redeploy with a rolling update',
          'Verify chain depth 1+ with openssl and a Java client',
          'Ask partners to retry and add chain checks to the renewal runbook',
        ],
        explain: 'Confirm, rebuild, deploy, verify with strict clients, then recover and prevent.',
      },
    ],
  },
  description: `
## Symptoms
- \`partner-gateway-eapi\` (Mule HTTPS listener on a dedicated load balancer that passes TLS through to Mule) got a **renewed server certificate** on Saturday.
- Since then, several partners' integrations fail with TLS errors ("unable to get local issuer certificate", "PKIX path building failed").
- Opening the URL in Chrome shows a valid padlock. \`curl\` from a Linux server fails.

## Change / Context
- The security team issued a new certificate from a public CA. The engineer created a new keystore (.jks) with **only the server certificate and private key**; the CA's intermediate certificate was not imported. The old keystore contained the full chain.
- Partners' clients are Java services, .NET services and scripts using curl/OpenSSL.

## Logs
\`\`\`
# partner (Java) side
javax.net.ssl.SSLHandshakeException: PKIX path building failed: ... unable to find valid certification path to requested target
# our side
09:12:40.012 DEBUG [partner-gateway-eapi] TLS handshake failed with client 203.0.113.44: Received fatal alert: certificate_unknown
# openssl s_client -connect api.partners.example:443 -showcerts
Certificate chain
 0 s:CN = api.partners.example   i:CN = Example Public CA – Intermediate G2
Verify return code: 21 (unable to verify the first certificate)
\`\`\`

## Your tasks
1. What is wrong with the deployment of the certificate?
2. Why do browsers still work?
3. How do you fix it?
4. How do you prevent this on the next renewal?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The server presents only the leaf certificate; clients cannot build the chain to a trusted root without the intermediate CA.',
    'openssl s_client showing a chain depth of only 0 and "unable to verify the first certificate" confirms the missing intermediate.',
    'Browsers often still work because they cache intermediates or fetch them via AIA; Java/OpenSSL clients usually do not.',
    'Fix: rebuild the keystore with the private key entry containing the full chain (leaf + intermediate(s)), redeploy, verify with openssl.',
    'Do not ask partners to add our intermediate/leaf to their truststores — the server must send the chain.',
    'Prevention: certificate renewal runbook with chain verification and expiry monitoring.',
  ],
  solution: `
## Diagnosis
The TLS server must send its certificate **plus the intermediate CA certificate(s)**; clients only have the **root** in their truststore. The new keystore contains just the leaf, so \`openssl s_client\` shows a single certificate (depth 0) and "unable to verify the first certificate". Java (PKIX) and OpenSSL-based clients cannot build a path to the root and abort the handshake. Browsers work because they cache common intermediates or download them using the certificate's AIA extension — which hides the problem during manual testing.

## Immediate mitigation
Rebuild the keystore so the **private key entry contains the full chain** (leaf → intermediate), e.g. by importing a PKCS#12 created from key + leaf + intermediate bundle. Update the listener's TLS context, redeploy (rolling) and verify with \`openssl s_client -showcerts\` that the chain now has depth 1+. Then ask partners to retry and replay failures.

## Root cause
A manual certificate renewal that imported only the leaf certificate, tested only with a browser.

## Permanent fix
- Correct keystore with full chain; keep the root out of the chain (clients already have it).
- Script the keystore build (key + cert + chain → PKCS#12/JKS) so it is repeatable.

## Prevention
- Renewal runbook: build in non-prod, verify with \`openssl s_client\` and a Java client, then promote.
- Monitor certificate expiry and use an SSL checker in the post-deploy smoke test.
- Notify partners ahead of renewals, especially if the issuing CA changes.
`,
  followUps: [
    { q: 'What is the difference between a keystore and a truststore in Mule TLS context?', a: 'The keystore holds your own private key and certificate chain that you present; the truststore holds CA certificates you trust when verifying the other side.' },
    { q: 'Why did only some clients fail?', a: 'Clients that cache or fetch intermediates (browsers, some OS stacks) could complete the chain themselves; strict clients like Java and OpenSSL rely on the server sending it.' },
  ],
}
