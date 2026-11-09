// Answers for rm-095 to rm-106. swap: [from, to] or [from, to, file] applied to the model answer. See a.js and core.js.
const valid = 'The file is valid RAML 1.0'

export default [
  {
    id: 'rm-095',
    wrong: [
      { swap: [['baseUri: https://api.example.com/parcel-rates/{version}', 'baseUri: https://api.example.com/parcel-rates/v1']], fails: 'baseUri ends with the {version} placeholder' },
      { swap: [['version: v1\n', 'version: 1.0\n']], fails: 'The version is v1' },
      { swap: [['protocols: [ HTTPS ]', 'protocols: [ HTTP, HTTPS ]']], fails: 'Only HTTPS is allowed' },
      { swap: [['/quotes:\n', '/v1/quotes:\n']], fails: 'No resource path repeats the version' },
      { swap: [['/quotes:\n', '/{version}/quotes:\n']], fails: 'No resource path repeats the version' },
      { swap: [['      200:\n        body:\n          type: RateQuote[]', '      201:\n        body:\n          type: RateQuote[]']], fails: 'POST /quotes returns 200' },
      { swap: [['        maximum: 30\n', '']], fails: 'RateRequest has required postcodes' },
      { swap: [['enum: [ STANDARD, EXPRESS ]', 'enum: [ STANDARD, EXPRESS, SAME_DAY ]']], fails: 'RateQuote.service only allows' },
    ],
    right: [
      {
        swap: [
          ['      service:\n        type: string\n        enum: [ STANDARD, EXPRESS ]\n', '      service: ServiceLevel\n'],
          ['types:\n  RateRequest:\n', 'types:\n  ServiceLevel:\n    type: string\n    enum: [ EXPRESS, STANDARD ]\n  RateRequest:\n'],
        ],
      },
      { swap: [['          type: RateQuote[]\n', '          type: array\n          items: RateQuote\n'], ['    body:\n      type: RateRequest\n', '    body:\n      application/json:\n        type: RateRequest\n']] },
    ],
  },
  {
    id: 'rm-096',
    wrong: [
      { swap: [['      nextCursor: string | nil\n', '      nextCursor?: string | nil\n']], fails: 'nextCursor is always present' },
      { swap: [['      nextCursor: string | nil\n', '      nextCursor: string\n']], fails: 'nextCursor is always present' },
      { swap: [['            default: 25\n', '']], fails: 'limit is an optional integer' },
      { swap: [['            maximum: 100\n', '            maximum: 1000\n']], fails: 'limit is an optional integer' },
      { swap: [['              type: TransactionPage\n', '              type: Transaction[]\n']], fails: 'GET returns 200 with a TransactionPage' },
      { swap: [['          since?:\n            type: datetime\n', '          since?:\n            type: string\n']], fails: 'since is an optional datetime' },
      { swap: [['          cursor?:\n', '          cursor:\n']], fails: 'cursor is an optional string' },
      {
        swap: [['    example:\n      items:\n        - transactionId: TX-90412\n          merchant: Bean There Cafe\n          amount: 3.80\n          postedAt: 2026-11-02T08:14:00Z\n      nextCursor: djEtVFgtOTA0MTI\n', '']],
        fails: 'The 200 response has an example',
      },
      { swap: [['postedAt: 2026-11-02T08:14:00Z', 'postedAt: 02/11/2026 08:14']], fails: valid },
    ],
    right: [
      { swap: [['nextCursor: string | nil', 'nextCursor: string?'], ['{cardId}', '{id}']] },
      { swap: [['      nextCursor: string | nil\n', '      nextCursor:\n        type: nil | string\n        required: true\n'], ['            default: 25\n', '            default: 25\n            format: int32\n']] },
    ],
  },
  {
    id: 'rm-097',
    wrong: [
      { swap: [['      202:\n        headers:\n          Location:', '      201:\n        headers:\n          Location:']], fails: 'POST returns 202 with a TranscodeJob' },
      { swap: [['          Location:\n            type: string\n            description: The URL of the job monitor.\n', '']], fails: 'POST returns 202 with a TranscodeJob' },
      { swap: [['        303:\n', '        302:\n']], fails: 'returns 303 with a Location header' },
      { swap: [['          headers:\n            Retry-After:\n              type: integer\n              description: Seconds to wait before polling again.\n', '']], fails: 'The job monitor returns 200' },
      { swap: [['enum: [ QUEUED, PROCESSING, SUCCEEDED, FAILED, CANCELLED ]', 'enum: [ QUEUED, PROCESSING, SUCCEEDED, FAILED ]']], fails: 'exactly the five job states' },
      { swap: [['        202:\n          description: The cancel request was accepted.\n', '        204:\n          description: The job was cancelled.\n']], fails: 'DELETE on the job returns 202' },
      { swap: [['        type: Profile[]\n        minItems: 1\n', '        type: Profile[]\n']], fails: 'TranscodeRequest has a required sourceUrl' },
      { swap: [['        type: Profile[]\n', '        type: string[]\n']], fails: 'TranscodeRequest has a required sourceUrl' },
      { swap: [['      percentComplete?:\n', '      percentComplete:\n']], fails: 'percentComplete is an optional integer' },
      { swap: [['enum: [ 1080p, 720p, 480p ]', 'enum: [ 1080p, 720p, 480p, 4k ]']], fails: 'Profile only allows' },
    ],
    right: [
      { swap: [['{jobId}', '{id}'], ['{renditionId}', '{id}'], ['              type: integer\n              description: Seconds to wait before polling again.\n', '              type: string\n              description: Seconds to wait, or an HTTP date.\n']] },
      {
        swap: [
          ['      status:\n        type: string\n        enum: [ QUEUED, PROCESSING, SUCCEEDED, FAILED, CANCELLED ]\n', '      status: JobStatus\n'],
          ['types:\n  Profile:\n', 'types:\n  JobStatus:\n    type: string\n    enum: [ CANCELLED, QUEUED, PROCESSING, SUCCEEDED, FAILED ]\n  Profile:\n'],
          ['        type: Profile[]\n        minItems: 1\n', '        type: array\n        items: Profile\n        minItems: 1\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-098',
    wrong: [
      { swap: [['        maxItems: 200\n', '        maxItems: 500\n']], fails: 'LabOrderBatch.items holds 1 to 200' },
      { swap: [['      status:\n        type: integer\n        minimum: 200\n        maximum: 599\n', '      status: string\n']], fails: 'ItemResult.status is a required integer' },
      { swap: [['      orderId?: string\n', '      orderId: string\n']], fails: 'orderId is optional' },
      { swap: [['  ItemResult:\n    type: object\n    properties:\n      clientRef: string\n', '  ItemResult:\n    type: object\n    properties:\n']], fails: 'ItemResult echoes a required clientRef' },
      { swap: [['          default: false\n', '          default: true\n']], fails: 'atomic is an optional boolean' },
      { swap: [['        atomic?:\n          type: boolean\n          default: false\n', '        atomic?:\n          type: string\n          default: "false"\n']], fails: 'atomic is an optional boolean' },
      {
        swap: [['          description: The batch was atomic and at least one item failed. Nothing was saved.\n          body:\n            type: BatchResult\n', '          description: The batch was atomic and at least one item failed. Nothing was saved.\n          body:\n            type: Error\n']],
        fails: 'It returns 422 with a BatchResult',
      },
      { swap: [['        207:\n', '        200:\n']], fails: 'It returns 207 with a BatchResult' },
      {
        swap: [['            example:\n              results:\n                - clientRef: WARD7-001\n                  status: 201\n                  orderId: LO-558120\n                - clientRef: WARD7-002\n                  status: 422\n                  error:\n                    code: UNKNOWN_TEST_CODE\n                    message: Test code FBX9 is not offered.\n', '']],
        fails: 'The 207 body has its own example',
      },
      { swap: [['                  status: 422\n', '                  status: "422"\n']], fails: valid },
    ],
    right: [
      { swap: [['        type: LabOrderItem[]\n', '        type: array\n        items: LabOrderItem\n'], ['      results: ItemResult[]\n', '      results:\n        type: array\n        items: ItemResult\n']] },
      { swap: [['        atomic?:\n          type: boolean\n          default: false\n', '        atomic:\n          type: boolean\n          required: false\n          default: false\n'], ['      error?: Error\n', '      error:\n        type: Error\n        required: false\n']] },
    ],
  },
  {
    id: 'rm-099',
    wrong: [
      { swap: [['        type: Photo[]\n', '        type: file[]\n']], fails: 'InspectionUpload.photos is a required Photo[]' },
      { swap: [['fileTypes: [ image/jpeg, image/png ]', 'fileTypes: [ image/jpeg, image/png, image/gif ]']], fails: 'Photo is a file limited to JPEG and PNG' },
      { swap: [['    type: file\n', '    type: string\n']], fails: 'Photo is a file limited to JPEG and PNG' },
      { swap: [['    maxLength: 8388608\n', '    maxLength: 8000000\n']], fails: 'Photo has a maxLength of 8 MB' },
      { swap: [['          multipart/form-data:\n', '          application/json:\n']], fails: 'POST takes an InspectionUpload as multipart/form-data' },
      { swap: [['        maxItems: 20\n', '']], fails: 'InspectionUpload.photos is a required Photo[]' },
      { swap: [['      takenAt: datetime\n', '      takenAt: string\n']], fails: 'room is a required string and takenAt' },
      { swap: [['          415:\n            description: A photo is not a JPEG or a PNG.\n', '']], fails: 'POST returns 413 for a large file' },
      { swap: [['            headers:\n              Location:\n                type: string\n            body:\n              type: PhotoSet\n', '            body:\n              type: PhotoSet\n']], fails: 'POST returns 201 with a PhotoSet' },
      { swap: [['      notes?:\n        type: string\n        maxLength: 1000\n', '      notes?: string\n']], fails: 'notes is an optional string' },
    ],
    right: [
      { swap: [['fileTypes: [ image/jpeg, image/png ]', 'fileTypes: [ image/png, image/jpeg ]'], ['        type: Photo[]\n', '        type: array\n        items: Photo\n']] },
      { swap: [['{inspectionId}', '{id}'], ['{photoSetId}', '{setId}'], ['      takenAt: datetime\n', '      takenAt:\n        type: datetime\n        required: true\n']] },
    ],
  },
  {
    id: 'rm-100',
    wrong: [
      { swap: [['      If-None-Match?:\n', '      If-None-Match:\n']], fails: 'GET /drugs takes an optional If-None-Match' },
      { swap: [['      If-Modified-Since?:\n        type: datetime\n        format: rfc2616\n', '      If-Modified-Since?:\n        type: datetime\n']], fails: 'If-Modified-Since header as an rfc2616 datetime' },
      { swap: [['        description: The list has not changed since the version the store holds.\n', '        description: The list has not changed since the version the store holds.\n        body:\n          type: Drug[]\n']], fails: 'GET /drugs returns 304 with no body' },
      { swap: [['        description: The list has not changed since the version the store holds.\n        headers:\n          ETag:\n            type: string\n', '        description: The list has not changed since the version the store holds.\n']], fails: 'The 304 repeats the ETag header' },
      { swap: [['        If-Match:\n', '        If-Match?:\n']], fails: 'needs a required If-Match header' },
      { swap: [['          Cache-Control:\n            type: string\n            example: max-age=300\n', '']], fails: 'Last-Modified and Cache-Control' },
      { swap: [['        412:\n', '        409:\n']], fails: 'DELETE returns 412' },
      { swap: [['        maximum: 4\n', '        maximum: 5\n']], fails: 'Drug has required ndc and name' },
      { swap: [['        204:\n          description: The drug was removed from the formulary.\n', '        204:\n          body:\n            type: Drug\n']], fails: 'DELETE returns 204 with no body' },
    ],
    right: [
      { swap: [['{ndc}', '{code}'], ['      If-None-Match?:\n        type: string\n        description: The ETag the store already holds.\n', '      If-None-Match:\n        type: string\n        required: false\n']] },
      { swap: [['          type: Drug[]\n', '          type: array\n          items: Drug\n'], ['            type: datetime\n            format: rfc2616\n', '            type: string\n']] },
    ],
  },
  {
    id: 'rm-101',
    wrong: [
      {
        swap: [['/mandates:\n  /{reference}:\n', '/mandates:\n  post:\n    body:\n      type: Mandate\n    responses:\n      201:\n        body:\n          type: Mandate\n  /{reference}:\n']],
        fails: 'Mandates are created with PUT',
      },
      { swap: [['        200:\n          description: The mandate already existed and is unchanged or updated.\n          body:\n            type: Mandate\n', '']], fails: 'PUT returns 201 for a new mandate and 200' },
      {
        swap: [['pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'pattern: "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"']],
        fails: 'Idempotency-Key is a required header',
      },
      { swap: [['pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'pattern: ^[0-9a-f-]{16,64}$']], fails: 'Idempotency-Key is a required header' },
      { swap: [['      Idempotency-Key:\n', '      Idempotency-Key?:\n']], fails: 'Idempotency-Key is a required header' },
      { swap: [['  post:\n    headers:\n      Idempotency-Key:', '  post:\n    queryParameters:\n      Idempotency-Key:']], fails: 'Idempotency-Key is a required header' },
      { swap: [['      422:\n        description: This key was already used with a different body.\n        body:\n          type: Error\n', '']], fails: 'POST returns 422' },
      { swap: [['        description: A request with this key is still being processed.\n        body:\n          type: Error\n', '        description: A request with this key is still being processed.\n']], fails: 'POST returns 409' },
      { swap: [['        minimum: 0.01\n', '        minimum: 0\n']], fails: 'CollectionRequest has a required mandateReference' },
      { swap: [['      201:\n        headers:\n          Location:\n            type: string\n        body:\n          type: Collection\n', '      201:\n        body:\n          type: Collection\n']], fails: 'POST returns 201 with a Collection' },
    ],
    right: [
      { swap: [['{reference}', '{mandateReference}'], ['pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', "pattern: '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'"]] },
      {
        swap: [
          ['/mandates:\n', 'traits:\n  idempotent:\n    headers:\n      Idempotency-Key:\n        type: string\n        pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\n\n/mandates:\n'],
          ['  post:\n    headers:\n      Idempotency-Key:\n        type: string\n        pattern: ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$\n        description: A UUID the caller creates once per collection and repeats on every retry.\n', '  post:\n    is: [ idempotent ]\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-102',
    wrong: [
      { swap: [['        pattern: ^https://\n', '        pattern: ^https?://\n']], fails: 'callbackUrl is required and only allows https://' },
      { swap: [['        pattern: ^https://\n', '        pattern: https://\n']], fails: 'callbackUrl is required and only allows https://' },
      { swap: [['        uniqueItems: true\n', '']], fails: 'events is a required EventType[]' },
      { swap: [['      subscriptionId: string\n', '      subscriptionId: string\n      signingSecret: string\n']], fails: 'Subscription never shows the signingSecret' },
      { swap: [['        200:\n          body:\n            type: Subscription\n        404:', '        200:\n          body:\n            type: SubscriptionCreated\n        404:']], fails: 'Reads return Subscription, never SubscriptionCreated' },
      { swap: [['          type: SubscriptionCreated\n', '          type: Subscription\n']], fails: 'POST returns 201 with a SubscriptionCreated' },
      { swap: [['enum: [ device.offline, alarm.triggered, battery.low ]', 'enum: [ device.offline, device.online, alarm.triggered, battery.low ]']], fails: 'EventType has exactly the three event names' },
      { swap: [['          202:\n            description: A test event will be sent to the callback URL.\n', '          200:\n            description: A test event was sent.\n']], fails: 'test returns 202' },
      { swap: [['        204:\n          description: The subscription was removed. No more events are sent.\n', '        200:\n          description: The subscription was removed.\n']], fails: 'DELETE returns 204 with no body' },
    ],
    right: [
      { swap: [['        pattern: ^https://\n', "        pattern: '^https://[^ ]+$'\n"], ['{subscriptionId}', '{id}']] },
      {
        swap: [
          ['  Subscription:\n    type: SubscriptionRequest\n    properties:\n', '  Subscription:\n    type: object\n    properties:\n      callbackUrl:\n        type: string\n        pattern: ^https://\n      events:\n        type: EventType[]\n        minItems: 1\n        uniqueItems: true\n'],
          ['          type: Subscription[]\n', '          type: array\n          items: Subscription\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-103',
    wrong: [
      { swap: [['      phone?: string | nil\n', '      phone?: string\n']], fails: 'MemberPatch.phone is optional and may be null' },
      { swap: [['      firstName?: string\n      lastName?: string\n      email?: string\n      phone?: string | nil', '      firstName: string\n      lastName?: string\n      email?: string\n      phone?: string | nil']], fails: 'In MemberPatch, firstName, lastName and email are optional' },
      { swap: [['      mealPreference?: MealPreference | nil\n', '      mealPreference?: MealPreference | nil\n      tier?:\n        type: string\n        enum: [ BLUE, SILVER, GOLD ]\n']], fails: 'MemberPatch has minProperties 1 and no tier' },
      { swap: [['  MemberPatch:\n    type: object\n', '  MemberPatch:\n    type: Member\n']], fails: 'MemberPatch has minProperties 1 and no tier' },
      { swap: [['        application/merge-patch+json:\n', '        application/json:\n']], fails: 'PATCH takes a MemberPatch as application/merge-patch+json' },
      { swap: [['    minProperties: 1\n', '']], fails: 'MemberPatch has minProperties 1' },
      { swap: [['    patch:\n', '    put:\n      body:\n        type: Member\n      responses:\n        200:\n          body:\n            type: Member\n    patch:\n']], fails: 'there is no PUT on a member' },
      { swap: [['      mealPreference?: MealPreference | nil\n', '      mealPreference?: MealPreference\n']], fails: 'MemberPatch.mealPreference is optional and may be' },
      { swap: [['        422:\n          body:\n            type: Error\n', '']], fails: 'PATCH returns 415 for another media type and 422' },
    ],
    right: [
      { swap: [['      phone?: string | nil\n', '      phone?: nil | string\n'], ['      mealPreference?: MealPreference | nil\n', '      mealPreference?: MealPreference?\n']] },
      {
        swap: [
          ['{memberId}', '{id}'],
          ['      phone?: string | nil\n', '      phone:\n        type: string | nil\n        required: false\n'],
          ['    example:\n      mealPreference: VEGAN\n      phone: null\n', '    examples:\n      changeMeal:\n        mealPreference: VEGAN\n      removePhone:\n        phone: null\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-104',
    wrong: [
      { swap: [['baseUri: https://api.example.com/tariffs\n', 'version: v2\nbaseUri: https://api.example.com/tariffs/{version}\n']], fails: 'baseUri is https://api.example.com/tariffs with no version' },
      { swap: [['  TariffV2:\n    type: object\n', '  TariffV2:\n    type: TariffV1\n']], fails: 'TariffV2 has no pricePerKwh' },
      { swap: [['      pricePerKwh: number\n', '      pricePerKwh?: number\n']], fails: 'TariffV1 is unchanged' },
      { swap: [['  deprecatedVersion:\n    responses:\n      200:\n        headers:\n', '  deprecatedVersion:\n    headers:\n']], fails: 'The deprecatedVersion trait puts Deprecation and Sunset on the 200' },
      { swap: [['      get:\n        is: [ deprecatedVersion ]\n', '      get:\n']], fails: 'Both v1 methods use deprecatedVersion' },
      { swap: [['  sunset:\n    type: date-only\n', '  sunset:\n    type: string\n']], fails: 'annotated (sunset): 2027-06-30' },
      { swap: [['  (sunset): 2027-06-30\n', '']], fails: 'annotated (sunset): 2027-06-30' },
      { swap: [['  (sunset): 2027-06-30\n', '  (sunset): 30/06/2027\n']], fails: valid },
      { swap: [['          404:\n            body:\n              type: Error\n', '          404:\n            description: No tariff has this code.\n']], fails: 'v2 returns TariffV2, and 404 with an Error' },
      { swap: [['      unitRate: Money\n', '      unitRate: number\n']], fails: 'TariffV2 has a required unitRate' },
      { swap: [['/v2:\n', '/tariffs:\n  get:\n    responses:\n      200:\n        body:\n          type: TariffV2[]\n\n/v2:\n']], fails: 'No unversioned /tariffs resource is left' },
    ],
    right: [
      { swap: [['  /tariffs:\n    get:\n      is: [ deprecatedVersion ]\n', '  /tariffs:\n    is: [ deprecatedVersion ]\n    get:\n'], ['{tariffCode}', '{code}']] },
      {
        swap: [
          ['            type: datetime\n            format: rfc2616\n', '            type: string\n'],
          ['      currency: string\n', '      currency:\n        type: string\n        pattern: ^[A-Z]{3}$\n'],
          ['    allowedTargets: [ Resource ]\n', ''],
        ],
      },
    ],
  },
  {
    id: 'rm-105',
    wrong: [
      { swap: [['      <<okStatus>>:\n', '      200:\n']], fails: 'The 202 on POST /bookings carries the rate limit headers' },
      { swap: [['      <<okStatus>>:\n', '      202:\n']], fails: 'The 200 on both GET methods carries the rate limit headers' },
      { swap: [['        pattern: ^[A-Z]{5}$\n', '        pattern: ^[A-Za-z]{5}$\n']], fails: 'originPort and destinationPort are 5 capital letters' },
      { swap: [['        pattern: ^[A-Z]{5}$\n', '        pattern: "[A-Z]{5}"\n']], fails: 'originPort and destinationPort are 5 capital letters' },
      { swap: [['      is: [ rateLimited: { okStatus: 200 } ]\n', '']], fails: 'Every method uses rateLimited' },
      { swap: [['        maxLength: 64\n', '']], fails: 'POST /bookings uses idempotent' },
      { swap: [['    is: [ idempotent, rateLimited: { okStatus: 202 } ]\n', '    is: [ rateLimited: { okStatus: 202 } ]\n']], fails: 'POST /bookings uses idempotent' },
      { swap: [['        headers:\n          Retry-After:\n            type: integer\n            description: Seconds to wait before calling again.\n', '']], fails: 'The rateLimited trait holds a 429 with a Retry-After header' },
      { swap: [['      202:\n        headers:\n          Location:', '      201:\n        headers:\n          Location:']], fails: 'returns 202 with a Booking and a Location header' },
      { swap: [['      nextCursor: string | nil\n', '      nextCursor?: string | nil\n']], fails: 'BookingPage has items and a nextCursor' },
      { swap: [['        maximum: 50\n', '        maximum: 100\n']], fails: 'BookingRequest has a shipperId, 1 to 50 containers' },
    ],
    right: [
      {
        swap: [
          ['<<okStatus>>', '<<successCode>>'],
          ['okStatus to', 'successCode to'],
          ['{ okStatus: 202 }', '{ successCode: 202 }'],
          ['{ okStatus: 200 }', '{ successCode: 200 }'],
          ['{ okStatus: 200 }', '{ successCode: 200 }'],
        ],
      },
      {
        swap: [
          ['    is: [ idempotent, rateLimited: { okStatus: 202 } ]\n', '    is:\n      - idempotent\n      - rateLimited:\n          okStatus: 202\n'],
          ['        pattern: ^[A-Z]{5}$\n', "        pattern: '^[A-Z]{5}$'\n"],
          ['      nextCursor: string | nil\n', '      nextCursor: nil | string\n'],
        ],
      },
    ],
  },
  {
    id: 'rm-106',
    wrong: [
      { swap: [['fileTypes: [ text/csv ]', 'fileTypes: [ text/csv, application/vnd.ms-excel ]']], fails: 'ImportFile is a file limited to text/csv' },
      { swap: [['    maxLength: 20971520\n', '    maxLength: 20000000\n']], fails: 'ImportFile has a maxLength of 20 MB' },
      { swap: [['      file: ImportFile\n', '      file: file\n']], fails: 'ImportUpload has a required ImportFile' },
      { swap: [['        default: false\n', '        default: true\n']], fails: 'dryRun is an optional boolean' },
      { swap: [['      multipart/form-data:\n', '      application/json:\n']], fails: 'POST takes an ImportUpload as multipart/form-data' },
      { swap: [['      202:\n', '      201:\n']], fails: 'POST returns 202 with an ImportJob' },
      { swap: [['        minimum: 2\n', '        minimum: 1\n']], fails: 'RowError has a rowNumber of at least 2' },
      { swap: [['enum: [ QUEUED, VALIDATING, LOADING, COMPLETED, COMPLETED_WITH_ERRORS, FAILED ]', 'enum: [ QUEUED, VALIDATING, LOADING, COMPLETED, FAILED ]']], fails: 'exactly the six job states' },
      { swap: [['          409:\n            description: The import has not finished, so the error list is not final.\n            body:\n              type: Error\n', '']], fails: 'The errors resource returns a RowErrorPage, 409' },
      { swap: [['            default: 100\n', '']], fails: 'limit from 1 to 500, default 100' },
      { swap: [['              type: RowErrorPage\n', '              type: RowError[]\n']], fails: 'The errors resource returns a RowErrorPage' },
      { swap: [['          headers:\n            Retry-After:\n              type: integer\n              description: Seconds to wait before polling again.\n', '']], fails: 'The import job returns 200 with an ImportJob and a Retry-After' },
      { swap: [['        - rowNumber: 4127\n', '        - rowNumber: 1\n']], fails: valid },
    ],
    right: [
      { swap: [['{importId}', '{id}'], ['      nextCursor: string | nil\n', '      nextCursor: string?\n']] },
      { swap: [['      dryRun?:\n        type: boolean\n        default: false\n', '      dryRun:\n        type: boolean\n        required: false\n        default: false\n'], ['      items: RowError[]\n', '      items:\n        type: array\n        items: RowError\n']] },
    ],
  },
]
