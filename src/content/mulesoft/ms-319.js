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
      prompt: 'Alerts go out with From: alerts@brindle.example through a cloud service that uses bounces@mailsvc.example as the envelope sender. The brindle.example SPF record does not list the service, yet receivers report SPF pass. How?',
      options: [
        'SPF checks the envelope sender domain, and the mailsvc.example record lists the service',
        'SPF checks the From header domain, and receivers still cached an older brindle.example record',
        'SPF counts as passed whenever the mail also carries a valid DKIM signature',
        'SPF checks the reverse DNS name of the sending IP, which ends in a trusted domain',
      ],
      answer: 0,
      explain: 'SPF checks whether the sending IP is listed in a DNS TXT record of the envelope sender domain, from MAIL FROM, which can differ from the From header people see. Here that is mailsvc.example, so SPF passes, but it says nothing about brindle.example. SPF and DKIM are separate checks, and reverse DNS is not part of SPF.',
    },
    {
      type: 'single',
      prompt: 'The cloud service signs each alert with DKIM for brindle.example. An outbound gateway then adds a legal footer to the body. Receivers now report DKIM fail. Why?',
      options: [
        'DKIM signs only the headers, so the fail must come from a missing key in DNS',
        'The signature covers a hash of the body, so the footer added after signing breaks it',
        'The gateway sends from its own IP, and DKIM checks that IP against a list in DNS',
        'The footer made the body longer than the size the DKIM key is allowed to sign',
      ],
      answer: 1,
      explain: 'DKIM is a signature over chosen headers and the body, checked with a public key in DNS. A valid signature shows the signing domain sent the mail and it was not changed on the way, so any change after signing fails it. Add the footer before signing, or sign at the gateway. A list of allowed IPs is SPF, not DKIM, and key size does not limit message size.',
    },
    {
      type: 'single',
      prompt: 'A mail has From: alerts@brindle.example. SPF passes for bounces.mailsvc.example and DKIM passes with d=mailsvc.example. brindle.example publishes a DMARC policy of p=reject. What happens?',
      options: [
        'DMARC passes, since one passing check, SPF or DKIM, is enough for it',
        'DMARC passes on DKIM, since alignment applies to the SPF check only',
        'DMARC fails, since neither passing domain aligns with brindle.example',
        'DMARC is skipped, since p=reject covers only mail from brindle.example IPs',
      ],
      answer: 2,
      explain: 'DMARC needs SPF or DKIM to pass with a domain that aligns with the From header domain. Both checks passed, but for mailsvc.example, so DMARC fails and the policy asks receivers to reject the mail. Alignment applies to both checks. The policy is about the From domain, not the sending IPs. The fix is DKIM signing with d=brindle.example or an aligned envelope sender.',
    },
    {
      type: 'single',
      prompt: 'A Mule app sends through a cloud mail service with From: alerts@brindle.example. Receivers mark it as spam. The service IPs are not in the brindle.example SPF record. What is the fix?',
      options: [
        'Lower the sending rate so receivers learn to trust the service IPs',
        'Have the domain owner add the service to SPF and set up DKIM for brindle.example',
        'Set a Reply-To on brindle.example so receivers see a real mailbox behind the alerts',
        'Publish a DMARC policy of reject so receivers trust the domain more',
      ],
      answer: 1,
      explain: 'DKIM signing for brindle.example on the service makes DMARC align. A reject policy would block these mails, not help them. DNS changes for the company domain belong to the mail or DNS team, not the integration team.',
    },
    {
      type: 'multi',
      prompt: 'Which habits help integration mails get delivered and read?',
      options: [
        'A stable From address on a domain that passes SPF, DKIM and DMARC',
        'Plain, short subjects without words that look like spam',
        'A working reply or bounce address that someone watches',
        'Sending from a free mail account when the company relay is busy',
        'A company domain From address, sent through a new relay not yet listed in SPF',
        'A new From address for each job, so filters do not group the mails',
      ],
      answer: [0, 1, 2],
      explain: 'A stable, authenticated From address, plain subjects and a watched reply address all build trust with filters and readers. Free mail accounts fail DMARC for the company domain and look like phishing. A relay missing from SPF fails SPF, and without a matching DKIM signature DMARC fails too. Changing From addresses breaks the sender reputation that filters rely on.',
    },
    {
      type: 'single',
      prompt: 'A burst of alerts from alerts@brindle.example got the domain marked as a spam source, and staff mail from brindle.example now lands in spam too. What keeps this from happening again?',
      options: [
        'Give the alerts a different display name, such as Brindle Alerts, so receivers keep them apart',
        'Spread the alerts across several From addresses on brindle.example to share the load',
        'Set the brindle.example DMARC policy to p=none, so alerts are no longer judged by it',
        'Send system mail from a subdomain such as notify.brindle.example, with its own SPF, DKIM and DMARC',
      ],
      answer: 3,
      explain: 'A subdomain separates the reputation and DMARC policy of system mail from people mail, so a problem in one does not hurt the other. It still needs its own SPF, DKIM and DMARC setup. Receivers rate the domain, not the display name or the local part, so new names or addresses on brindle.example share the same reputation. p=none only stops the policy from acting and does not change reputation.',
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
