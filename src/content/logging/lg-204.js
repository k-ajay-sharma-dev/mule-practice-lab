import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-204',
  category: 'logging',
  title: "SFTP Read Checks and Disk Space",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","sftp","permissions","capacity"],
  estMinutes: 25,
  quiz: fromLogging(["log-17016","log-17017","log-17018","log-17019","log-17020"]),
  description: `
Brindle Outdoor checks the receiver can read each upload and handles a full server disk. Log what an admin needs to fix it.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the path, reader account and file mode on a failed check.",
    "Log disk full failures with the size and cleanup done.",
    "Never log passwords.",
  ],
}
