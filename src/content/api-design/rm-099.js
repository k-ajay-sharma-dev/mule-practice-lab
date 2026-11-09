export default {
  id: 'rm-099',
  category: 'api-design',
  title: 'Property Inspection API: Upload Several Photos with Form Fields in One multipart Request',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'file-upload', 'multipart', 'data-types', 'real-estate'],
  estMinutes: 30,
  description: `
A letting agency's inspectors visit 600 homes a week. At the end of each room, the tablet app uploads up to 20 photos together with the room name, the time they were taken and a short note. Base64 inside JSON made each upload a third bigger and broke the 10 MB gateway limit, so the team moves to **multipart/form-data**.

In a multipart request, each property of the body type is one form part. A property of type \`file\` is a binary part, and an array of files means the part can repeat. Facets on the file type state what the server accepts:
- \`fileTypes\` lists the allowed media types.
- \`maxLength\` is the largest size in bytes.

Declaring the file rules once in a named type keeps them in one place, and the array then sets how many files a request may hold.

**Requirements**
- Keep the title \`Property Inspection API\` and JSON as the default media type.
- A type \`Photo\` of type \`file\`, limited to \`image/jpeg\` and \`image/png\`, with a \`maxLength\` of 8388608 bytes (8 MB).
- A type \`InspectionUpload\` with:
  - a required \`photos\` of \`Photo[]\`, from 1 to 20 items,
  - a required string \`room\`,
  - a required \`takenAt\` of type \`datetime\`,
  - an optional string \`notes\` of at most 1000 characters.
- A type \`PhotoSet\` with required strings \`photoSetId\` and \`room\`, and a required integer \`photoCount\`.
- \`POST /inspections/{inspectionId}/photos\` takes an \`InspectionUpload\` as \`multipart/form-data\`.
- It returns 201 with a \`PhotoSet\` and a \`Location\` header, 404 for an unknown inspection, 413 for a file that is too large, and 415 for a file that is not JPEG or PNG.
- \`GET /inspections/{inspectionId}/photos/{photoSetId}\` returns 200 with a \`PhotoSet\`, or 404.
`,
  starter: `#%RAML 1.0
title: Property Inspection API
mediaType: application/json

types:
  InspectionUpload:
    type: object
    properties:
      photos: string[]
      room: string
      takenAt: string

/inspections:
  /{inspectionId}:
    /photos:
      post:
        body:
          type: InspectionUpload
`,
  ramlChecks: [
    { label: 'Photo is a file limited to JPEG and PNG', rule: { type: 'typeDecl', name: 'Photo', want: { type: 'file', fileTypes: { exactly: ['image/jpeg', 'image/png'] } } } },
    { label: 'Photo has a maxLength of 8 MB (8388608 bytes)', rule: { type: 'typeDecl', name: 'Photo', want: { maxLength: 8388608 } } },
    { label: 'InspectionUpload.photos is a required Photo[] of 1 to 20 items', rule: { type: 'prop', typeName: 'InspectionUpload', prop: 'photos', want: { type: 'Photo[]', required: true, minItems: 1, maxItems: 20 } } },
    {
      label: 'room is a required string and takenAt a required datetime',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'InspectionUpload', prop: 'room', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'InspectionUpload', prop: 'takenAt', want: { type: 'datetime', required: true } },
        ],
      },
    },
    { label: 'notes is an optional string of at most 1000 characters', rule: { type: 'prop', typeName: 'InspectionUpload', prop: 'notes', want: { type: 'string', required: false, maxLength: 1000 } } },
    { label: 'POST takes an InspectionUpload as multipart/form-data', rule: { type: 'body', path: '/inspections/{}/photos', method: 'post', media: 'multipart/form-data', typeIs: 'InspectionUpload' } },
    {
      label: 'POST returns 201 with a PhotoSet and a Location header',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'PhotoSet', prop: 'photoCount', want: { type: 'integer', required: true } },
          { type: 'response', path: '/inspections/{}/photos', method: 'post', status: '201', typeIs: 'PhotoSet', header: 'Location' },
        ],
      },
    },
    { label: 'POST returns 404 for an unknown inspection', rule: { type: 'response', path: '/inspections/{}/photos', method: 'post', status: '404' } },
    {
      label: 'POST returns 413 for a large file and 415 for a wrong file type',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/inspections/{}/photos', method: 'post', status: '413' },
          { type: 'response', path: '/inspections/{}/photos', method: 'post', status: '415' },
        ],
      },
    },
    {
      label: 'GET on one photo set returns a PhotoSet, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/inspections/{}/photos/{}', method: 'get', status: '200', typeIs: 'PhotoSet' },
          { type: 'response', path: '/inspections/{}/photos/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Property Inspection API
mediaType: application/json

types:
  Photo:
    type: file
    fileTypes: [ image/jpeg, image/png ]
    maxLength: 8388608
  InspectionUpload:
    type: object
    properties:
      photos:
        type: Photo[]
        minItems: 1
        maxItems: 20
      room: string
      takenAt: datetime
      notes?:
        type: string
        maxLength: 1000
  PhotoSet:
    type: object
    properties:
      photoSetId: string
      room: string
      photoCount: integer

/inspections:
  /{inspectionId}:
    /photos:
      post:
        body:
          multipart/form-data:
            type: InspectionUpload
        responses:
          201:
            headers:
              Location:
                type: string
            body:
              type: PhotoSet
          404:
            description: No inspection has this id.
          413:
            description: A photo is larger than 8 MB.
          415:
            description: A photo is not a JPEG or a PNG.
      /{photoSetId}:
        get:
          responses:
            200:
              body:
                type: PhotoSet
            404:
              description: No photo set has this id.
`,
  keyPoints: [
    'multipart/form-data sends binary parts as they are, so there is no base64 overhead.',
    'Each property of the body type becomes one form part, and a file property is a binary part.',
    'fileTypes and maxLength on a named file type state the rules once.',
    'An array of files with minItems and maxItems sets how many files one request may carry.',
    'The request media type sits under body, while responses keep the JSON default.',
  ],
  solution: `
\`Photo\` holds the rules for one file, and \`InspectionUpload.photos\` holds the rules for the set. Keeping them apart means a future \`POST /inspections/{inspectionId}/floor-plans\` can reuse \`Photo\` with a different count.

The body names \`multipart/form-data\` as its media type. Without it, the default \`application/json\` would apply and the contract would describe a JSON body that cannot carry binary data.

413 and 415 are separate because the fix is different: a smaller photo, or a different format. The gateway or the Mule flow can reject both before the files are written anywhere.

In Mule, the HTTP Listener receives the parts, and DataWeave reads them as \`payload.parts.photos\` and so on. Large uploads should be streamed to storage such as S3, not held whole in memory.
`,
  followUps: [
    {
      q: 'Does RAML enforce maxLength on a file part?',
      a: 'The contract states it, and APIkit validation can check it. Set the size limit at the gateway as well, so a huge request is refused before it reaches the worker.',
    },
    {
      q: 'Why not upload each photo in its own request?',
      a: 'One request per room keeps the photos and their room name together, so a set is saved whole or not at all. Separate uploads are better on a weak network, because a failure only repeats one photo.',
    },
    {
      q: 'When would you use a pre-signed upload URL instead?',
      a: 'For very large files such as video walkthroughs. The API returns a short-lived storage URL, the app uploads straight to storage, and the Mule application never carries the bytes.',
    },
  ],
}
