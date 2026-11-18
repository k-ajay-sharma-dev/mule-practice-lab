import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-198',
  category: 'logging',
  title: "Checksums and Copies",
  level: 'ADVANCED',
  tags: ["logging","myproject","large-files","checksum","integrity"],
  estMinutes: 25,
  quiz: fromLogging(["log-16036","log-16037","log-16038","log-16039","log-16040"]),
  description: `
Thornbury Freight verifies every large copy with a checksum. Log matches and mismatches.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log both hashes and the size on a mismatch.",
    "Never load a file that failed its check.",
    "Log the hash of each verified copy.",
  ],
}
