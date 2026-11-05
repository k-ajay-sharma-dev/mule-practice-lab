export default {
  id: 'ar-030',
  category: 'architecture',
  title: 'Data Sync Strategy: Full, Delta or CDC',
  level: 'INTERMEDIATE',
  tags: ['data-sync', 'cdc', 'watermark', 'delta-load'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each sync approach to its key property.',
      pairs: [
        ['Full sync', 'Self-healing but very high load; daily freshness at best'],
        ['Delta (watermark)', 'Low load and minutes of freshness, but does not see physical deletes'],
        ['CDC (log-based)', 'Sees inserts, updates and deletes from the DB log; needs a CDC tool and DBA access'],
      ],
      explain: 'The trade-off is load and freshness versus completeness and operational complexity.',
    },
    {
      type: 'single',
      prompt: 'Which approach fits 3,000 daily changes, a 15-minute price target and a 5-hour nightly run?',
      options: [
        'Run the full sync every hour',
        'Delta sync every few minutes plus a weekly full reconciliation, with CDC as the upgrade path',
        'Keep the nightly full export',
        'Manual exports when prices change',
      ],
      answer: 1,
      explain: 'Delta moves only changes and is naturally resumable; the weekly reconciliation catches what the watermark misses.',
    },
    {
      type: 'single',
      prompt: 'When should the stored watermark be advanced?',
      options: [
        'Before the query runs',
        'Only after the batch of changes was processed successfully',
        'Every time the Scheduler fires, whatever the result',
        'Never; always start from the beginning',
      ],
      answer: 1,
      explain: 'Advancing first would skip rows if processing fails. Advance after success and keep the watermark in a persistent store.',
    },
    {
      type: 'single',
      prompt: 'Why query with `LAST_MODIFIED >= :lastWatermark` minus a small overlap instead of `>`?',
      options: [
        'It is faster',
        'To avoid missing rows committed with the same or a slightly earlier timestamp; idempotent upserts make the re-read rows harmless',
        'Because > is not supported by the Database connector',
        'To reload all 400,000 products',
      ],
      answer: 1,
      explain: 'Ties and late commits are the classic way delta loads lose data. A small overlap plus upsert by SKU trades a few duplicates for no gaps.',
    },
    {
      type: 'multi',
      prompt: 'How do you handle physical deletes and programs that do not update LAST_MODIFIED?',
      options: [
        'A soft-delete flag or a trigger writing deleted SKUs to an audit table that Mule polls',
        'A trigger that sets LAST_MODIFIED on every update',
        'A weekly full reconciliation (hash of key fields per SKU)',
        'Rely on the watermark query to notice deleted rows',
      ],
      answer: [0, 1, 2],
      explain: 'A deleted row has no timestamp to query, so a timestamp-based delta can never see it. Fix at source where possible and reconcile for the rest.',
    },
    {
      type: 'single',
      prompt: 'The sync was down for 3 hours. What happens when it restarts?',
      options: [
        'All changes from those hours are lost',
        'The watermark simply catches up from where it stopped',
        'A full sync is mandatory',
        'The commerce platform must be restored from backup',
      ],
      answer: 1,
      explain: 'Delta sync is naturally resumable. Monitor the lag (now − watermark) so you notice when it falls behind.',
    },
  ],
  description: `
A distributor needs to keep **product master data** in sync from its ERP (on-prem SQL database) to a commerce platform (SaaS, REST API).

| Fact | Value |
|---|---|
| Products in ERP | 400,000 |
| Products changed per day | ~3,000, mostly during office hours |
| Required freshness on the website | within 15 minutes for price changes; next day acceptable for descriptions |
| ERP table | has a \`LAST_MODIFIED\` column, updated by most but not all programs |
| Deletes | products are physically deleted in ERP when discontinued |

The current solution runs a **full export every night** that takes 5 hours and sometimes overlaps with the morning.

**Questions:**
- Compare full, delta (watermark) and change data capture (CDC) for this case.
- Which would you choose, and how would you implement it in Mule 4?
- How do you handle deletes and rows where \`LAST_MODIFIED\` is not updated?
- How do you recover if the sync falls behind or data drifts?
`,
  answerTemplate: `## Comparison

## Chosen approach and Mule implementation

## Deletes and unreliable timestamps

## Recovery and reconciliation
`,
  keyPoints: [
    'Full sync is simple and self-healing but costly and slow; delta sync moves only changes using a watermark; CDC reads changes (including deletes) from the database log.',
    'Delta sync in Mule 4 uses a Scheduler or the Database "On Table Row" listener with a watermark column; the watermark is persisted (e.g. Object Store) and advanced only after successful processing.',
    'A watermark query must handle ties and clock issues (use >= with an overlap window plus idempotent upserts) so changes are not missed.',
    'Physical deletes are invisible to timestamp-based delta; they need soft-delete flags, a delete/audit table, triggers or CDC.',
    'A periodic full reconciliation (e.g. weekly) catches drift from changes that bypassed the watermark.',
  ],
  solution: `
**Comparison.**

| | Full | Delta (watermark) | CDC (log-based) |
|---|---|---|---|
| Load | Very high (400k each run) | Low (only changes) | Low |
| Freshness | Daily at best | Minutes (poll interval) | Seconds/minutes |
| Deletes | Detected by comparison | **Not** detected | Detected |
| Missed changes | None (self-healing) | If timestamp not updated | Rare |
| Complexity | Low | Low/medium | Higher (CDC tool, DB permissions, DBA involvement) |

**Chosen approach.** **Delta sync every 5 minutes** for price and product changes + a **weekly full reconciliation**. CDC (e.g. a Debezium-style tool streaming to a broker) is the upgrade path if freshness or delete handling needs more than this.

Mule 4 implementation:
- Database connector **On Table Row** listener with \`watermarkColumn=LAST_MODIFIED\`, or a **Scheduler** + query \`WHERE LAST_MODIFIED >= :lastWatermark\` with the watermark kept in a persistent **Object Store**.
- Process changes in batches (Batch Job or \`foreach\` with groups) and call the commerce API's bulk/upsert endpoint if it has one.
- **Upsert** by product SKU so reprocessing the same row is harmless (idempotent).
- Advance the watermark only after the batch succeeded; use \`>=\` with a small overlap (e.g. minus 1 minute) to avoid missing rows committed with the same or slightly earlier timestamp.

**Deletes and unreliable timestamps.**
- Ask ERP owners for a **soft-delete** flag or a database **trigger** writing deleted SKUs to an audit table that Mule polls.
- For programs not updating \`LAST_MODIFIED\`: fix at source if possible (trigger setting the column); otherwise the weekly reconciliation catches them.

**Recovery and reconciliation.**
- If the sync falls behind, the watermark simply catches up — delta is naturally resumable.
- Weekly full compare (hash of key fields per SKU) to correct drift and detect missing deletes.
- Monitor: rows per run, lag (now − watermark), failed records to a DLQ/error table.
`,
  followUps: [
    { q: 'Why not just run the full sync more often?', a: 'It loads 400k rows to change 3k, stresses both systems and the SaaS API limits, and still cannot meet a 15-minute target if one run takes hours.' },
    { q: 'What does CDC require that delta does not?', a: 'Access to the database transaction log (or a vendor CDC feature), DBA approval, a CDC tool and usually a broker to carry change events. It also requires handling of schema changes in the event stream.' },
  ],
}
