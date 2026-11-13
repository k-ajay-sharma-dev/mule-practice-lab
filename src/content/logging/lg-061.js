import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-061',
  category: 'logging',
  title: "Store Sales Files and the Archive Folder",
  level: 'BEGINNER',
  tags: ["logging","files","archive"],
  estMinutes: 10,
  quiz: fromLogging(["log-3001","log-3002","log-3003","log-3004","log-3005"]),
  description: `
Greenfield Grocers stores send a daily sales CSV. A File Listener picks each one up, the flow loads the sales and moves the file to an archive folder. Log each file from pickup to archive.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the file name and size from attributes when a file is picked up.",
    "Never log the file content. It is large and says nothing a count cannot.",
    "When a move fails, say where the file went instead.",
  ],
}
