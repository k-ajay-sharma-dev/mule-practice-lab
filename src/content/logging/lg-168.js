import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-168',
  category: 'logging',
  title: "Uploads to the Planning Platform",
  level: 'ADVANCED',
  tags: ["logging","myproject","sftp","outbound","planning-platform","sequence"],
  estMinutes: 25,
  quiz: fromLogging(["log-13036","log-13037","log-13038","log-13039","log-13040"]),
  description: `
Brindle Outdoor uploads master data files to the planning platform over SFTP. Log what was sent so it can be compared with what was received.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log path, size, rows and sequence number.",
    "Log a failed upload with the sequence and what happens next.",
    "Keep item data out of the log.",
  ],
}
