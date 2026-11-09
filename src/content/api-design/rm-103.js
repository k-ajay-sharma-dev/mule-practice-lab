export default {
  id: 'rm-103',
  category: 'api-design',
  title: 'Loyalty Member Profile API: PATCH with JSON Merge Patch',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'http-methods', 'patch', 'nullable', 'media-types', 'airline'],
  estMinutes: 30,
  description: `
An airline's loyalty programme has 14 million members. The mobile app lets a member change one thing at a time, such as an email or a meal preference. Today the app must send the whole profile with \`PUT\`, and two devices editing different fields overwrite each other.

The team moves to **PATCH** with **JSON Merge Patch** (RFC 7396), media type \`application/merge-patch+json\`. Its rules are short:
- A field in the patch replaces that field.
- A field left out of the patch stays as it is.
- A field set to \`null\` is **removed**.

That last rule shapes the patch type. Every field is optional, because a patch sends only what changes. A field that a member may clear, such as \`phone\`, must also accept \`null\`. A field that every member must have, such as \`email\`, must not.

The member's \`tier\` is set by the programme from flights flown. A member must not be able to change it, so it does not appear in the patch type at all.

**Requirements**
- Keep the title \`Loyalty Member Profile API\` and JSON as the default media type.
- A type \`MealPreference\`, a string that is one of \`STANDARD\`, \`VEGETARIAN\`, \`VEGAN\`, \`HALAL\`, \`KOSHER\`.
- A type \`Member\` with required strings \`memberId\`, \`firstName\`, \`lastName\` and \`email\`, an optional string \`phone\`, an optional \`mealPreference\` of type \`MealPreference\`, and a required \`tier\` that is exactly one of \`BLUE\`, \`SILVER\`, \`GOLD\`.
- A type \`MemberPatch\` with optional strings \`firstName\`, \`lastName\` and \`email\`, an optional \`phone\` that may be a string or null, and an optional \`mealPreference\` that may be a \`MealPreference\` or null. It has \`minProperties: 1\` and no \`tier\`.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`GET /members/{memberId}\` returns 200 with a \`Member\`, or 404.
- \`PATCH /members/{memberId}\` takes a \`MemberPatch\` as \`application/merge-patch+json\`. It returns 200 with the updated \`Member\`, 404, 415 for any other media type, and 422 with an \`Error\` for a value that breaks a rule.
- There is no \`PUT\` on a member.
`,
  starter: `#%RAML 1.0
title: Loyalty Member Profile API
mediaType: application/json

types:
  Member:
    type: object
    properties:
      memberId: string
      firstName: string
      lastName: string
      email: string
      phone?: string
      tier:
        type: string
        enum: [ BLUE, SILVER, GOLD ]

/members:
  /{memberId}:
    get:
      responses:
        200:
          body:
            type: Member
    put:
      body:
        type: Member
      responses:
        200:
          body:
            type: Member
`,
  ramlChecks: [
    { label: 'MealPreference has exactly the five options', rule: { type: 'typeDecl', name: 'MealPreference', want: { type: 'string', enum: { exactly: ['STANDARD', 'VEGETARIAN', 'VEGAN', 'HALAL', 'KOSHER'] } } } },
    {
      label: 'Member keeps its required fields, an optional MealPreference and a tier of BLUE, SILVER or GOLD',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Member', prop: 'email', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Member', prop: 'mealPreference', want: { type: 'MealPreference', required: false } },
          { type: 'prop', typeName: 'Member', prop: 'tier', want: { required: true, enum: { exactly: ['BLUE', 'SILVER', 'GOLD'] } } },
        ],
      },
    },
    {
      label: 'In MemberPatch, firstName, lastName and email are optional strings',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'MemberPatch', prop: 'firstName', want: { type: 'string', required: false } },
          { type: 'prop', typeName: 'MemberPatch', prop: 'lastName', want: { type: 'string', required: false } },
          { type: 'prop', typeName: 'MemberPatch', prop: 'email', want: { type: 'string', required: false } },
        ],
      },
    },
    {
      label: 'MemberPatch.phone is optional and may be null, so a member can remove it',
      rule: {
        type: 'any',
        rules: [
          { type: 'prop', typeName: 'MemberPatch', prop: 'phone', want: { type: 'string | nil', required: false } },
          { type: 'prop', typeName: 'MemberPatch', prop: 'phone', want: { type: 'nil | string', required: false } },
          { type: 'prop', typeName: 'MemberPatch', prop: 'phone', want: { type: 'string?', required: false } },
        ],
      },
    },
    {
      label: 'MemberPatch.mealPreference is optional and may be a MealPreference or null',
      rule: {
        type: 'any',
        rules: [
          { type: 'prop', typeName: 'MemberPatch', prop: 'mealPreference', want: { type: 'MealPreference | nil', required: false } },
          { type: 'prop', typeName: 'MemberPatch', prop: 'mealPreference', want: { type: 'nil | MealPreference', required: false } },
          { type: 'prop', typeName: 'MemberPatch', prop: 'mealPreference', want: { type: 'MealPreference?', required: false } },
        ],
      },
    },
    {
      label: 'MemberPatch has minProperties 1 and no tier',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'MemberPatch', want: { minProperties: 1 } },
          { type: 'noProp', typeName: 'MemberPatch', prop: 'tier' },
        ],
      },
    },
    { label: 'PATCH takes a MemberPatch as application/merge-patch+json', rule: { type: 'body', path: '/members/{}', method: 'patch', media: 'application/merge-patch+json', typeIs: 'MemberPatch' } },
    { label: 'PATCH returns 200 with the updated Member, or 404', rule: { type: 'all', rules: [{ type: 'response', path: '/members/{}', method: 'patch', status: '200', typeIs: 'Member' }, { type: 'response', path: '/members/{}', method: 'patch', status: '404' }] } },
    {
      label: 'PATCH returns 415 for another media type and 422 with an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'response', path: '/members/{}', method: 'patch', status: '415' },
          { type: 'response', path: '/members/{}', method: 'patch', status: '422', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET returns a Member, and there is no PUT on a member',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/members/{}', method: 'get', status: '200', typeIs: 'Member' },
          { type: 'response', path: '/members/{}', method: 'get', status: '404' },
          { type: 'noMethod', path: '/members/{}', method: 'put' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Loyalty Member Profile API
mediaType: application/json

types:
  MealPreference:
    type: string
    enum: [ STANDARD, VEGETARIAN, VEGAN, HALAL, KOSHER ]
  Member:
    type: object
    properties:
      memberId: string
      firstName: string
      lastName: string
      email: string
      phone?: string
      mealPreference?: MealPreference
      tier:
        type: string
        enum: [ BLUE, SILVER, GOLD ]
  MemberPatch:
    type: object
    minProperties: 1
    properties:
      firstName?: string
      lastName?: string
      email?: string
      phone?: string | nil
      mealPreference?: MealPreference | nil
    example:
      mealPreference: VEGAN
      phone: null
  Error:
    type: object
    properties:
      code: string
      message: string

/members:
  /{memberId}:
    get:
      responses:
        200:
          body:
            type: Member
        404:
          description: No member has this id.
    patch:
      body:
        application/merge-patch+json:
          type: MemberPatch
      responses:
        200:
          body:
            type: Member
        404:
          description: No member has this id.
        415:
          description: Send the patch as application/merge-patch+json.
        422:
          body:
            type: Error
`,
  keyPoints: [
    'In JSON Merge Patch, a missing field stays, a present field replaces, and null removes.',
    'Every field in a patch type is optional, because a patch sends only what changes.',
    'Only fields that may be cleared accept null. A required field such as email must not.',
    'A field the caller may not change, such as tier, is left out of the patch type.',
    'The patch media type sits under body, so the rest of the API keeps the JSON default.',
  ],
  solution: `
\`MemberPatch\` is a separate type, not \`Member\` with question marks. That lets it differ in three ways: all fields optional, some fields nullable, and \`tier\` absent.

The example shows the merge rules at work. It sets a meal preference and sends \`phone: null\`, which removes the phone. \`firstName\` and the rest are not sent, so they stay as they were.

\`email\` is optional but not nullable. Leaving it out keeps the current email, while \`"email": null\` fails validation, because every member needs one.

\`minProperties: 1\` refuses an empty patch, which would do nothing and usually hides a bug in the app. Removing \`PUT\` means there is one way to change a profile, and the app cannot send the whole member and overwrite \`tier\` with an old value.
`,
  followUps: [
    {
      q: 'What can JSON Merge Patch not express?',
      a: 'It cannot change one item inside an array, because an array in the patch replaces the whole array. It also cannot set a field to null as a value, since null means remove. JSON Patch, RFC 6902, handles both with explicit operations.',
    },
    {
      q: 'Does PATCH stop two devices from overwriting each other?',
      a: 'It narrows the problem to the same field. To stop it fully, return an ETag on GET and require If-Match on PATCH, answering 412 when the tag is out of date.',
    },
    {
      q: 'How would you apply a merge patch in DataWeave?',
      a: 'Merge the stored member with the patch using the plus plus operator after removing keys from the stored record that the patch sets to null. A small recursive function handles nested objects.',
    },
    {
      q: 'Is PATCH idempotent?',
      a: 'A merge patch that sets values is idempotent in practice, since sending it twice gives the same result. HTTP does not promise that for PATCH in general, because a patch could append to a list.',
    },
  ],
}
