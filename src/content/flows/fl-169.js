import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const form = (parts) => ({ http: { method: 'POST', path: '/claims/MC-22018/photos', headers: { 'content-type': 'multipart/form-data; boundary=----x' }, body: { parts } } })
const photo = { content: 'JPEG image bytes', headers: { 'Content-Disposition': { name: 'photo', filename: 'front-bumper.jpg' }, 'Content-Type': 'image/jpeg' } }
const note = { content: 'Hit in the car park', headers: { 'Content-Disposition': { name: 'note' }, 'Content-Type': 'text/plain' } }

export default {
  id: 'fl-169',
  category: 'flows',
  title: 'Claim Photos From a Web Form: Take the Photo Part of a Multipart Upload and Store It in Azure Blob Storage',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'multipart', 'upload', 'http', 'insurance'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Photos come in on POST /claims/{claimId}/photos', rule: { type: 'source', component: 'http-listener', where: { path: '/claims/{claimId}/photos', allowedMethods: 'POST' } } },
    { label: 'The upload sends the photo part\'s content, not the whole form', rule: { type: 'exists', component: 'azure-upload-blob', where: { container: 'claim-photos', fileStream: 'parts.photo.content' } } },
    { label: 'The content type comes from the part\'s own headers', rule: { type: 'exists', component: 'azure-upload-blob', where: { contentType: 'Content-Type' } } },
    { label: 'A form without a photo part gets 400', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '400' } } },
    { label: 'The stored photo is recorded against the claim', rule: { type: 'before', first: 'azure-upload-blob', then: 'db-insert', thenWhere: { sql: 'claim_photos' } } },
  ],
  simulation: {
    systems: { db: { tables: { claim_photos: { columns: ['claim_id', 'blob_name', 'content_type'], rows: [] } } } },
    tests: [
      {
        name: 'A photo and a note',
        about: 'The form has a photo part and a note part. Only the photo is stored, as image/jpeg, under the claim, and it is recorded.',
        trigger: form({ photo, note }),
        expect: {
          status: 201,
          connector: [{ type: 'azure-upload-blob', settings: { container: 'claim-photos', contentType: 'image/jpeg', fileStream: 'JPEG image bytes' }, count: 1 }],
          db: { claim_photos: { count: 1, has: [{ claim_id: 'MC-22018', content_type: 'image/jpeg' }] } },
        },
      },
      {
        name: 'A form with no photo',
        about: 'The customer pressed send before choosing a photo. The answer is 400 and nothing is stored.',
        trigger: form({ note }),
        expect: { status: 400, connector: [{ type: 'azure-upload-blob', count: 0 }], db: { claim_photos: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-claim-photo',
      source('http-listener', { path: '/claims/{claimId}/photos', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'claimId', value: '#[attributes.uriParams.claimId]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.parts.photo == null]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '400' }),
              step('set-payload', { value: '#[output application/json --- { message: "The form has no photo part" }]' }),
            ]),
          ],
          {
            otherwise: [
              step('set-variable', { variableName: 'contentType', value: '#[payload.parts.photo.headers."Content-Type"]' }),
              step('set-variable', {
                variableName: 'blobName',
                value: '#[vars.claimId ++ "/" ++ uuid() ++ "-" ++ (payload.parts.photo.headers."Content-Disposition".filename default "photo")]',
              }),
              step('azure-upload-blob', { container: 'claim-photos', fileName: '#[vars.blobName]', fileStream: '#[payload.parts.photo.content]', contentType: '#[payload.parts.photo.headers."Content-Type"]' }),
              step('db-insert', {
                database: 'PostgreSQL',
                sql: 'INSERT INTO claim_photos (claim_id, blob_name, content_type) VALUES (:claimId, :blobName, :contentType)',
                inputParameters: '#[{ claimId: vars.claimId, blobName: vars.blobName, contentType: vars.contentType }]',
              }),
              step('set-variable', { variableName: 'httpStatus', value: '201' }),
              step('set-payload', { value: '#[output application/json --- { claimId: vars.claimId, blobName: vars.blobName }]' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { message: "Photo not stored, please try again" }]' }),
        ]),
      ],
    ),
  ),
  optionalSteps: [{ type: 'on-error-propagate', why: 'It only turns any failure into a 503 with a friendly message. Mule answers 500 by default, which the form also treats as a failure.' }],
  description: `
Mintbridge Motor Insurance, a fictional insurer, lets customers add photos to a claim from a web form. The form posts \`multipart/form-data\` to \`POST /claims/{claimId}/photos\` with two parts: \`photo\` (the image, with its own \`Content-Type\` and a \`filename\` in its \`Content-Disposition\`) and \`note\` (some text).

In Mule, a multipart body is read as \`payload.parts\`, with one entry per part name. Each part has \`content\` and \`headers\`.

**Requirements**
- Store the photo, and only the photo, in the Azure Blob Storage container \`claim-photos\` as \`{claimId}/{unique}-{filename}\`, with the content type the part declares.
- Record it in the PostgreSQL table \`claim_photos\` (\`claim_id\`, \`blob_name\`, \`content_type\`).
- Answer **201** with \`{ claimId, blobName }\`.
- A form without a \`photo\` part gets **400**.

**Design the flow.**
`,
  answerTemplate: `## Reading the multipart body

## Storing the photo

## Recording it

## A form without a photo
`,
  keyPoints: [
    'A multipart body is not one file. Uploading the whole payload would store the form with its boundaries, not the image.',
    'payload.parts.photo.content is the photo\'s bytes; payload.parts.photo.headers holds its Content-Type and Content-Disposition.',
    'Use the part\'s own Content-Type for the blob, not the request\'s multipart/form-data.',
    'Keep the user\'s file name after a unique part, so photos with the same name do not replace each other.',
    'Store first, then record. A failed upload leaves no row pointing at a blob that does not exist.',
  ],
  solution: `
1. **HTTP Listener** \`POST /claims/{claimId}/photos\`.
2. **Set Variable** \`claimId\`.
3. **Choice** \`#[payload.parts.photo == null]\`: \`400\` and a message. Otherwise:
   - \`contentType\` = \`#[payload.parts.photo.headers."Content-Type"]\`.
   - \`blobName\` = claim ID, a UUID and the part's \`filename\`.
   - **Upload Blob** to \`claim-photos\`, content \`#[payload.parts.photo.content]\`.
   - **Database Insert** into \`claim_photos\`, then \`201\`.
4. Optional error handler: \`503\` with a friendly message.

**Size and type limits.** Refuse parts over a size limit and content types other than images before uploading. Set a maximum request size on the listener's side too, at the gateway or load balancer.

**Large photos.** Keep streaming on, so a 15 MB photo is not held in memory more than once.
`,
  followUps: [
    {
      q: 'The form now sends up to five photos as photo1 to photo5. What changes?',
      a: 'Loop over the parts whose names start with photo: payload.parts filterObject ((v, k) -> k startsWith "photo"), and upload each one inside a For Each.',
    },
    {
      q: 'Why not let the browser upload straight to blob storage?',
      a: 'It can, with a short lived write link for one blob name. Mule then hands out the link and records the photo, and the bytes never pass through Mule. It is a good choice for big files.',
    },
  ],
}
