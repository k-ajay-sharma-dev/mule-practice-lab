import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-205',
  category: 'logging',
  title: "Unmatched FTP Files",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","ftp","file-names","passive-mode"],
  estMinutes: 25,
  quiz: fromLogging(["log-17021","log-17022","log-17023","log-17024","log-17025"]),
  description: `
Marrow & Pine Home skips supplier files whose names break the agreed pattern. Make the skips visible and log passive mode failures.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log unmatched files at WARN with the pattern and one example.",
    "Log the advertised address on passive failures.",
    "Keep file content out.",
  ],
}
