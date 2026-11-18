import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-208',
  category: 'logging',
  title: "Email Bounces",
  level: 'INTERMEDIATE',
  tags: ["logging","myproject","email","bounces","personal-data"],
  estMinutes: 25,
  quiz: fromLogging(["log-17036","log-17037","log-17038","log-17039","log-17040"]),
  description: `
Marrow & Pine Home processes bounces after sending store reports. Log counts and marked contacts without addresses.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log permanent and temporary bounce counts.",
    "Identify contacts by store ID, not address.",
    "Marked contacts should match permanent bounces.",
  ],
}
