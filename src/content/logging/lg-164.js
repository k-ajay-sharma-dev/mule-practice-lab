import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-164',
  category: 'logging',
  title: "Moves, Locks and the Error Folder",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","azure-file-share","locks","smb"],
  estMinutes: 25,
  quiz: fromLogging(["log-13016","log-13017","log-13018","log-13019","log-13020"]),
  description: `
Larkfield Grocers moves each file to working, processed or error folders. Log every move so you can prove a file was handled once.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the file, both folders and the error code when a move fails.",
    "Log why a file went to the error folder.",
    "Three lines per file trace its path.",
  ],
}
