import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-137',
  category: 'logging',
  title: "Price Changes Sent to Stores",
  level: 'INTERMEDIATE',
  tags: ["logging","audit","pricing","retail"],
  estMinutes: 20,
  quiz: fromLogging(["log-10006","log-10007","log-10008","log-10009","log-10010"]),
  description: `
Fernhill Grocers sends shelf prices to its stores. Log each change so anyone can prove later which price a store had, from when, and why a change was refused.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Put the old and new value on one audit line.",
    "Add the change ID that links to the approval, and the user ID, not a name or email.",
    "Log a refused change at WARN with the reason and where it goes next.",
  ],
}
