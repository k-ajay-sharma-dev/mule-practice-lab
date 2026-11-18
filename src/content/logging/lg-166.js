import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-166',
  category: 'logging',
  title: "SFTP Connection Problems",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","sftp","connectivity","host-key"],
  estMinutes: 25,
  quiz: fromLogging(["log-13026","log-13027","log-13028","log-13029","log-13030"]),
  description: `
Brindle Outdoor connects to many partner SFTP servers. Log failed connections with the facts that point to the right owner.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log partner, host, user, attempt and error type.",
    "Log a host key change at ERROR with the fingerprint.",
    "Never log passwords, private keys or passphrases.",
  ],
}
