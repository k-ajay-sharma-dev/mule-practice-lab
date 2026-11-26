export default {
  id: 'ms-318',
  category: 'mulesoft',
  title: 'Authenticating to Cloud Mail From Mule: Basic Auth Retirement, OAuth and API Based Sending',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'oauth', 'authentication', 'cloud-mail', 'security'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule app has sent alerts through a cloud provider SMTP endpoint with a mailbox password for years. One morning every Send fails with 535 authentication unsuccessful. The password is unchanged and the mailbox still signs in on the web. What is the likely cause?',
      options: [
        'The password expired overnight, and the web sign in still uses an old session',
        'The truststore in the TLS context expired, so the relay refuses the login',
        'The provider turned off basic auth for SMTP in the tenant, so it needs OAuth now',
        'The relay moved submission to port 465, so a login on port 587 is refused',
      ],
      answer: 2,
      explain: 'Large cloud mail providers are retiring basic auth for SMTP and IMAP in favour of OAuth, and a 535 reply on a correct password is the usual sign. Check the provider notices for your tenant. Dates and exceptions differ. A certificate problem fails the TLS handshake before any login, and a closed port fails the connection, not the authentication. An expired password would also block a fresh web sign in.',
    },
    {
      type: 'single',
      prompt: 'Which OAuth grant fits a Mule app that sends mail with no user present?',
      options: [
        'Authorization code, with a user login each time the job runs',
        'Client credentials, with the app given only the mail rights it needs',
        'Implicit grant, which returns a token without a client secret',
        'Resource owner password, using the service mailbox login',
      ],
      answer: 1,
      explain: 'The app is registered in the identity provider. Limit the app to the one mailbox it sends from, where the provider allows that scoping.',
    },
    {
      type: 'single',
      prompt: 'The app has a fresh OAuth token for the right mailbox. The SMTP trace shows AUTH LOGIN with the token sent as the password, and the relay answers 535. What is wrong?',
      options: [
        'The token belongs in an HTTP Authorization header sent before the SMTP session',
        'The token must travel in a custom X-Auth header added to each message',
        'The user name must be left empty, so the relay reads the password as a token',
        'The token must go through the SASL XOAUTH2 mechanism, not as an AUTH LOGIN password',
      ],
      answer: 3,
      explain: 'SMTP and IMAP take an OAuth token through the SASL XOAUTH2 mechanism, which carries the user and the bearer token. AUTH LOGIN expects a password, so the relay rejects the token there, with or without a user name. SMTP has no HTTP headers before the session, and message headers are not read for login. The client must support XOAUTH2. Check that your Email connector version does, or use another route.',
    },
    {
      type: 'single',
      prompt: 'The Email connector version in use cannot do OAuth for the provider. What is a common alternative?',
      options: [
        'Keep basic auth and ask the provider for a permanent exception',
        'Send through the provider mail API over HTTPS with an OAuth token',
        'Drop the mails as files on the provider’s SFTP server to be sent',
        'Send from a personal account that still has basic auth enabled',
      ],
      answer: 1,
      explain: 'The HTTP connector or an OAuth module gets the token. API based sending also gives clearer errors and limits. The cost is provider lock in.',
    },
    {
      type: 'multi',
      prompt: 'What should be in place for the app credentials?',
      options: [
        'Client secret or certificate in secure properties or a vault, per environment',
        'A rotation plan before the secret expires, with an alert ahead of time',
        'One shared secret across all environments, so rotation happens once',
        'Least rights: send as one service mailbox only',
        'A long lived access token in secure properties instead of a client secret',
        'Tenant wide send rights, so one app registration serves every team',
      ],
      answer: [0, 1, 3],
      explain: 'A secret per environment in secure storage, a rotation plan with an early alert, and rights to one mailbox keep the damage small. Shared secrets across environments let test apps send as production. Access tokens expire, often within an hour, so the app must get new ones with its secret or certificate. Tenant wide rights let a leaked secret send as anyone.',
    },
    {
      type: 'single',
      prompt: 'Tokens expire after about an hour. What should the flow do?',
      options: [
        'Request a new token for every mail so it is always fresh',
        'Cache the token and refresh it shortly before expiry or when it is rejected',
        'Keep the first token, since mail servers do not check token expiry',
        'Restart the app every hour so it gets a new token on startup',
      ],
      answer: 1,
      explain: 'Requesting a token per mail adds load and can hit the identity provider limits.',
    },
  ],
  description: `
Marrow & Pine Home sends job reports and reads a supplier mailbox through a cloud mail provider with a service account and password. The provider announced it will stop accepting basic authentication for these protocols. Security also asks why one password is shared by all environments.

**Questions**
1. What is changing, and why?
2. How does a Mule app authenticate without a user?
3. What options exist if the connector cannot do OAuth with this provider?
4. How do you manage the app credentials?
`,
  answerTemplate: `## The change

## OAuth without a user

## Options

## Credentials
`,
  keyPoints: [
    'Providers are retiring basic auth for mail protocols.',
    'Use the client credentials grant for an unattended app.',
    'SMTP and IMAP take tokens through SASL XOAUTH2.',
    'If the connector cannot, send through the provider mail API over HTTPS.',
    'Secrets per environment, rotated, with least rights.',
    'Cache tokens and refresh before expiry.',
  ],
  solution: `
**1. The change.** Passwords sent over mail protocols are common targets for spraying and phishing, and they bypass multi factor checks. Large providers are moving these protocols to OAuth. Check the provider notices for exact dates and any exceptions.

**2. OAuth without a user.** Register the Mule app in the identity provider, give it the mail send or read rights for one service mailbox, and use the client credentials grant. The app gets an access token and presents it with SASL XOAUTH2 instead of a password.

**3. Options.** If your Email connector version supports OAuth for this provider, configure it there. If not, send and read mail through the provider mail API over HTTPS with the HTTP connector and an OAuth token. Another option is an internal relay that accepts mail from known hosts and handles the cloud login itself. Pick with the mail and security teams.

**4. Credentials.** Keep one app registration and secret, or better a certificate, per environment in secure properties or a vault. Track the expiry date and alert weeks ahead. Limit rights to the one mailbox. Cache tokens until shortly before they expire and refresh on a 401 or auth error.
`,
  followUps: [
    {
      q: 'Why is a certificate often preferred over a client secret?',
      a: 'The private key never travels, and secrets often get pasted into the wrong place. Rotation still needs a plan.',
    },
    {
      q: 'Can an app with send rights send as anyone in the company?',
      a: 'In some setups yes, unless the admin limits it to chosen mailboxes. Ask for that limit.',
    },
    {
      q: 'How do you test the change safely?',
      a: 'Use a test tenant or a test mailbox, run both auth methods side by side in a lower environment, then switch production with a rollback plan.',
    },
  ],
}
