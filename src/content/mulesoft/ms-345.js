export default {
  id: 'ms-345',
  category: 'mulesoft',
  title: 'File and Folder Names on Azure File Share: Case, Special Characters and URL Encoding',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'file-names', 'url-encoding', 'smb', 'rest-api'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A store writes "Sales_0142.CSV" and the flow asks for "sales_0142.csv" on the same Azure File Share. What happens?',
      options: [
        'Not found, because Azure File Share names are case sensitive',
        'It is usually found, since Azure Files ignores case but keeps the written case',
        'It is found only over SMB, since the REST API compares names case sensitively',
        'The call fails with a 409, since the share sees a clash between the two cases',
      ],
      answer: 1,
      explain: 'Names keep the case they were written with. This is like Windows file shares. Blob Storage is different: blob names are case sensitive.',
    },
    {
      type: 'single',
      prompt: 'Why can that same name lookup break when the files move to Blob Storage?',
      options: [
        'Blob names cannot hold an underscore, so the flow must rename files',
        'Blob names are case sensitive, so the flow needs the exact case',
        'Blob Storage saves names in lower case, so capitals in the flow miss',
        'Blob folders are virtual, so the flow must list the prefix before a read',
      ],
      answer: 1,
      explain: 'Normalise names in your own logic, or agree a case rule with the senders.',
    },
    {
      type: 'multi',
      prompt: 'The store tool tries to write these names to the Azure File Share. Which ones can the share not hold?',
      options: [
        '`stock:0150.csv`',
        '`Sales 0142 #2.CSV`',
        '`promo<A>.csv`',
        '`what_if?.csv`',
        '`promo_A&B.csv`',
        '`plan [v2].csv`',
      ],
      answer: [0, 2, 3],
      explain: 'The rules follow Windows naming: a name cannot hold a quote, backslash, slash, colon, pipe, angle brackets, asterisk or question mark. So the colon, the angle brackets and the question mark are refused. Spaces, #, & and square brackets are allowed in a name, but they must be percent encoded in a REST URL, which is why those files cause trouble in a different way. Check the docs for the full list.',
    },
    {
      type: 'single',
      prompt: 'A file is named "store 0142 #2.csv". What must the flow do when calling the REST API?',
      options: [
        'Wrap the path in double quotes, so the space and the # stay part of the name',
        'Percent encode the path, so the space and the # become %20 and %23',
        'Replace the spaces and # with underscores in the request only',
        'Put the file name in a request header instead of the URL path',
      ],
      answer: 1,
      explain: 'A raw # cuts the URL, and the server looks for a file named "store 0142 ".',
    },
    {
      type: 'single',
      prompt: 'A flow encodes the path, and a library encodes it again. What is the result?',
      options: [
        'The same file, since the server decodes the path twice',
        'A % becomes %25, so the server looks for a name with "%20" in it',
        'The library spots the double encoding and undoes it',
        'The call fails with an error that the path is badly encoded',
      ],
      answer: 1,
      explain: 'The server then returns not found. Encode once, at the point where the URL is built.',
    },
    {
      type: 'single',
      prompt: 'What naming rule would you agree with stores to avoid these problems?',
      options: [
        'Any characters the share allows, since the flow percent encodes each path it builds',
        'Lower case letters, digits and underscores, with store and date in a fixed order',
        'Readable names with spaces and mixed case, so staff can find files on the share',
        'Names without extensions, so no Windows tool opens or locks a file by mistake',
      ],
      answer: 1,
      explain: 'Allow one dot, before the extension. A fixed pattern also lets the flow check the store and the date from the name.',
    },
  ],
  description: `
Larkfield Grocers collects store files from an Azure File Share. Stores write the files from a Windows tool. The Mule app reads them over the REST API. Some files are never picked up, and support found names such as \`Sales 0142 #2.CSV\` and \`stock:0150.csv\` in the logs.

**Questions**
1. How does Azure File Share treat upper and lower case in names?
2. Which names cannot exist on a share?
3. What does URL encoding have to do with a file not found?
4. Which naming rule would you agree with the stores?
`,
  answerTemplate: `## Case in names

## Names that cannot exist

## URL encoding

## A naming rule
`,
  keyPoints: [
    'Azure Files keeps case but does not match on it.',
    'Blob names are case sensitive, so behaviour changes on a move.',
    'Windows reserved characters are not allowed.',
    'Paths in REST calls must be percent encoded once.',
    'Double encoding gives not found errors.',
    'Agree a fixed, plain naming pattern with senders.',
  ],
  solution: `
**1. Case.** Azure Files keeps the case a name was written with, but treats names that differ only by case as the same file, much like a Windows share. Blob Storage does not. Code that works on the share can break after a move to blobs.

**2. Names that cannot exist.** Characters such as backslash, slash, colon, asterisk, question mark, quote, angle brackets and pipe are not allowed, and there are length limits. A name like \`stock:0150.csv\` most likely never reached the share, so the problem is on the store side.

**3. URL encoding.** The REST API takes the path in the URL. Spaces, # and % must be percent encoded. A raw # cuts the URL. Encoding twice turns % into %25, so the server looks for another name. Encode once, where the URL is built.

**4. A naming rule.** Lower case letters, digits and underscores, the store number and date in fixed positions, and one known extension. The flow can then check the name before reading the file.
`,
  followUps: [
    {
      q: 'What does the flow do with a name that breaks the rule?',
      a: 'Move it to an error folder and report it to the store team. Do not guess what the store meant.',
    },
    {
      q: 'Does SMB access from a server have the same limits?',
      a: 'Yes, the same character rules apply. Encoding is only a concern for REST calls, since SMB paths are not URLs.',
    },
    {
      q: 'Where would you check the exact limits?',
      a: 'In the Azure Files naming documentation for the API version you use, since limits are listed there per resource type.',
    },
  ],
}
