import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-087',
  category: 'architecture',
  title: 'TLS Hop by Hop: Partner Mutual TLS at a Dedicated Load Balancer Through to a Private-CA Backend',
  level: 'ADVANCED',
  tags: ['security', 'tls', 'mtls', 'dedicated-load-balancer', 'cloudhub', 'certificates', 'api-led'],
  estMinutes: 40,
  diagram: {
    task: 'draw the path of a partner request through a load balancer doing mutual TLS, then Experience, Process and System APIs, out to a legacy system that uses a private CA and to a third-party API that needs a client certificate.',
    checks: [
      { label: 'Partners connect to the load balancer, which is where mutual TLS ends', rule: { type: 'edge', from: 'partner', to: { type: 'load-balancer', label: ['mtls', 'mutual', 'client cert'] } } },
      { label: 'Partners cannot reach the Experience API directly', rule: { type: 'no-edge', from: 'partner', to: 'experience-api' } },
      { label: 'The load balancer forwards to the Experience API', rule: { type: 'edge', from: 'load-balancer', to: 'experience-api' } },
      { label: 'The request goes through a Process API to a System API', rule: { type: 'path', from: 'experience-api', to: 'system-api', via: 'process-api' } },
      { label: 'The legacy system is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The third-party API is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Partner traffic reaches the legacy system end to end through the load balancer', rule: { type: 'path', from: 'partner', to: 'legacy', via: 'load-balancer' } },
    ],
    reference: diagram(
      {
        par: ['partner', 'Reinsurers (client certificates)'],
        lb: ['load-balancer', 'Dedicated Load Balancer: mutual TLS, CA list, CRL, allowlist'],
        exp: ['experience-api', 'exp-reinsurance (HTTPS, reads X-SSL headers)'],
        prc: ['process-api', 'prc-treaties (HTTPS)'],
        sl: ['system-api', 'sys-policy-admin (truststore: private CA)'],
        sb: ['system-api', 'sys-sanctions (keystore: client certificate)'],
        leg: ['legacy', 'Policy admin (private CA certificate)'],
        ext: ['external-api', 'Sanctions screening service'],
      },
      ['par -> lb', 'lb -> exp', 'exp -> prc', 'prc -> sl', 'prc -> sb', 'sl -> leg', 'sb -> ext'],
    ),
  },
  description: `
An insurer exposes a **Reinsurance API** to 25 reinsurers. Apps run on CloudHub in an Anypoint VPC, behind a **Dedicated Load Balancer (DLB)**. The security standard says:

1. Partners authenticate with **client certificates**.
2. Traffic must be encrypted on **every hop**, including inside the VPC.
3. The legacy **policy admin** system has a certificate from the insurer's **private CA**.
4. A third-party **sanctions screening** service requires a **client certificate** from the caller.
5. Only TLS 1.2 or later is acceptable, and each certificate needs a named owner and an expiry alert.

An earlier design said "TLS is handled at the load balancer", and nobody could say which certificate lives where. A previous project lost a day because a certificate was uploaded with no intermediate, and another used \`insecure="true"\` in production.

**Questions:**
- Draw the request path.
- For each hop, who is the TLS client, who is the server, and which keystore or truststore is needed?
- What exactly does mutual TLS at the DLB prove, and what must the app still do?
- How are the DLB certificates prepared?
- How do you manage expiry and a possible move to CloudHub 2.0?
`,
  answerTemplate: `## Request path

## TLS per hop

## What mutual TLS proves

## Preparing DLB certificates

## Lifecycle and CloudHub 2.0
`,
  keyPoints: [
    'Each hop is a separate TLS session with its own client, server and stores. TLS ends at the DLB, and a new session starts behind it.',
    'The DLB validates the client certificate and passes X-SSL headers. TLS between the DLB and the API is one-way, and the certificate is not re-validated at the API.',
    'The DLB talks to workers over HTTP by default. For HTTPS, set the mapping rule protocol to https, and the app listens on port 8092.',
    'DLB validation is trust-based, so the app must check DN or serial, with X-SSL-Client-Verify equal to SUCCESS.',
    'DLB certificates: one unencrypted PEM file with the chain in order, and a passphrase-less private key file. The root is not needed.',
    'Private CA backend: a tls:trust-store on that HTTP Request, never insecure="true". The third party: a tls:key-store on that HTTP Request.',
    'The default Java truststore is fine for public CAs, and custom truststores must be maintained by you.',
    'Keep a certificate register. On CloudHub 2.0, mutual TLS moves to TLS contexts and truststores in the private space.',
  ],
  solution: `
**TLS per hop.**

| Hop | Client | Server | What is needed |
|---|---|---|---|
| Reinsurer to DLB | Reinsurer | DLB | Server certificate and key on the SSL endpoint, CA certificates for client validation, optional CRL |
| DLB to \`exp-reinsurance\` | DLB | Mule | Mapping rule protocol \`https\`; listener on 8092 with a \`tls:key-store\`. One-way |
| \`exp\` to \`prc\` to \`sys\` | Calling Mule app | Called Mule app | Listener keystore. The caller needs a truststore if the certificate is not from a public CA |
| \`sys-policy-admin\` to legacy | Mule | Legacy | \`tls:trust-store\` with the private CA on that HTTP Request |
| \`sys-sanctions\` to third party | Mule | Third party | \`tls:key-store\` with the client certificate. Default JVM truststore if the third party has a public CA |

**What mutual TLS proves.** The DLB accepts a client certificate if it is in the uploaded list or was signed by any uploaded CA. It does not enforce client identity. The app reads \`X-SSL-Client-Verify\`, \`X-SSL-Client-DN\` and \`X-SSL-Client-Serial\`, requires \`SUCCESS\`, and compares the DN or serial with the authorised list. The certificate is not re-validated at the API, because TLS is one-way between the DLB and the API. So also confirm that traffic cannot reach the app without passing the DLB.

**Preparing DLB certificates.**
- One unencrypted, PEM-encoded file with the entire chain in order: primary, then intermediate. The root is not needed. A missing intermediate is the classic cause of "works in a browser, fails for partners".
- A separate private key file with no passphrase. Treat that file with great care, as it is unprotected.
- If it was created with Windows tools, remove Bag Attributes and Key Attributes, and convert line endings from \`\\r\\n\` to \`\\n\`.
- Client CA certificates in a single PEM file. Certificates in a chain must be concatenated.
- CRLs concatenated into one PEM file, added with \`--crl\` on creation or through the CloudHub API.
- Cipher suites are managed through the CloudHub API. An allowlist of partner addresses adds a second layer.

**App-side TLS.** Define each \`tls:context\` globally, with passwords in secure properties, and set \`enabledProtocols\` where the standard needs it. Remember that the app can only narrow what the runtime allows. Never use \`insecure="true"\`.

**Lifecycle.** Keep a register of every certificate: where it is, its owner, its expiry, and how to renew it. Alert 60 and 30 days ahead. Plan overlap for partner certificates, and add the new CA before the old one ends.

**CloudHub 2.0.** The migration docs map DLB client certificate validation to mutual TLS at private space level, with TLS contexts and truststores. Use **Forward SSL Session** if apps need certificate information through headers. Use **Last-Mile Security** for TLS between ingress and the app, which requires the app to include a certificate and uses more CPU.
`,
  followUps: [
    {
      q: 'Does the app need to trust the DLB?',
      a: 'The DLB is the TLS client on that hop and the Mule app is the server, so the app presents its certificate. The docs say this hop is one-way, so the app does not validate a certificate from the DLB.',
    },
    {
      q: 'Why not end TLS at the DLB and use HTTP inside the VPC?',
      a: 'That is the default, and some teams accept it. This standard asks for encryption on every hop, and it also protects against anyone who can see traffic inside the network. The cost is certificates to manage and extra CPU.',
    },
    {
      q: 'How do you debug a failed hop?',
      a: 'Work one hop at a time. For a Mule client or server, start with -Djavax.net.debug=ssl to see the handshake. Identify which session fails before changing any certificate.',
    },
  ],
}
