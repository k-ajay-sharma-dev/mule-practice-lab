import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-163',
  category: 'logging',
  title: "Control Files for Plan Sets",
  level: 'ADVANCED',
  tags: ["logging","myproject","azure-file-share","control-file","planning-platform","plans"],
  estMinutes: 25,
  quiz: fromLogging(["log-13011","log-13012","log-13013","log-13014","log-13015"]),
  description: `
The planning platform sends a set of plan files and a control file. Larkfield Grocers loads the set only when it is complete. Log the waiting and the cut off.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log expected against present while waiting.",
    "Log the missing file names at the cut off.",
    "Say what stores do when the set is late.",
  ],
}
