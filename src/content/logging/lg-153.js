import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-153',
  category: 'logging',
  title: "Claim Check Notifications",
  level: 'ADVANCED',
  tags: ["logging","myproject","queues","claim-check","azure-blob","blue-yonder"],
  estMinutes: 25,
  quiz: fromLogging(["log-12011","log-12012","log-12013","log-12014","log-12015"]),
  description: `
Fenwick Supply’s product hub gets a JMS notification that points to a JSON file in blob storage. Log the checks it runs before it sends an ack.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the message ID, type, container and blob name.",
    "Never log a signed URL or a SAS token.",
    "Log each rejection with the reason and the ack sent.",
  ],
}
