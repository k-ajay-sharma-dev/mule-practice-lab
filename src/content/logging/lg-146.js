import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-146',
  category: 'logging',
  title: "Certificates That Expire",
  level: 'BEGINNER',
  tags: ["logging","certificates","tls","operations"],
  estMinutes: 15,
  quiz: fromLogging(["log-11026","log-11027","log-11028","log-11029","log-11030"]),
  description: `
Elmstead Council calls partners over TLS with client certificates. Log a daily check so certificates are renewed before calls start to fail.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the alias, expiry date, days left and the apps that use it.",
    "Warn with weeks to spare, not on the day.",
    "Never log the certificate body or the keystore password.",
  ],
}
