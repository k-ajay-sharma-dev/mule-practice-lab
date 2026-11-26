export default {
  id: 'ms-228',
  category: 'mulesoft',
  title: 'File Uploads in Mule 4: Reading and Sending multipart/form-data',
  level: 'INTERMEDIATE',
  tags: ['multipart', 'http-listener', 'http-request', 'dataweave', 'file-upload', 'mime-type', 'insurance'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A form posts a field `policyNo` and a file field `photo` as multipart/form-data. How does DataWeave reach the file content?',
      options: ['`payload.photo.content`', '`payload.parts.photo.content`', '`attributes.parts.photo.content`', '`payload.parts.photo.body`'],
      answer: 1,
      explain: 'DataWeave reads multipart as an object with `parts`. Each part is keyed by its form field name and has `headers` and `content`.',
    },
    {
      type: 'single',
      prompt: 'Support says every stored photo is named `photo`, because the flow uses the key of the part as the file name. Where is the name the browser sent for that file?',
      options: [
        'In the Content-Type header of the `photo` part',
        'In the Content-Disposition header of that part',
        'In the Content-Disposition header of the request',
        'In `payload.parts.photo.content.name`, set by the reader',
      ],
      answer: 1,
      explain: 'The key of a part is its form field name. Each part carries its own headers, and its Content-Disposition holds the field name and, for a file, the file name the browser sent. The request headers describe the whole body, not each part. Content-Type holds the media type, and the content is the raw file data.',
    },
    {
      type: 'single',
      prompt: 'The upload file name is `../../etc/passwd`. The flow writes the file to disk under that name. What is the risk?',
      options: [
        'The File connector strips the path parts, so it saves `passwd` in the upload folder',
        'The write may land outside the upload folder',
        'The write fails with `FILE:ACCESS_DENIED`, as Mule writes only inside its app folder',
        'The working directory of the File config keeps the write inside that folder',
      ],
      answer: 1,
      explain: 'The file name is input from the caller and cannot be trusted. The File connector does not strip `../`, and a working directory is only the base that relative paths start from, so `../` climbs out of it. Mule can write wherever its operating system user may write. Build the stored name yourself, such as a generated id plus a checked extension.',
    },
    {
      type: 'single',
      prompt: 'Mule must send a PDF and a JSON part to a claims system. How do you build the request body?',
      options: [
        'Join the parts as text with a boundary you type by hand',
        'A Transform with `output multipart/form-data` and a `parts` object',
        'Set the payload to the PDF and put the JSON in a header',
        'Base64 the PDF into the JSON and send application/json',
      ],
      answer: 1,
      explain: 'The multipart writer builds the body and the boundary for you. The object has `parts`, and each part has its own headers, such as Content-Disposition and Content-Type, and its content. The claims system expects multipart, so a JSON body does not fit.',
    },
    {
      type: 'multi',
      prompt: 'Which checks belong in the upload flow before the file is stored?',
      options: [
        'A limit on the file size',
        'The content type is one you accept, such as image/jpeg or application/pdf',
        'The caller\'s file name has no spaces, so it can serve as the storage path',
        'Required form fields such as policyNo are present',
        'The file extension is an accepted one, which proves the content is safe',
        'The file part is converted to Base64, so it can be checked as text',
      ],
      answer: [0, 1, 3],
      explain: 'Limit size, accept known types and check required fields. Never use the caller\'s file name as a path, with or without spaces; generate your own storage name. An extension is chosen by the caller, so it proves nothing about the content. Converting the file to Base64 adds about a third to its size and checks nothing.',
    },
    {
      type: 'single',
      prompt: 'The flow logs the whole payload of every upload at INFO. What is wrong with that?',
      options: [
        'The Logger prints only the part names and headers, so support cannot see the bad file',
        'It copies the photo bytes of each upload into the log',
        'The Logger holds the flow until the whole upload is in the log file, so uploads time out',
        'Logging the stream uses it up, so the photo is lost',
      ],
      answer: 1,
      explain: 'The Logger writes the whole payload, file bytes included, so the logs fill with large binary data and personal photos. Mule 4 logs asynchronously by default, so the flow does not wait for the log file, and a repeatable stream can be read again after the Logger. Log the field values that help support, such as the policy number, the part names and sizes. Never the file content.',
    },
  ],
  description: `
Ashgrove Mutual lets customers send photos of car damage with a claim. The web form posts \`multipart/form-data\` with three parts: \`policyNo\`, \`claimType\` and one file field \`photo\`. A Mule app receives it on an HTTP listener, stores the photo, and forwards the claim with the photo to a claims system that also expects multipart.

Last week an upload of 60 MB slowed the app, and a security review flagged that the stored file uses the name the browser sent.

**Questions**
1. How does DataWeave expose a multipart request, and how do you read a field, a file and its file name?
2. Why must the stored file name not come from the upload, and what do you use instead?
3. How do you build a multipart request to the claims system?
4. What limits and checks do you add, and what do you log?
`,
  answerTemplate: `## Reading the parts

## The file name

## Sending multipart

## Limits, checks and logging
`,
  keyPoints: [
    'DataWeave reads multipart as an object with parts, keyed by field name.',
    'Each part has its own headers and content.',
    'The file name sits in the Content-Disposition header of its part.',
    'The file name comes from the caller, so never use it as a storage path.',
    'output multipart/form-data writes the parts and the boundary for you.',
    'Limit the size, accept known content types, and log ids and sizes, not file content.',
  ],
  solution: `
**1. Reading.** With a \`multipart/form-data\` payload, DataWeave gives an object with \`parts\`. \`payload.parts.policyNo.content\` is the policy number, and \`payload.parts.photo.content\` is the image. The part's \`headers\` hold its Content-Type and the Content-Disposition with the original file name.

**2. File name.** The name is chosen by the caller, so it can hold path parts such as \`../\` or odd characters. Store the photo under a name you build, such as the claim id and a generated id, and pick the extension from the content type you accepted. Keep the original name only as a field in the claim record if support needs it.

**3. Sending.** A Transform with \`output multipart/form-data\` writes an object such as \`{ parts: { claim: { headers: { "Content-Type": "application/json" }, content: ... }, photo: { headers: { "Content-Disposition": { name: "photo", filename: "damage.jpg" }, "Content-Type": "image/jpeg" }, content: ... } } }\`. The writer adds the boundary, and the HTTP request sends the body with the matching Content-Type.

**4. Limits and logging.** Put a size limit in front of the app, for example at the gateway, and reject large uploads early with 413. Check that the content type is one you accept and that required fields are present, and answer 400 when they are not. Log the policy number, part names and sizes. Never log the file content.
`,
  followUps: [
    {
      q: 'Why not ask the web form to send the photo as Base64 inside JSON?',
      a: 'Base64 makes the data about a third larger and the whole JSON must be read to reach it. Multipart sends the file as it is and keeps the other fields separate.',
    },
    {
      q: 'How do you test the upload flow in MUnit?',
      a: 'Build a multipart payload in the test with a small sample image and the form fields, set the right MIME type, and run the flow. Mock the storage and the claims system call, then assert on what they received.',
    },
    {
      q: 'The claims system rejects the request with 415. What do you check first?',
      a: 'Check the Content-Type the request sent. It must be multipart/form-data with the boundary the writer used, and each part must carry the content type the claims system expects.',
    },
  ],
}
