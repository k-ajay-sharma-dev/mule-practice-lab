import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-170',
  category: 'logging',
  title: "PGP and Secure Transfers",
  level: 'ADVANCED',
  tags: ["logging","myproject","sftp","pgp","security"],
  estMinutes: 25,
  quiz: fromLogging(["log-13046","log-13047","log-13048","log-13049","log-13050"]),
  description: `
Brindle Outdoor sends PGP encrypted payment files to its bank over SFTP. Log the key used and warn before keys expire.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the recipient key ID with each encrypted upload.",
    "Never log keys, passphrases or account numbers.",
    "Warn days before a partner key expires.",
  ],
}
