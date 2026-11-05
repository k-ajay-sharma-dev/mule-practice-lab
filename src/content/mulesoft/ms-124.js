export default {
  id: 'ms-124',
  category: 'mulesoft',
  title: 'CloudHub 2.0 Ingress and TLS: Shared or Private Space, Endpoints, Path Rewrite and Last-Mile Security',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'deployment', 'ingress', 'tls', 'private-space', 'last-mile-security'],
  estMinutes: 35,
  quiz: [
    {
      type: 'multi',
      prompt: 'Which requirements rule out a CloudHub 2.0 shared space and need a private space?',
      options: [
        'A vanity domain such as `api.example.com`',
        'A custom certificate',
        'A VPN or Transit Gateway attachment to the data centre',
        'Static application source IP addresses',
        'Running more than one replica of an app',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Single-tenancy and private endpoints also need a private space. A shared space suits apps that can use `cloudhub.io`, need no custom certificates and need no connection to a data centre.',
    },
    {
      type: 'single',
      prompt: 'An internal HR API on a private space must never be reachable from the internet. What is the documented way?',
      options: [
        'Remove the external endpoint and use the internal endpoint, which is reachable only within the private network, VPN or Transit Gateway',
        'Delete the internal endpoint and keep the external one',
        'Rename the app to start with `internal-`',
        'Set the log level to ERROR on the Ingress tab',
      ],
      answer: 0,
      explain: 'Two endpoints are created by default. You can delete the external one, while the internal one cannot be modified or deleted.',
    },
    {
      type: 'single',
      prompt: 'Clients call `my-app.example.com/api`, but the HTTP Listener in the app expects `/v1/api`. What goes on the Ingress tab?',
      options: [
        'Path `/api` and path rewrite `/v1/api`',
        'Path `/v1/api` and path rewrite `/api`',
        'Path `/` and a DLB mapping rule',
        'Nothing, because ingress matches on the longest common suffix',
      ],
      answer: 0,
      explain: 'The path is where clients reach the app; the path rewrite is the base path the listener expects. Each endpoint URL can have its own path rewrite.',
    },
    {
      type: 'single',
      prompt: 'Security requires traffic to stay encrypted from the ingress layer to the app. What must be done?',
      options: [
        'Enable Last-Mile Security on the Ingress tab, and configure the app to listen on HTTPS with a certificate',
        'Nothing, because the load-balancing service forwards HTTPS by default',
        'Enable Last-Mile Security only; the app can keep its HTTP listener',
        'Change the listener to port 8082 and leave Last-Mile Security off',
      ],
      answer: 0,
      explain: 'By default the service forwards traffic over HTTP. The HTTPS listener still uses `${http.port}`. The migration troubleshooting steps also say to enable Last-Mile Security only when the app has a TLS context.',
    },
    {
      type: 'single',
      prompt: 'A partner sends a client certificate, and the app needs its details. Where is this configured?',
      options: [
        'mTLS in the TLS context and truststore of the private space, with Forward SSL Session so the app receives the certificate information through headers',
        'In a keystore inside the app only, with no private space setting',
        'In a DLB mapping rule',
        'In a firewall rule on the private space',
      ],
      answer: 0,
      explain: 'Client certificate validation sits at the private space level. The `forwardSslSession` setting is the deployment equivalent of Forward SSL Session.',
    },
    {
      type: 'match',
      prompt: 'Match each CloudHub 2.0 limit to its value.',
      pairs: [
        ['Read-request timeout (hardcoded)', '300 seconds'],
        ['Read-response timeout in private spaces (configurable up to)', '3600 seconds'],
        ['Maximum HTTP request size', '1 GB'],
        ['Maximum ingress URI size', '8 KB'],
        ['Custom TLS contexts per private space', '50'],
      ],
      explain: 'The read-request timeout covers receiving the full request from the client. The read-response timeout covers waiting for the Mule app, and it is configurable only in private spaces.',
    },
    {
      type: 'single',
      prompt: 'A TLS context truststore with hundreds of partner certificates is rejected. What is the documented limit?',
      options: [
        'There is no limit on the number of client certificates, but the truststore file has a maximum size of 40960 bytes (40 KB)',
        'A TLS context can hold at most 10 client certificates',
        'A truststore file can be at most 350 MB',
        'A TLS context cannot have a truststore',
      ],
      answer: 0,
      explain: 'The limit is on the store file size. Each TLS context can reference one keystore and one truststore.',
    },
  ],
  description: `
A healthcare group is placing three new applications on **CloudHub 2.0**:

- **public-status-api**: public, no custom domain, no on-premises access.
- **partner-claims-api**: partners call \`claims.health-example.com/api\` with client certificates. The listener in the app expects \`/v1/api\`, and the app must know which partner called. Security demands encryption all the way to the app.
- **hr-lookup-api**: reachable only from the corporate network over the Transit Gateway.

A long-running report in \`partner-claims-api\` takes eight minutes to respond, and partners upload documents of up to 600 MB.

**Questions**
1. Which space does each app need?
2. How do you configure endpoints and paths?
3. How do TLS contexts, mTLS and Last-Mile Security fit together?
4. Which ingress limits apply to the report and the uploads?
`,
  answerTemplate: `## Shared or private space

## Endpoints and paths

## TLS, mTLS and Last-Mile Security

## Ingress limits
`,
  keyPoints: [
    'Private spaces are required for vanity domains, custom certificates, VPN or Transit Gateway, private endpoints, static source IPs and single-tenancy.',
    'Customised endpoints are available only in private spaces, and an administrator must set up the TLS contexts first.',
    'An app gets an external and an internal endpoint; the external can be removed, the internal cannot.',
    'Path is what clients call; path rewrite is what the listener expects.',
    'Default forwarding to the app is HTTP; Last-Mile Security plus an HTTPS listener encrypts that hop.',
    'mTLS uses TLS contexts and truststores; Forward SSL Session passes client certificate information in headers.',
    'Read-request timeout is 300 seconds (hardcoded); read-response timeout goes up to 3600 seconds in private spaces; request size limit is 1 GB.',
  ],
  solution: `
**1. Spaces.**
- \`public-status-api\`: a shared space is enough, since it can use \`cloudhub.io\`.
- \`partner-claims-api\`: private space, for the vanity domain and custom certificates.
- \`hr-lookup-api\`: private space, for the Transit Gateway.

**2. Endpoints and paths.** An administrator sets up the TLS context with the domain. On the Ingress tab of \`partner-claims-api\`, select the domain, then set path \`/api\` and path rewrite \`/v1/api\`. Placeholders such as \`app-name\` keep endpoint names unique. For \`hr-lookup-api\`, remove the external endpoint and use the internal one.

**3. TLS.** Each private space has at least one certificate. The TLS context holds one keystore and one truststore.
- **mTLS**: at private space level, through the TLS context and truststore. Enable **Forward SSL Session** so the app gets the client certificate information through headers.
- **Last-Mile Security**: the service forwards HTTP by default. Enable the setting on the Ingress tab and configure the listener with HTTPS on \`$\{http.port}\`.

**4. Limits.**
- The eight-minute report waits on the response, so it needs the read-response timeout raised in the private space advanced settings (up to 3600 seconds).
- The 600 MB upload is under the 1 GB request limit, but the whole request must arrive within the hardcoded 300-second read-request timeout. So a slow partner link can be a problem. Measure it.
`,
  followUps: [
    { q: 'Can you customise endpoints on a shared space?', a: 'No. CloudHub 2.0 supports customising endpoints only for apps deployed to private spaces.' },
    { q: 'Why might a POST with no body be rejected at ingress?', a: 'The limits page says content-length must be included in POST requests, even when the value is 0.' },
    { q: 'Does a rolling update need spare capacity?', a: 'Yes. Rolling updates replicas incrementally and needs one additional replica worth of resources. Recreate terminates replicas first, redeploys faster and needs no extra resources, but it does not keep the app available.' },
  ],
}
