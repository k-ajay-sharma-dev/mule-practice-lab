export default {
  id: 'inc-093',
  category: 'incidents',
  title: 'A Penetration Tester Reaches the Claims API with Another Company\'s Client Certificate',
  level: 'ADVANCED',
  tags: ['security', 'tls', 'mtls', 'dedicated-load-balancer', 'cloudhub', 'certificates', 'authorization'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '14:02:11 INFO  [dlb] 203.0.113.40 POST /claims/v1/submissions 200 ssl_client_verify=SUCCESS', relevant: true, why: 'The DLB marks the tester\'s certificate as verified and forwards the request.' },
      { text: '14:02:11 INFO  [claims-api] headers X-SSL-Client-Verify=SUCCESS X-SSL-Client-DN="CN=lab.pentest-co.example,O=PenTest Co" X-SSL-Issuer="CN=TrustBridge Issuing CA 2"', relevant: true, why: 'The DN is not a partner of the insurer, but the issuer is the CA that was uploaded to the DLB.' },
      { text: '14:02:11 INFO  [claims-api] claim CLM-55102 accepted for processing', relevant: true, why: 'The app processed the request without looking at the client identity.' },
      { text: '14:03:00 INFO  [claims-api] GET /api/health 200', relevant: false },
      { text: '14:04:27 INFO  [dlb] 198.51.100.8 POST /claims/v1/submissions 200 ssl_client_verify=SUCCESS', relevant: false },
      { text: '14:04:27 INFO  [claims-api] headers X-SSL-Client-Verify=SUCCESS X-SSL-Client-DN="CN=gw.northbroker.example,O=North Broker Ltd"', relevant: false },
      { text: '14:06:45 INFO  [runtime] claims-api worker 0 CPU 9%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the certificate of an unrelated company pass?',
        options: [
          'The DLB does trust-based validation: it accepts any certificate that chains to a CA you uploaded, and does not enforce client identity',
          'The DLB is not checking certificates at all',
          'The tester stole a partner\'s private key',
          'TLS 1.2 does not support client certificates',
        ],
        answer: 0,
        explain: 'The docs state that the DLB trusts any certificate chaining up to an uploaded root or intermediate CA, and that it does not enforce client identity. The issuer in the log is the uploaded CA.',
      },
      {
        type: 'single',
        prompt: 'What is missing in the Mule app?',
        options: [
          'An identity check: compare X-SSL-Client-DN or X-SSL-Client-Serial with the authorised partners, and treat only X-SSL-Client-Verify=SUCCESS as verified',
          'A `tls:trust-store` on the HTTP Listener so that Mule re-validates the client certificate',
          'A check that X-SSL-Issuer is present',
          'A second DLB',
        ],
        answer: 0,
        explain: 'The client certificate is validated at the DLB and is not re-validated at the API. TLS is one-way between the DLB and the API, so the app has to use what the DLB forwards.',
      },
      {
        type: 'single',
        prompt: 'What can you apply on the DLB today, before the app change is deployed?',
        options: [
          'Add the known partner addresses to the DLB allowlist in CIDR notation',
          'Upload each partner CN to the allowlist',
          'Set the private key passphrase on the DLB',
          'Change the DLB to HTTP',
        ],
        answer: 0,
        explain: 'The allowlist restricts inbound connections by IP at the load-balancer level. It works at that level only, not at the certificate CN level.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Keep an authorised-partner list of DN or serial values and check it in the app',
          'Upload a CRL so that revoked certificates are refused, if your CA publishes one',
          'Upload only the narrowest CA that issues your partner certificates, instead of a commercial CA used by many companies',
          'Add a test that uses a valid certificate from an unauthorised subject',
          'Rely on X-SSL-Client-Verify=SUCCESS alone',
        ],
        answer: [0, 1, 2, 3],
        explain: 'SUCCESS only says the chain is trusted. Identity comes from the DN or serial.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm from the logs that the DN is not a partner and that the issuer is the uploaded CA',
          'Restrict the DLB allowlist to known partner addresses',
          'Review past requests for DNs outside the partner list',
          'Deploy the identity check in the app',
          'Re-run the penetration test with an unauthorised certificate',
        ],
        explain: 'Reduce exposure first, find out whether it was already abused, then fix and prove the fix.',
      },
    ],
  },
  description: `
## Symptoms
- A penetration test reports that it could submit a claim through the broker **Claims API** using a certificate issued to its own company. No alert fired.
- Real broker traffic is unaffected.

## Change / Context
- \`claims-api\` runs on CloudHub in an Anypoint VPC, behind a **Dedicated Load Balancer (DLB)**. The architecture document says: "Brokers are authenticated with mutual TLS at the load balancer."
- To simplify onboarding, the certificate chain of the commercial CA **TrustBridge** was uploaded to the SSL endpoint, as all 45 brokers buy their certificates there.
- The Mule app has no authentication of its own, and it trusts anything the DLB forwards.

## Logs
\`\`\`
14:02:11 INFO [dlb] 203.0.113.40 POST /claims/v1/submissions 200 ssl_client_verify=SUCCESS
14:02:11 INFO [claims-api] headers X-SSL-Client-Verify=SUCCESS
                X-SSL-Client-DN="CN=lab.pentest-co.example,O=PenTest Co"
                X-SSL-Issuer="CN=TrustBridge Issuing CA 2"
14:02:11 INFO [claims-api] claim CLM-55102 accepted for processing
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
    'If a CA certificate is provided for the SSL endpoint, the DLB passes client certificate data in X-SSL-Client-Verify, X-SSL-Client-DN, X-SSL-Issuer and X-SSL-Client-Serial.',
    'The client is verified only after X-SSL-Client-Verify is SUCCESS. NONE means no certificate; FAILED means other validation problems.',
    'DLB validation is trust-based: any certificate chaining to an uploaded CA is accepted. The DLB does not enforce client identity.',
    'The certificate is not re-validated at the API, as TLS is one-way between the DLB and the API.',
    'Identity must be checked in the Mule app with X-SSL-Client-DN and X-SSL-Client-Serial.',
    'The DLB allowlist works by IP at load-balancer level only. CRLs can be added to reject revoked certificates.',
  ],
  solution: `
