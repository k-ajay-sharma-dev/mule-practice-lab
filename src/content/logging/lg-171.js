import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-171',
  category: 'logging',
  title: "FTP Downloads",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","ftp","transfer-mode","binary"],
  estMinutes: 25,
  quiz: fromLogging(["log-14001","log-14002","log-14003","log-14004","log-14005"]),
  description: `
Marrow & Pine Home downloads supplier files over FTP. Log each transfer so you can prove the copy was exact.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the size read, the server size and the transfer mode.",
    "Never log an FTP URL with a password in it.",
    "Log a size mismatch and download again.",
  ],
}
