export default {
  id: 'ms-098',
  category: 'mulesoft',
  title: 'TLS in Mule: tls:context, Keystores, Truststores and One-Way versus Mutual TLS',
  level: 'INTERMEDIATE',
  tags: ['security', 'tls', 'mtls', 'keystore', 'truststore', 'http-listener', 'http-request', 'certificates'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'The carrier API must listen on HTTPS with one-way TLS. What is the minimum `tls:context` for the HTTP Listener?',
      options: [
        'A `tls:key-store` holding the server private key and certificate',
        'A `tls:trust-store` holding the certificates of the carriers',
        'Both a `tls:key-store` and a `tls:trust-store`',
        'No `tls:context`, because Mule uses the default Java keystore',
      ],
      answer: 0,
      explain: 'A listener needs a keystore to serve HTTPS. Java ships a default truststore but no default keystore, so nothing is implied. Adding a truststore as well is what turns this into mutual TLS.',
    },
    {
      type: 'single',
      prompt: 'An HTTP Request calls a public API whose certificate comes from a major commercial CA. The connection uses protocol HTTPS and defines no `tls:context`. What happens?',
      options: [
        'The default JVM certificates are used, so the connection normally works',
        'The application fails to deploy because HTTPS needs a `tls:context`',
        'The request silently falls back to HTTP',
        'Certificate validation is skipped',
      ],
      answer: 0,
      explain: 'The HTTP reference states that the default JVM certificates are used when no `tls:context` is defined. That default truststore includes the major CAs and is updated with Java.',
    },
    {
      type: 'single',
      prompt: 'The bank API presents a certificate signed by the bank\'s **private CA**, and the handshake fails. Which fix is right for production?',
      options: [
        'Add a `tls:trust-store` to the request configuration containing the bank\'s CA certificate',
        'Set `insecure="true"` on the `tls:trust-store`',
        'Add the bank\'s CA to the `tls:key-store`',
        'Remove `tls:context` so the default truststore is used',
      ],
      answer: 0,
      explain: 'A client trusts a server when a chain of trust reaches a certificate in its truststore. `insecure="true"` turns validation off, and the docs say never to use it in production.',
    },
    {
      type: 'match',
      prompt: 'Match each store to what it holds.',
      pairs: [
        ['Keystore on the Mule server (Listener)', 'Private key and certificate of the server'],
        ['Truststore on the Mule server (Listener)', 'Certificates of the trusted clients'],
        ['Truststore on the Mule client (Request)', 'Certificates of the trusted servers'],
        ['Keystore on the Mule client (Request)', 'Private key and certificate of the client, for mutual TLS'],
      ],
      explain: 'The rule is the same on both sides: the keystore proves who you are, and the truststore says who you believe. Having both on one side is what the docs call two-way or mutual authentication.',
    },
    {
      type: 'single',
      prompt: 'A keystore file has one password, and the private key inside it has a different one. How do you set these in a `tls:context`?',
      options: [
        '`keyPassword` for the file and `password` for the private key',
        '`password` for the file and `keyPassword` for the private key',
        '`password` for the file and `alias` for the private key',
        'Only `password`, because it opens the private key as well',
      ],
      answer: 1,
      explain: '`password` opens the keystore file, and `keyPassword` opens the private key inside it. When a keystore holds several private keys, `alias` selects one; otherwise Mule uses the first key in the file. The default store `type` is JKS, so a PKCS12 file needs `type="pkcs12"`. The HTTP reference says TLS configuration supports static configuration only, with no expressions, so use separate configurations when you need different certificates.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A developer sets `enabledCipherSuites` in `tls:context`, but the Mule administrator has not enabled those suites in `tls-default.conf`. What do the docs say?',
      options: [
        'Protocols and suites must be enabled in both the runtime and the app; otherwise the default Java environment protocols and suites are used',
        'The app setting always wins over the runtime file',
        'The runtime file is ignored unless Mule runs in FIPS mode',
        'Mule refuses to start the listener',
      ],
      answer: 0,
      explain: 'The app can only narrow what the runtime allows. So do not assume a restriction took effect: test it with a TLS scan. In FIPS mode the file is `tls-fips140-2.conf` instead.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A team generates a keystore with `keytool -genkey -alias api -keystore api.jks` and no `-keyalg`. Requests to the HTTPS listener then fail in the handshake. What does the Mule TLS page give as the cause?',
      options: [
        'Without `-keyalg` the tool uses DSA, which is not compatible with TLS 1.2, so use `-keyalg RSA` (or `EC`)',
        'JKS files cannot be used on an HTTP Listener',
        'The alias must be the same as the host name',
        'The key password must differ from the store password',
      ],
      answer: 0,
      explain: 'The page warns about exactly this. It also says to generate keystores with Java 17, because another JDK version can give an invalid keystore format error at runtime.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of a safe mutual TLS setup on the listener in order.',
      items: [
        'Generate the server keystore with an explicit key algorithm and get the certificate signed by a CA',
        'Collect the CA certificates that sign the client certificates into a truststore',
        'Define one global `tls:context` with the key store and trust store, with passwords in secure properties',
        'Reference it from the HTTPS listener connection',
        'Test with and without a client certificate, and use `-Djavax.net.debug=ssl` if the handshake fails',
      ],
      explain: 'The docs recommend configuring TLS globally and applying it to each use. `-Djavax.net.debug=ssl` logs handshakes and negotiation, so it shows which certificate, protocol or cipher caused the failure.',
    },
  ],
  description: `
A logistics company runs Mule 4 on-premises. A new integration has two TLS requirements:

- **Inbound:** 40 carriers call \`POST /shipments\` on a Mule HTTP Listener. Security wants HTTPS everywhere, and for the 12 carriers that send customs data they want **mutual TLS**.
- **Outbound:** Mule calls a bank API whose server certificate is signed by the **bank's private CA**, and the bank requires a **client certificate** from Mule. Mule also calls a public address-validation API on a commercial certificate.

In the first test environment a developer "fixed" the bank handshake error with \`insecure="true"\`. Another developer restricted cipher suites in the app, and a TLS scan still shows the old ones.

**Questions**
1. What is the difference between a keystore and a truststore, on the server side and on the client side?
2. How do you configure one-way and mutual TLS on an HTTP Listener and an HTTP Request?
3. When do you not need a \`tls:context\`, and why is \`insecure="true"\` dangerous?
4. How do protocols and cipher suites get restricted, and who controls what?
`,
  answerTemplate: `## Keystore and truststore

## One-way and mutual TLS: Listener

## One-way and mutual TLS: Request

## Defaults and insecure

## Protocols and cipher suites
`,
  keyPoints: [
    'Keystore: your private key and certificate. Truststore: the certificates you trust. A server keystore gives one-way TLS; adding a truststore gives mutual TLS.',
    'Java has a default truststore but no default keystore. HTTP Request with HTTPS and no tls:context uses the default JVM certificates.',
    'Prefer the default Java truststore unless you need a private CA: a custom truststore is yours to maintain.',
    'insecure="true" disables certificate validation. It is for prototyping only, never production.',
    'password opens the store and keyPassword opens the private key. alias picks a key when several exist. Store type defaults to JKS and algorithm to SunX509.',
    'TLS configuration is static: no expressions. Define it globally and reference it.',
    'enabledProtocols and enabledCipherSuites can only narrow what the runtime allows (tls-default.conf or tls-fips140-2.conf). If not enabled in both places, Java defaults apply.',
    'TLS 1.3 on-premises needs a JDK that supports it and is not enabled by default.',
  ],
  solution: `
**1. Stores.**

| | Server (Listener) | Client (Request) |
|---|---|---|
| Keystore | Server private key and certificate | Client private key and certificate |
| Truststore | Certificates of trusted clients | Certificates of trusted servers |

A truststore is technically also a keystore file. By convention it holds only public certificates.

**2. Configuration.**
\`\`\`xml
<tls:context name="carrierTls">
  <tls:trust-store path="tls/carrier-cas.jks" password="\${secure::tls.trust.password}"/>
  <tls:key-store path="tls/api-server.jks" keyPassword="\${secure::tls.key.password}"
                 password="\${secure::tls.store.password}"/>
</tls:context>

<http:listener-config name="carrierHttps">
  <http:listener-connection protocol="HTTPS" host="0.0.0.0" port="8443" tlsContext="carrierTls"/>
</http:listener-config>
\`\`\`
- One-way on the listener: key store only.
- Mutual on the listener: key store and trust store. The 12 customs carriers need their own listener configuration on another port, since the TLS context belongs to the listener connection, not to a path.
- The bank: an HTTP Request configuration with a trust store holding the bank's CA and a key store holding Mule's client certificate.
- The address API: HTTPS with no \`tls:context\`. The default JVM certificates cover it.

**3. Defaults and \`insecure\`.** An empty \`tls:trust-store\` also falls back to the JVM defaults. The docs advise keeping the default Java truststore because it is updated with Java, and a custom one becomes your job to update. \`insecure="true"\` means no validation: the connection is encrypted, but to whoever answered. Replace it with the bank's CA in a truststore.

**4. Protocols and ciphers.** The Mule administrator edits \`tls-default.conf\` (or \`tls-fips140-2.conf\` in FIPS mode) in \`$MULE_HOME/conf\`. The developer can then narrow that list with \`enabledProtocols\` and \`enabledCipherSuites\`, using IANA cipher names. If a value is not enabled in both places, the default Java environment values are used, which explains the scan result. TLS 1.2 is enabled on all deployment models. TLS 1.3 on-premises is supported on a JDK that has it, but is not enabled by default.

**Deployment notes.** \`path\` is loaded as a classloader resource by default. For a store outside the application on hybrid or standalone Mule, set the system property \`mule.tlsStores.filesystemLookup.enable\` to \`true\`. A \`tls:context\` can also define a revocation check: standard, a custom OCSP responder, or a CRL file.
`,
  followUps: [
    {
      q: 'How does the Mule flow learn which client connected over mutual TLS?',
      a: 'The HTTP Listener attributes include the client certificate when two-way TLS is enabled, so the flow can inspect it and apply its own authorisation. A valid certificate proves a CA signed it, not that this client may use this resource.',
    },
    {
      q: 'Why not one wildcard truststore with every public CA for the customs carriers?',
      a: 'The truststore decides who may connect. With the public CAs in it, anyone holding a certificate from those CAs passes the handshake. Keep only the CAs that issue your partner certificates, and check identity in the flow as well.',
    },
    {
      q: 'How do you debug a handshake failure?',
      a: 'Start Mule with -Djavax.net.debug=ssl. The log shows the handshake and negotiation, which tells you whether the problem is a certificate, a protocol or a cipher mismatch. Turn it off afterwards.',
    },
  ],
}
