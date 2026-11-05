import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-019',
  category: 'use-cases',
  title: 'Bank Statement Reconciliation',
  level: 'ADVANCED',
  tags: ['camt053', 'mt940', 'reconciliation', 'matching', 'finance'],
  estMinutes: 35,
  diagram: {
    task: 'draw the reconciliation pipeline: banks dropping statements on SFTP, the ingestion job with its raw archive and statement register, the matching Process API with its rules, posting to NetSuite, the exception work queue and the daily report.',
    checks: [
      { label: 'Banks deliver statement files to an SFTP drop', rule: { type: 'edge', from: ['partner', 'external-api'], to: 'file-store' } },
      { label: 'An ingestion job picks up the files', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: 'file-store' } },
      { label: 'Raw files are archived immutably before processing', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: { type: ['file-store', 'database'], label: ['archive', 'raw', 'immutable'] } } },
      { label: 'Statements are checked against a register (duplicates, balance continuity)', rule: { type: 'edge', from: ['batch-job', 'process-api', 'system-api'], to: { type: ['database', 'cache'], label: ['statement', 'balance', 'processed'] } } },
      { label: 'A matching Process API applies configurable rules', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['rule', 'mapping', 'iban'] } } },
      { label: 'NetSuite is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Unmatched lines land in a finance work queue', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'internal-app', 'saas', 'queue', 'erp'], label: ['work', 'exception', 'unmatched'] } } },
      { label: 'Ingested statements end up as payments in NetSuite', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
    ],
    reference: diagram(
      {
        banks: ['partner', 'Banks (5, host-to-host)'],
        sftp: ['file-store', 'Bank SFTP drop (camt.053 / MT940)'],
        ing: ['batch-job', 'Statement ingestion (PGP decrypt, normalise)'],
        arch: ['file-store', 'Immutable raw archive'],
        stmt: ['database', 'Processed statements & balances'],
        p: ['process-api', 'prc-payment-matching'],
        rules: ['database', 'Matching rules & IBAN map'],
        sns: ['system-api', 'sys-netsuite-api'],
        ns: ['erp', 'Oracle NetSuite'],
        wq: ['database', 'Exception work queue'],
        rep: ['notification', 'Daily report & missing-statement alerts'],
      },
      ['banks -> sftp', 'ing -> sftp', 'ing -> arch', 'ing -> stmt', 'ing -> p', 'p -> rules', 'p -> sns', 'sns -> ns', 'p -> wq', 'p -> rep'],
    ),
  },
  description: `
A wholesale distributor operating in 8 countries banks with **5 different banks**. Finance wants incoming payments matched automatically to open invoices in **Oracle NetSuite** (ERP).

Facts:
- Banks deliver **end-of-day statements**: 3 banks send **ISO 20022 camt.053** (XML), 2 still send **SWIFT MT940** (text). Two banks also offer **intraday camt.052** via API.
- Statements arrive via the banks' **SFTP/host-to-host** channels between 22:00 and 04:00.
- ~9,000 incoming payment lines/day. Customers often pay **several invoices in one transfer**, short-pay (deduct fees or disputed amounts) or write only a vague reference ("INV 2231 + 2240", or the PO number).
- Finance target: **85% auto-matched**; the rest must be in a work queue by 08:00 with suggestions.
- A statement must never be posted twice; the closing balance of one statement must equal the opening balance of the next.

**Describe your solution:**
- How do you receive and normalise the different formats?
- How do you validate statements before processing?
- What matching strategy do you use, and how do you deal with partial and multi-invoice payments?
- What gets posted to NetSuite and how do you handle exceptions?
`,
  answerTemplate: `## Receiving files

## Normalisation

## Statement validation

## Matching strategy

## Posting and exceptions

## Controls and security
`,
  keyPoints: [
    'SFTP listeners per bank (host-to-host, PGP decrypt if required), raw files archived immutably before processing.',
    'camt.053 parsed as XML and MT940 parsed with a flat-file/custom parser into one canonical statement/transaction model in DataWeave.',
    'Statement validation: duplicate check (bank + account + statement ID/sequence), balance continuity (previous closing = opening), and sum of lines = closing − opening.',
    'Layered matching: exact (structured reference/invoice number + amount), then rule-based (references parsed with patterns, customer from IBAN, combinations of open invoices summing to the amount), then tolerance rules for fees/short-pay.',
    'Matched payments posted to NetSuite as customer payments applied to invoices (idempotent by bank transaction reference); unmatched/partial items in a work queue with ranked suggestions by 08:00.',
    'Matching rules configurable by finance, match rate and exceptions reported daily.',
  ],
  solution: `
**Receiving files.** One SFTP listener per bank (On New or Updated File, with a moved-to/archive directory). If banks encrypt files, decrypt with the **Cryptography module (PGP)**. Every raw file is first archived unchanged (immutable storage with retention) — the original is the audit evidence.

**Normalisation.**
- **camt.053**: XML; DataWeave maps \`Stmt\` (account, statement ID, sequence, balances \`OPBD\`/\`CLBD\`) and each \`Ntry\`/\`TxDtls\` (amount, credit/debit, booking date, end-to-end ID, remittance information \`Ustrd\`/\`Strd\`, debtor name and IBAN).
- **MT940**: tag-based text (:20:, :25:, :28C:, :60F:, :61:, :86:, :62F:). Parse with DataWeave flat file definitions or a small custom parser (Java module); field :86: is bank-specific, so keep per-bank parsing rules.
- Output: one **canonical statement** model regardless of bank. Intraday camt.052 data can feed a cash-position view but end-of-day camt.053 is what gets posted.

**Statement validation.**
- **Duplicate check**: bank + account + statement ID/sequence number already processed → skip and log.
- **Continuity**: opening balance = previous statement's closing balance; a gap means a missing statement → stop posting for that account and alert treasury.
- **Integrity**: opening + sum(credits) − sum(debits) = closing.

**Matching strategy** (in a Process API, rules externalised):
1. **Exact**: structured creditor reference (e.g. RF reference) or invoice number found + amount equals open amount.
2. **Reference parsing**: regex patterns for invoice/PO numbers in remittance text (\`INV\\s?\\d+\`, customer-specific formats), multiple references → split.
3. **Customer identification**: debtor IBAN → customer (learned mapping table), then find **open invoices** of that customer whose amounts sum to the payment (subset-sum on a limited candidate set, e.g. oldest 20 invoices).
4. **Tolerance rules**: difference within e.g. €25 or 0.5% → match and book the difference to a bank-fee/write-off account per policy; larger short-pays → partial application, remainder stays open with a reason code.
5. Each match gets a **confidence**; only high confidence is auto-posted.

**Posting and exceptions.** Auto-matched lines → NetSuite **customer payment** applied to the invoices (NetSuite connector / SuiteTalk). The bank transaction reference is stored on the record as an **idempotency key** (search before create). Bank fees and other debits → journal entries per mapping. Unmatched or low-confidence lines → a **work queue** (NetSuite saved search/custom record, or a small app) with top suggestions and the remittance text, ready by 08:00. When finance resolves an item manually, the IBAN → customer mapping is learned for next time.

**Controls and security.** Daily report: lines received, auto-matched %, exceptions, totals per bank. Alerts for missing statements by 05:00. Bank data is sensitive: encrypted at rest, restricted access to logs (log references and amounts aggregated, not full account details), secrets for SFTP/PGP keys in a vault.
`,
  followUps: [
    { q: 'A bank resends yesterday\'s statement with a correction. How do you handle it?', a: 'The duplicate check catches the same statement ID; a corrected version is flagged for treasury review rather than auto-posted, since postings from the original may already be applied.' },
    { q: 'Why not do all matching inside NetSuite?', a: 'If NetSuite\'s bank reconciliation/matching features meet the 85% target, use them and let Mule only deliver normalised files. Custom matching in Mule is justified for complex multi-bank rules; evaluate first.' },
    { q: 'How do you test the matching rules?', a: 'Build a regression set from historical statements with known correct matches and measure precision and auto-match rate on every rule change, plus MUnit tests for parsing each bank format.' },
  ],
}
