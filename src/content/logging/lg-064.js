import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-064',
  category: 'logging',
  title: "Invoice Files over FTP",
  level: 'INTERMEDIATE',
  tags: ["logging","ftp","files"],
  estMinutes: 10,
  quiz: fromLogging(["log-3016","log-3017","log-3018","log-3019","log-3020"]),
  description: `
Kestrel Office Supplies writes invoice files to a partner FTP server. Sometimes the server is down, and sometimes a file was already sent. Log every outcome without leaking the FTP login.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "After a write, log the invoice ID, the file name and the folder.",
    "Never log the FTP password, not even at DEBUG. Mule does not mask it.",
    "A failure the next run retries is WARN, with what happens next.",
  ],
}
