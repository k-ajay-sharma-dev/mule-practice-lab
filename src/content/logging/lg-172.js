import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-172',
  category: 'logging',
  title: "FTP Connections and Modes",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","ftp","passive-mode","connectivity"],
  estMinutes: 25,
  quiz: fromLogging(["log-14006","log-14007","log-14008","log-14009","log-14010"]),
  description: `
Marrow & Pine Home connects to several partner FTP servers. Log the facts that separate a data channel problem from an outage.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log passive or active mode with timeouts.",
    "Log the attempt number on refused connections.",
    "Never log passwords.",
  ],
}
