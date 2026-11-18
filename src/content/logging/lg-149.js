import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-149',
  category: 'logging',
  title: "Refunds That Need a Second Approver",
  level: 'EXPERT',
  tags: ["logging","audit","approvals","finance"],
  estMinutes: 30,
  quiz: fromLogging(["log-11041","log-11042","log-11043","log-11044","log-11045"]),
  description: `
Ashby Building Society needs two people for large refunds. Log every request, approval and refusal so an auditor can see the rule was followed.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the requester and the approver by user ID on the approval line.",
    "Log a self approval attempt at WARN at least.",
    "Leave out bank details. The refund ID finds them.",
  ],
}
