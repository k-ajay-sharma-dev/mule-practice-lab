import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-013',
  category: 'logging',
  title: "Polling SFTP for Files",
  level: 'BEGINNER',
  tags: ["logging","sftp","scheduler"],
  estMinutes: 15,
  quiz: fromLogging(["log-006","log-069","log-414","log-415","log-214"]),
  description: `
A flow picks up price files from SFTP, loads them and moves them to an archive folder. Log each file from pickup to archive.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A run that finds nothing is DEBUG. A run that finds files is INFO with the file names and count.",
    "Log the file name and size when the file is picked up.",
    "Say where the file went after processing.",
  ],
}
