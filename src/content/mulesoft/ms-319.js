export default {
  id: 'ms-319',
  category: 'mulesoft',
  title: 'Why Integration Mails Land in Spam: SPF, DKIM, DMARC and the Envelope Sender',
  level: 'EXPERT',
  tags: ['myproject', 'email', 'spf', 'dkim', 'dmarc', 'deliverability'],
  estMinutes: 28,
  quiz: [
    {
      type: 'single',
      prompt: 'What does SPF check?',
      options: [
        'The body text',
        'Whether the sending server IP is listed in a DNS TXT record of the domain used in the envelope sender',
        'The attachment size',
        'The TLS version',
      ],
      answer: 1,
      explain: 'The envelope sender, from MAIL FROM, can differ from the From header people see.',
    },
    {
      type: 'single',
      prompt: 'What does DKIM add?',
      options: [
        'Encryption of the body',
        'A signature over chosen headers and the body, made with a private key, which receivers check with a public key in DNS',
        'A password',
        'A delivery receipt',
      ],
      answer: 1,
      explain: 'A valid signature shows the signing domain sent the mail and it was not changed on the way.',
    },
    {
      type: 'single',
      prompt: 'What does DMARC require for a mail to pass?',
      options: [
        'Both SPF and DKIM must pass',
        'SPF or DKIM must pass with a domain that aligns with the domain in the From header',
        'A valid TLS certificate',
        'A reply address',
      ],
      answer: 1,
      explain: 'The DMARC record also sets a policy for failures: none, quarantine or reject, and where reports go.',
    },
    {
      type: 'single',
      prompt: 'A Mule app sends through a cloud mail service with From: alerts@brindle.example. Receivers mark it as spam. The service IPs are not in the brindle.example SPF record. What is the fix?',
      options: [
        'Change the subject',
        'Have the domain owner add the service to SPF and set up DKIM signing for brindle.example on the service, so DMARC aligns',
        'Send fewer mails',
        'Use a personal address',
      ],
      answer: 1,
      explain: 'DNS changes for the company domain belong to the mail or DNS team, not the integration team.',
    },
    {
      type: 'multi',
      prompt: 'Which habits help integration mails get delivered and read?',
      options: [
        'A stable From address on a domain that passes SPF, DKIM and DMARC',
        'Plain, short subjects without words that look like spam',
        'A working reply or bounce address that someone watches',
        'Sending from random free mail accounts',
      ],
      answer: [0, 1, 2],
      explain: 'Free mail accounts fail DMARC for the company domain and look like phishing.',
    },
    {
      type: 'single',
      prompt: 'Why might the team use a subdomain such as notify.brindle.example for system mail?',
      options: [
        'It is required by SMTP',
        'It separates the reputation and DMARC policy of system mail from people mail, so a problem in one does not hurt the other',
        'It is cheaper',
        'Subdomains skip spam checks',
      ],
      answer: 1,
      explain: 'The subdomain still needs its own SPF, DKIM and DMARC setup.',
    },
  ],
  description: `
Brindle Outdoor moved its Mule job reports and supplier notices from an internal relay to a cloud mail service. Since then some suppliers never receive notices, and internal users find reports in the spam folder. The mail team mentions SPF, DKIM and DMARC.

**Questions**
1. What do SPF, DKIM and DMARC each check?
2. Why did the move break delivery?
3. What must change, and who does it?
4. What habits keep system mail delivered?
`,
  answerTemplate: `## SPF, DKIM and DMARC

## Why the move broke delivery

## The fix and the owners

## Good habits
`,
  keyPoints: [
    'SPF lists servers allowed to send for the envelope domain.',
    'DKIM signs headers and body with a key published in DNS.',
    'DMARC needs SPF or DKIM to pass with alignment to the From domain.',
    'A new sending service must be added to SPF and sign with DKIM.',
    'DNS changes belong to the domain owners.',
    'Use a stable sender, a watched bounce address and maybe a subdomain.',
  ],
  solution: `
**1. SPF, DKIM and DMARC.** SPF is a DNS record listing which servers may send for a domain, checked against the envelope sender. DKIM signs selected headers and the body, and receivers check the signature with a public key in DNS. DMARC asks that SPF or DKIM pass for a domain that matches the From header, and tells receivers what to do when neither does: nothing, quarantine or reject.

**2. Why the move broke delivery.** The cloud service sends from its own servers, which were not in the company SPF record, and it did not sign with the company DKIM key. With a DMARC policy of quarantine or reject, receivers treat the mails as spoofed.

**3. The fix and the owners.** The DNS and mail team adds the service to SPF, sets up DKIM keys for the domain on the service and publishes them, and checks DMARC reports to confirm alignment. The integration team gives the exact From and envelope addresses and the sending service.

**4. Good habits.** Use one stable From address per purpose, on a domain or subdomain set up for system mail. Keep subjects plain and specific. Give a bounce address someone watches. Do not send from free mail accounts or many different addresses.
`,
  followUps: [
    {
      q: 'What is the difference between the envelope sender and the From header?',
      a: 'The envelope sender is given in the SMTP MAIL FROM command and gets bounces. The From header is what the reader sees. They can differ.',
    },
    {
      q: 'How do you check a received mail?',
      a: 'Open the raw headers and read the Authentication-Results line, which shows the SPF, DKIM and DMARC results.',
    },
    {
      q: 'What is the SPF lookup limit?',
      a: 'SPF allows a limited number of DNS lookups, often ten. Records with many includes can break. The DNS team usually manages that.',
    },
  ],
}
