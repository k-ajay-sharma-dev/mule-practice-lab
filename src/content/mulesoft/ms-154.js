export default {
  id: 'ms-154',
  category: 'mulesoft',
  title: 'TLS Contexts in a Private Space: Keystores, Truststores, Ciphers, DNS Targets and Client Certificates',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'tls', 'mtls', 'certificates', 'private-space', 'ingress'],
  estMinutes: 35,
  quiz: [
    {
      type: 'multi',
      detail: true,
      prompt: 'Which statements about the default `cloudhub.io` TLS context are correct?',
      options: [
        'Each private space includes it, and it cannot be removed',
        'Its certificate renews automatically and needs no action',
        'You cannot view or change its ciphers',
        'You can replace its certificate with your own',
      ],
      answer: [0, 1, 2],
      explain: 'To inspect the default ciphers in Runtime Manager, create a custom TLS context and select Customize Ciphers.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A team wants to host a customer web portal at the default `cloudhub.io` address of its app, to avoid buying a certificate. What do the docs say?',
      options: [
        'Hosting websites or other browser-facing apps on the default domain is not supported, because the parent domain is shared and cookies are not isolated between customers. Use a customer-owned vanity domain',
        'It is fine, because every private space has its own isolated cookie scope',
        'It is fine if Last-Mile Security is enabled',
        'It is supported only in shared spaces',
      ],
      answer: 0,
      explain: 'Private spaces from different customers resolve under the same parent domain, so browsers treat them as the same site. A TLS context with your own domain and DNS records keeps the app isolated.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each TLS context item to the docs.',
      pairs: [
        ['PEM keystore', 'Public certificate, private key and an optional CA path file'],
        ['JKS keystore', 'Uses TLS default values that you cannot change; the docs suggest PEM if issues appear'],
        ['Truststore', 'PEM format, and it enables client authentication for the context'],
        ['Domains offered at deployment', 'Parsed from the CN and SAN lists of the certificate'],
      ],
      explain: 'The domains in your TLS contexts are what app owners can pick on the Ingress tab. If a domain does not appear, look at the certificate first.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A new vanity domain `api.example-insurance.com` must reach apps in the private space. Where should its CNAME record point?',
      options: [
        'To the non-wildcard private space FQDN, such as `<space-id>.<region>.cloudhub.io`, or `internal-<space-id>.<region>.cloudhub.io` for internal access',
        'To the application replica IP address',
        'To the URL of one specific app',
        'To the outbound static IPs of the private space',
      ],
      answer: 0,
      explain: 'The record points at the load balancer, not at an app. The migration troubleshooting table calls out pointing at the app URL as a mistake. Your registrar might take up to 24 hours to apply the change.',
    },
    {
      type: 'single',
      prompt: 'Internal clients in the data centre must reach apps at `*.int.example.com` with no public exposure. Which DNS target do you use?',
      options: [
        'The private DNS target, reachable only from inside the private network or through a VPN or transit gateway, with static private IPs for internal DNS or allowlists',
        'The public DNS target with an allowlist',
        'The outbound static IPs',
        'The individual replica addresses',
      ],
      answer: 0,
      explain: 'Private DNS target IPs do not change during the life of the private space, so they are safe to use in internal DNS records and allowlists.',
    },
    {
      type: 'single',
      prompt: 'A public certificate in a PEM TLS context of a CloudHub 2.0 private space expires in two weeks. How do you renew it?',
      options: [
        'Delete the TLS context and create a new one',
        'Do nothing, because custom certificates renew automatically',
        'Edit the context, and replace the certificate and its key',
        'Edit the context, and replace only the private key',
      ],
      answer: 2,
      explain: 'The Domains & TLS tab has an Edit action, which needs the CloudHub Network Administrator permission. For PEM, you cannot change the private key or password unless you replace the public certificate, though you can remove and add a CA path certificate without replacing it. For JKS, you can select a different alias without replacing the keystore file. CloudHub 2.0 validates passwords against the keystore during editing. Only the default certificate renews automatically.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each store to its maximum file size.',
      pairs: [
        ['Truststore, or a JKS, JCEKS or PKCS12 keystore', '40960 bytes (40 KB)'],
        ['PEM certificate file', '4096 bytes (4 KB)'],
        ['PEM CA path certificate file', '28672 bytes (28 KB)'],
      ],
      explain: 'There is no limit on the number of client certificates in a TLS context, only on the file size. A long list of partner certificates can therefore run into the truststore limit, which is one reason to trust an issuing CA and not each certificate.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'With a truststore and Forward SSL Session in place, how does the app learn who connected?',
      options: [
        'From HTTP headers such as `x-ssl-client-verify` (SUCCESS or FAIL), `x-ssl-client-dn`, `x-ssl-issuer`, `x-ssl-client-serial` and `x-ssl-client-cert`',
        'From a Mule variable named `vars.clientCertificate`',
        'From the `http.port` property',
        'By calling Runtime Manager for each request',
      ],
      answer: 0,
      explain: 'SSL forwarding passes certificate details in request headers so the app can determine the identity. The app still has to decide what that identity may do.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A partner uses an old appliance limited to TLS 1.1, and a Mule client in another organization calling your `cloudhub.io` endpoint fails certificate validation. What do the docs tell you?',
      options: [
        'CloudHub 2.0 does not support TLS 1.0 or 1.1, and clients that must trust `cloudhub.io` certificates should add the LetsEncrypt root to their truststore',
        'TLS 1.1 can be turned on by customizing ciphers, and `cloudhub.io` certificates are self-signed',
        'TLS 1.1 is supported only on internal endpoints',
        'Both are solved by enabling Last-Mile Security',
      ],
      answer: 0,
      explain: 'The feature comparison lists TLS 1.2 and 1.3 as supported, and 1.0 and 1.1 as not supported on CloudHub 2.0. Default ciphers cover TLS 1.3 and TLS 1.2 suites.',
    },
  ],
  description: `
An insurer is preparing the ingress layer of its **CloudHub 2.0** production private space. The requirements are:

- \`portal.example-insurance.com\`: a browser-facing customer portal.
- \`api.example-insurance.com\`: public APIs for brokers, secured by a wildcard certificate for \`*.example-insurance.com\`.
- \`b2b.insurer-partners.com\`: partner APIs with client certificates, on a separate domain. About 300 partners, each with its own certificate today.
- \`*.int.example-insurance.com\`: internal APIs, reachable from the data centre only.

The security team asks how certificates are stored and renewed, and who can change them. One partner reports that its appliance supports only TLS 1.1. A developer suggests skipping the portal certificate and using the default \`cloudhub.io\` URL.

**Questions**
1. What does the default TLS context give you, and what are its limits?
2. Design the TLS contexts for these domains. Which keystore type do you prefer, and why?
3. Which DNS records and targets do you need?
4. How do you handle 300 partner certificates and pass identity to the app?
5. Describe certificate renewal and the permissions needed.
6. How do you answer the TLS 1.1 partner and the \`cloudhub.io\` suggestion?
`,
  answerTemplate: `## Default TLS context

## TLS context design

## DNS records and targets

## Client certificates

## Renewal and permissions

## Answers to the partner and developer
`,
  keyPoints: [
    'Each private space has a default cloudhub.io TLS context that cannot be removed; its certificate renews automatically and its ciphers cannot be viewed or changed.',
    'Browser-facing hosting on the default domain is not supported, because the shared parent domain does not isolate cookies between customers.',
    'A TLS context holds one keystore and an optional truststore, plus ciphers. Up to 50 custom contexts per private space.',
    'PEM keystores use a certificate, a private key and an optional CA path; JKS uses TLS defaults that cannot be changed.',
    'Truststores are PEM, and they enable client authentication. The docs describe this as partial client authentication.',
    'A CNAME points at the non-wildcard private space FQDN; private DNS targets have static private IPs and are reachable only over the private network, VPN or transit gateway.',
    'Store size is the limit for client certificates: 40 KB for a truststore, 4 KB for a PEM certificate and 28 KB for a CA path.',
    'Forward SSL Session passes certificate details in x-ssl-* headers.',
    'CloudHub 2.0 supports TLS 1.2 and 1.3, not 1.0 or 1.1.',
  ],
  solution: `
**1. Default context.** It serves \`cloudhub.io\`, renews itself and cannot be removed. Because you cannot change its ciphers and the parent domain is shared, treat it as an API endpoint for systems and not for browsers.

**2. Contexts.**
- One context for \`*.example-insurance.com\`, covering \`portal\` and \`api\`, with a subdomain per endpoint on the Ingress tab. A wildcard makes the Subdomain field available, and the \`app-name\` placeholder keeps endpoints unique.
- One context for \`b2b.insurer-partners.com\` with a truststore.
- One context for \`*.int.example-insurance.com\`.

Prefer PEM: with JKS you cannot change the TLS defaults, and the docs suggest PEM if issues appear with a JKS keystore. Before you add the truststore, read about SNI: if any custom domain in the space uses a truststore, the space rejects TLS connections that do not send SNI.

**3. DNS.** Create CNAME records to the private space FQDN for public domains, and use the private DNS target for internal domains. The internal record can use \`internal-<space-id>.<region>.cloudhub.io\` or the static private IPs.

**4. Partners.** 300 individual certificates will probably hit the 40 KB truststore limit. Prefer trusting a small number of issuing CAs, which the truststore supports, and enable **Forward SSL Session**. The app reads \`x-ssl-client-dn\` and \`x-ssl-client-verify\`, maps the identity to a partner and authorizes each request. Authentication at the edge is not authorization.

**5. Renewal.** Use **Edit** on the Domains & TLS tab with the CloudHub Network Administrator permission. For PEM, replace the public certificate and supply the key with it. Track expiry dates yourself: only the default certificate renews automatically.

**6. Answers.** TLS 1.0 and 1.1 are not supported, so the partner must upgrade or terminate through something it controls. The portal needs a vanity domain, so the developer's shortcut is not an option.
`,
  followUps: [
    { q: 'How many TLS contexts can a space have?', a: 'Up to 50 custom TLS contexts per private space, in addition to the default one.' },
    { q: 'What is the difference between these settings and Last-Mile Security?', a: 'TLS contexts secure the connection from the client to the ingress. Last-Mile Security specifies that TLS termination and decryption for the forwarded HTTPS connection happen in the application, which needs a certificate in the app and more CPU.' },
    { q: 'Can I customize endpoints in a shared space?', a: 'No. Customizing endpoints is supported only for apps in private spaces, and custom certificates and vanity domains need a private space.' },
    { q: 'Which ciphers are default?', a: 'The defaults listed include TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256 and TLS_AES_128_GCM_SHA256 for TLS 1.3, and ECDHE suites plus TLS_RSA_WITH_AES_128_GCM_SHA256 for TLS 1.2.' },
  ],
}
