export default {
  id: 'ms-100',
  category: 'mulesoft',
  title: 'Anypoint Secrets Manager: What It Stores, Who Can Read It and What It Is Not',
  level: 'INTERMEDIATE',
  tags: ['security', 'secrets-manager', 'tls', 'certificates', 'api-manager', 'secrets'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'A developer wants to store a database password in Secrets Manager and read it from a Mule flow at runtime. What is the right answer?',
      options: [
        'Secrets Manager is not general-purpose storage: only trusted Anypoint Platform services read secret contents, and platform services cannot consume shared secrets such as passwords',
        'Add a Shared Secret and read it with a `${secret::...}` placeholder',
        'Add a Shared Secret and download it from the flow with the Secrets Manager API',
        'Store it in a Keystore entry instead',
      ],
      answer: 0,
      explain: 'The docs say it is designed for supported platform services and is not a general-purpose store. Password, symmetric key, S3 credential and blob types are defined, but platform services cannot consume them. Use secure properties or your platform\'s protected properties for app secrets.',
    },
    {
      type: 'single',
      prompt: 'A user with the **Read secrets metadata** permission opens a keystore in a secret group. What can they see?',
      options: [
        'Metadata about the secret, not the secret itself',
        'The private key in clear text',
        'The private key, but only after MFA',
        'Nothing, because only the owner can open it',
      ],
      answer: 0,
      explain: 'The public Secrets Manager service stores secrets and creates references to them. Only the internal Secrets Provider service reads the actual contents, for authorised platform services.',
    },
    {
      type: 'match',
      prompt: 'Match each secret type to what it holds.',
      pairs: [
        ['Keystore', 'Certificates with their corresponding private keys'],
        ['Truststore', 'Certificates of other parties or CAs you trust'],
        ['TLS Context', 'SSL security parameters such as TLS version and ciphers'],
        ['Certificate Pinset', 'Expected certificates pinned to clients or hosts'],
      ],
      explain: 'A TLS context ties these together: it points to a keystore and optionally a truststore, then adds the version and ciphers.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about secret groups are correct?',
      options: [
        'Secrets are stored per secret group, per environment and per business group',
        'A maximum of 25 secret groups is allowed per environment per business group',
        'Each secret group can hold a maximum of 350 secrets',
        'Access is granted secret by secret, so a user with access to an environment can be limited to one group',
      ],
      answer: [0, 1, 2],
      explain: 'Access control is at the environment level: a user with access to an environment can access all the secret groups in it. Separate sensitive material by environment or business group.',
    },
    {
      type: 'single',
      prompt: 'You want to use a stored TLS context for a Mule 4 HTTPS API proxy deployed from API Manager. Which settings does the page on HTTPS proxies call for?',
      options: [
        'Enable Secret Group Downloadable on the group, and set the TLS context target to Mule',
        'Set the TLS context target to Anypoint Security and leave the group not downloadable',
        'Use a PEM keystore, which is the only supported type for proxies',
        'Copy the keystore into the proxy application',
      ],
      answer: 0,
      explain: 'The prerequisites name both settings, and the supported keystores for the proxy TLS context are JCEKS, PKCS12 and JKS. Be aware that a downloadable group means secrets can be downloaded over public networks.',
    },
    {
      type: 'single',
      prompt: 'You set the optional **Expiration Date** on a TLS context to next March. What changes?',
      options: [
        'Only metadata of the TLS context: the expiry of the certificates in the keystore or truststore does not change',
        'The certificate is renewed automatically in March',
        'The certificate expiry is extended to March',
        'Traffic is blocked from March',
      ],
      answer: 0,
      explain: 'It is metadata. Also note that Secrets Manager accepts truststores with expired certificates, so a successful upload does not prove a certificate is valid.',
    },
  ],
  description: `
An insurer has started to use **Anypoint Secrets Manager** (Anypoint Security). Three teams have different expectations:

- The **API team** wants an HTTPS API proxy in API Manager without copying keystores into proxy projects.
- The **Runtime Fabric team** wants to keep the TLS material for inbound traffic in one place.
- A **Mule development team** wants to move all passwords and client secrets out of secure properties into Secrets Manager, and read them from flows.

Auditors also ask who can read a private key after it is uploaded, and how production secrets are kept apart from test secrets.

**Questions**
1. What is Secrets Manager designed for, and which secret types does it hold?
2. How are secrets organised, and what are the limits?
3. Who can read secret contents?
4. What do you tell each of the three teams?
`,
  answerTemplate: `## Purpose and secret types

## Organisation and limits

## Who can read what

## Advice per team
`,
  keyPoints: [
    'Secrets Manager stores keys, certificates and other secrets for supported Anypoint Platform services. It is not a general-purpose vault.',
    'Types: TLS context, keystore, truststore, certificate, certificate pinset, CRL distributor. Shared secrets (password, symmetric key, S3 credential, blob) are defined, but platform services cannot consume them.',
    'Supported TLS context uses: Runtime Fabric ingress (Runtime Fabric on VM/Bare Metal only) and API Manager.',
    'Secrets are stored per secret group, environment and business group: 25 groups per environment per business group, 350 secrets per group. Each group has its own encryption keys.',
    'Users read metadata only. The internal Secrets Provider service is the only one that reads actual secrets.',
    'Access is controlled at the environment level, with permissions such as Grant access to secrets, Manage secret groups, Read secrets metadata and Write secrets.',
    'For an HTTPS proxy: Secret Group Downloadable on, TLS context target Mule, keystore JCEKS, PKCS12 or JKS.',
  ],
  solution: `
**1. Purpose.** Secrets Manager stores and controls access to keys, certificates and other secrets so that trusted platform services can use them on your behalf. Its types are TLS context, keystore, truststore, certificate, certificate pinset and CRL distributor. Shared secrets exist as a type, but the docs say Anypoint Platform services cannot consume them.

**2. Organisation.** A secret group is a vault tied to an environment and a business group, with its own encryption keys generated and managed by Secrets Manager. Only applications deployed to that business group and environment can access its secrets. Limits: 25 secret groups per environment per business group, and 350 secrets per group. A truststore in a secret group holds up to 15 certificates.

**3. Who can read.** Two services are involved:
- **Secrets Manager**, the public service, uploads and stores secrets and creates references to them. You can read metadata, not the secret.
- **Secrets Provider**, an internal service that is not reachable from the public network, is the only one that can read the actual secret, and it hands it to supported services.

Users are authorised per environment. \`Write secrets\` allows uploads, \`Read secrets metadata\` allows browsing, and \`Manage secret groups\` allows creating and cloning groups. If you manage Runtime Fabric instances, the **Manage Runtime Fabric** permission is enough.

**4. Advice.**
- **API team:** yes. Create a group with **Secret Group Downloadable** on, add a keystore (JCEKS, PKCS12 or JKS) and a TLS context with target **Mule**, then select it in API Manager. To apply it you need **Read secrets metadata** and the **Manage API Configuration** role. Mention that a downloadable group allows download over public networks.
- **Runtime Fabric team:** yes, for Runtime Fabric on VM/Bare Metal (Appliance) ingress.
- **Mule development team:** no. Keep app secrets in Secure Configuration Properties. On CloudHub 2.0, protected application properties are a different feature: they are stored encrypted in the secrets manager, and the values cannot be viewed or retrieved by any user.

**Operational notes.** Changes to a secret apply at once and are used the next time the group is accessed or an app is deployed. The TLS context expiration date is only metadata, so keep a separate certificate expiry register. A PKCS12 file created with newer OpenSSL defaults can be rejected with \`RB-1003: invalid content\`; create it with \`keytool\` or with OpenSSL legacy settings.
`,
  followUps: [
    {
      q: 'How do you keep production secrets away from test administrators?',
      a: 'Access is controlled at the environment level, so grant Secrets Manager permissions only for the environments a person needs. Anyone with access to an environment can access every secret group in it, so do not rely on separate groups inside one environment.',
    },
    {
      q: 'Does the Insecure option on a Mule TLS context matter here?',
      a: 'Yes. When the target is Mule, you can select Insecure if you do not want certificate validation enforced. It has the same effect as insecure="true" in tls:context, so it is not for production.',
    },
    {
      q: 'What TLS version does a new TLS context use by default?',
      a: 'The Add a TLS Context page says TLS 1.3 is selected by default, and you can select TLS 1.2 to support both versions.',
    },
  ],
}
