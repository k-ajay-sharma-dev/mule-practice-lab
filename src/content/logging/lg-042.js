import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-042',
  category: 'logging',
  title: "Patient Summary: One Experience API, Three System APIs",
  level: 'ADVANCED',
  tags: ["logging","orchestration","healthcare"],
  estMinutes: 20,
  quiz: fromLogging(["log-1056","log-1057","log-1058","log-1059","log-1060"]),
  description: `
The Patient Experience API of an invented hospital group builds a summary from the Patient, Appointments and Lab Results System APIs. Some calls fail. Decide when the summary is partial, when it fails, and what each line says.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A partial answer that the flow handles is a WARN with partial=true.",
    "When a needed System API fails, log ERROR and the status sent back.",
    "Health data stays out of the log, even at DEBUG.",
  ],
}
