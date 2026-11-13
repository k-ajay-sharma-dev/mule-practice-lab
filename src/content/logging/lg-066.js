import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-066',
  category: 'logging',
  title: "Batch Aggregator Chunks to SFTP",
  level: 'INTERMEDIATE',
  tags: ["logging","batch","aggregator","sftp"],
  estMinutes: 15,
  quiz: fromLogging(["log-3026","log-3027","log-3028","log-3029","log-3030"]),
  description: `
Orchard Medical Supplies sends its catalog to the warehouse in chunks of 500, written by a Batch Aggregator to SFTP. Log each chunk and each chunk that fails.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "In a Batch Aggregator the payload is the array of records in the chunk.",
    "Log the chunk size with sizeOf(payload), never the records.",
    "A chunk that fails and nobody resends is ERROR.",
  ],
}
