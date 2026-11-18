import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-161',
  category: 'logging',
  title: "Polling a File Share",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","azure-file-share","polling","partial-files"],
  estMinutes: 25,
  quiz: fromLogging(["log-13001","log-13002","log-13003","log-13004","log-13005"]),
  description: `
Larkfield Grocers polls an Azure file share for store sales files. Log the polls that matter and the files skipped while still being written.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log polls that find files at INFO, and empty polls at DEBUG.",
    "Add how many entries were listed and how many were new.",
    "Log a file skipped because its size is still changing.",
  ],
}