**Diagnosis.** The handshake and the DLB both worked as designed. The tester's certificate chains to the same commercial CA that was uploaded for the brokers. The headers show \`X-SSL-Client-Verify=SUCCESS\` with a DN that is not a broker.

**Immediate mitigation.**
- Add the brokers' addresses to the DLB allowlist in CIDR notation, as a temporary control. Check the limits first: up to 240 entries with inbound HTTP mode Off, and 120 with On or Redirect.
- Search past logs for DNs outside the broker list, to learn whether the gap was used.

**Root cause.** The design treated "a trusted CA signed it" as "this is one of our brokers". The docs say the DLB only verifies that the certificate is valid and that a trusted CA signed it. Authentication happened, but authorisation was never built.

**Permanent fix.** In \`claims-api\`, reject the request unless \`X-SSL-Client-Verify\` is exactly \`SUCCESS\` and the DN or serial belongs to an authorised broker. The flow problem on DLB client identity shows this design. Keep the list in a database or configuration that onboarding can update. Then:
- Prefer a narrower CA where you can: if you run a private issuing CA for brokers, only your own certificates pass the chain check.
- Add a CRL. All CRL files go in one unencrypted, PEM-encoded file, supplied with \`--crl\` when the load balancer is created or through the CloudHub API for an existing one.

**Things to verify.** The Reserved Headers page says some headers cannot be overwritten, but the \`X-SSL-*\` headers are not in that list. It only says the DLB forwards them, so the docs do not state how a client-sent \`X-SSL-*\` header is treated. Test it. Also close the direct paths: the Architecture page says each app must listen on port 8091 or 8092 if its default domain must not be publicly exposed. It also describes reaching a worker directly through the \`mule-worker-<app>\` hostname. A request that reaches the worker directly, or that forges these headers, would defeat the check.

**Prevention.** Add a negative test for each mutual TLS API: a valid certificate from a subject that is not authorised must be refused. Write down in the design where authentication ends and authorisation begins.
`,
  followUps: [
    {
      q: 'Is traffic from the DLB to the worker encrypted?',
      a: 'By default the DLB listens on HTTPS and talks to the worker over HTTP. If the app listens on HTTPS, set the mapping rule protocol (upstreamProtocol) to https, using port 8092. It is one-way TLS either way. The create page also lists a Forward Client Certificate option that forwards the client certificate to the worker, without saying how, so test it before relying on it.',
    },
    {
      q: 'What changes on CloudHub 2.0?',
      a: 'The CloudHub 2.0 migration docs map this to mutual TLS at private space level, with TLS contexts and truststores. Enable Forward SSL Session in the TLS context if apps need the client certificate information through headers.',
    },
    {
      q: 'Could the Mule app run mutual TLS itself?',
      a: 'Not behind this DLB, because TLS between the DLB and the API is one-way. The app can only use what the DLB forwards.',
    },
  ],
}
