export default {
  id: 'ms-090',
  category: 'mulesoft',
  title: 'SAP Connector: IDocs, BAPIs, RFC Types and Transactions',
  level: 'ADVANCED',
  tags: ['sap', 'idoc', 'bapi', 'rfc', 'jco', 'transactions', 'erp'],
  estMinutes: 35,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each requirement to the SAP Connector component.',
      pairs: [
        ['Call a BAPI and wait for its result', 'Synchronous Remote Function Call'],
        ['Deliver a MATMAS IDoc into SAP', 'Send IDoc'],
        ['Receive IDocs that SAP sends to Mule', 'Document Listener'],
        ['Let SAP call Mule as if it were a BAPI', 'Function Listener'],
      ],
      explain: 'Operations go from Mule to SAP. The two listeners make the app act as an RFC server registered at the SAP gateway.',
    },
    {
      type: 'single',
      prompt: 'A flow calls `BAPI_SALESORDER_CREATEFROMDAT2` with Synchronous Remote Function Call and no surrounding scope. What do the connector docs say about this?',
      options: [
        'The call must be inside a Try with an open transaction, otherwise the change does not impact SAP',
        'It is correct, because a synchronous call commits automatically',
        'It must use Asynchronous Remote Function Call, because only that operation can change data',
        'It must be wrapped in Until Successful so the change is retried',
      ],
      answer: 0,
      explain: 'The reference says you must add a `try` block when the function changes data, and the example uses `transactionalAction="ALWAYS_BEGIN"`.',
    },
    {
      type: 'single',
      prompt: 'A flow only reads bank master data with `BAPI_BANK_GETLIST`. Does it need a transaction?',
      options: [
        'No, the docs state that transactions are not necessary for queries to SAP',
        'Yes, every RFC needs a Try with ALWAYS_BEGIN',
        'Yes, and it must also call Confirm Transaction',
        'No, but only because the function name starts with BAPI',
      ],
      answer: 0,
      explain: 'The transaction matters when the function changes data in SAP. A read has nothing to save.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of an asynchronous call as shown in the connector examples.',
      items: [
        'Start SAP Transaction creates a transaction ID',
        'Store the ID in a variable',
        'Asynchronous Remote Function Call runs the function with that transaction ID',
        'Confirm Transaction tells the server that the transaction succeeded',
      ],
      explain: 'Asynchronous calls do not expect a response, so the docs use these specific operations. The transaction ID identifies an RFC so that it runs only once.',
    },
    {
      type: 'single',
      prompt: 'Several IDocs for the same material must be processed by SAP in a fixed order. Which transport fits, and what must you supply?',
      options: [
        'qRFC, with a queue name and version for each transaction',
        'tRFC, because it processes every transaction in order',
        'sRFC, with a larger connection pool',
        'tRFC, with Connection Count set to 1 on a listener',
      ],
      answer: 0,
      explain: 'The reference says to use qRFC to guarantee that several transactions are processed in a predefined order, and that a queue name and version are required for each qRFC transaction.',
    },
    {
      type: 'multi',
      prompt: 'Which are prerequisites for running the SAP Connector?',
      options: [
        'The SAP JCo and IDoc libraries downloaded from SAP (for example `sapjco3.jar`, `sapidoc3.jar` and the native library for the OS)',
        'A service user whose roles permit the required RFCs, BAPIs and IDocs',
        'Authorization for `RFC_METADATA_GET` for Synchronous Remote Function Call',
        'A separate license for the connector, agreed with MuleSoft before production use',
        'No SAP libraries, because the connector bundles JCo',
      ],
      answer: [0, 1, 2, 3],
      explain: 'You need an SAP ID to download the libraries, and you install them through the global element. The connector does not ship them.',
    },
    {
      type: 'single',
      prompt: 'An older project uses `sap:sync-rfc` and is moving to JCo 3.1.x. What should happen to that operation?',
      options: [
        'Replace it with Synchronous Remote Function Call: the old operation is deprecated and works only with JCo 3.0.x, the new one only with JCo 3.1.x',
        'Keep it, because it works with every JCo version',
        'Replace it with Send IDoc',
        'Replace it with Get Function, which also executes the function',
      ],
      answer: 0,
      explain: 'The reference marks the old operations as deprecated and JCo 3.0.x only. The new operations work only with JCo 3.1.x and expect valid XML content in the response.',
    },
  ],
  description: `
A manufacturer runs **SAP S/4HANA** for orders, materials and finance. A new Mule layer replaces point-to-point file exchanges with these interfaces:

- **Material master** changes (about 25,000 per day) leave SAP as **MATMAS IDocs** and go to the web shop.
- **Sales orders** (about 6,000 per day) are created in SAP from the customer portal with a **BAPI**. The portal needs the order number or the reason for rejection in the response.
- **Stock movements** from a warehouse system must be delivered to SAP as IDocs, **in order per material**.
- SAP must be able to **call Mule** for a credit check during order entry.

The SAP team asks whether the integration team understands the difference between IDocs, BAPIs and the RFC types, and how transactions work.

**Questions**
1. What are an IDoc, a BAPI and an RFC, and when do you use each?
2. Which connector operation or source fits each interface, and which transport?
3. How do transactions work for synchronous and asynchronous calls?
4. What must be in place before the first deployment?
5. What do you ask the SAP team for?
`,
  answerTemplate: `## IDoc, BAPI and RFC

## Operation and transport per interface

## Transactions

## Prerequisites

## Requests to the SAP team
`,
  keyPoints: [
    'IDoc: SAP\'s standard document format for electronic data exchange. BAPI: a function module implementing a method of a business object, with a stable, remotely callable interface. RFC: the protocol that calls a BAPI or triggers IDoc processing.',
    'Transports: BAPI execution and the JCo server use sRFC and aRFC. IDocs use tRFC and qRFC for both sending and receiving.',
    'qRFC guarantees that several transactions are processed in a predefined order and requires a queue name and version per transaction.',
    'A function that changes data must run inside a Try with an open transaction, otherwise the change does not impact SAP. Reads need no transaction.',
    'Asynchronous calls: Start SAP Transaction, Asynchronous Remote Function Call with the transaction ID, Confirm Transaction.',
    'Listeners make the app an RFC server; they need the gateway host, gateway service and program ID from the SAP team.',
    'The JCo and IDoc libraries come from SAP and are not bundled. The current RFC operations work only with JCo 3.1.x; the deprecated ones only with 3.0.x.',
    'The service user needs permission for the required RFCs, BAPIs and IDocs, plus RFC_METADATA_GET for Synchronous Remote Function Call.',
  ],
  solution: `
**1. IDoc, BAPI and RFC.**
- An **IDoc** (intermediate document) is SAP's standard format for electronic data exchange. It suits document-style, asynchronous exchange. Its XML form has a root named after the type (\`MATMAS01\`), an \`IDOC BEGIN="1"\` element, the control record \`EDI_DC40\` and data segments such as \`E1MARAM\`.
- A **BAPI** is a function module that implements a method of a business object, with a stable interface across SAP versions. It suits request and response calls. In the connector's XML it has \`import\`, \`export\` and \`tables\` sections.
- An **RFC** is the protocol used to call a BAPI or to trigger IDoc processing.

**2. Operation and transport per interface.**
- Material master out of SAP: **Document Listener** with a program ID, filtered by Idoc Type Filter Regex if needed.
- Sales orders: **Synchronous Remote Function Call** over sRFC, inside a Try.
- Stock movements: **Send IDoc** over **qRFC** with a queue name and version, because the order matters. Plain tRFC is the option when order does not matter.
- Credit check: **Function Listener** with Targeted Function; the flow's result is returned through the Response parameter.

**3. Transactions.**
- **Synchronous:** the docs say you must add \`try\` to the BAPI call to create a transaction, otherwise the change does not impact SAP. The example uses \`transactionalAction="ALWAYS_BEGIN"\`. In SAP terms, a BAPI change is saved only by a commit of the logical unit of work. The connector docs do not describe the mechanism beyond the Try, so test it against your system.
- **Asynchronous:** Start SAP Transaction creates an ID, and the call uses that ID (it identifies an RFC so that the RFC runs only once). Confirm Transaction tells the server the transaction succeeded.
- **Reads:** no transaction is needed.
- The docs say both tRFC and qRFC have a TID handler.

**4. Prerequisites.** The connector license; \`sapjco3.jar\`, \`sapidoc3.jar\` and the native library for the OS (\`sapjco3.dll\` on Windows, \`libsapjco3.so\` on Linux), installed through the global element; and a JCo version that fits the operations you use.

**5. Requests to the SAP team.** Application server host, system number, client and login language; gateway host, gateway service and program IDs for the listeners; a service user with roles for the required RFCs, BAPIs and IDocs, including \`RFC_METADATA_GET\`; and the partner profile and port setup that sends IDocs to the registered program.
`,
  followUps: [
    {
      q: 'What does Parse Without Field Data Type Checking do, and why be careful?',
      a: 'It is an IDoc parsing option. The docs warn to use it with care, because illegal field contents can cause ABAP system dumps.',
    },
    {
      q: 'What does the Evaluate Response flag do?',
      a: 'It decides whether an error response throws an exception or lets you handle it with another result. Either way, check the BAPI RETURN table in the response, because business errors are normally reported there.',
    },
    {
      q: 'Which authentication types does the connector support?',
      a: 'The docs list Simple (username and password), Certificate (X509) and Kerberos.',
    },
    {
      q: 'How do you tune the outbound connection, for example pooling?',
      a: 'Through extended properties on the configuration. The docs say to use the same property name that SAP uses.',
    },
  ],
}
