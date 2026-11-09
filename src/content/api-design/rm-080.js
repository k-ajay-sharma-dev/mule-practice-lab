export default {
  id: 'rm-080',
  category: 'api-design',
  title: 'Smart Home API: A Mixed List of Devices with a Discriminator',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'data-types', 'discriminator', 'inheritance', 'arrays', 'iot'],
  estMinutes: 30,
  description: `
A smart home platform serves 260,000 homes with an average of 14 devices each. The app opens on one screen that lists every device in the home: thermostats, door locks and cameras together. Each kind has its own fields, and the app must know which kind each item is before it can draw it.

The base type \`Device\` names a **discriminator**, the property that says which kind an item is. Each child type extends \`Device\` and sets its own \`discriminatorValue\`. A list declared as \`Device[]\` can then hold any mix of children, and each item says what it is.

**Requirements**
- Title \`Smart Home API\`, with JSON as the default media type.
- \`Device\` with required strings \`deviceId\`, \`kind\` and \`name\`, and a required boolean \`online\`. \`kind\` is its discriminator.
- \`Thermostat\` extends \`Device\` with the value \`thermostat\`. It adds a required number \`targetC\` from 5 to 30 and a required number \`currentC\`.
- \`SmartLock\` extends \`Device\` with the value \`lock\`. It adds a required boolean \`locked\` and a required integer \`batteryPct\` from 0 to 100.
- \`Camera\` extends \`Device\` with the value \`camera\`. It adds a required boolean \`recording\` and a required string \`resolution\` that only allows \`720p\`, \`1080p\` and \`4k\`.
- \`GET /homes/{homeId}/devices\` returns \`Device[]\` with status 200. The response has its own example that holds one device of each kind.
- \`POST /homes/{homeId}/devices\` takes a \`Device\` and returns a \`Device\` with status 201. It returns 422 for a kind the home hub does not support.
`,
  starter: `#%RAML 1.0
title: Smart Home API
mediaType: application/json

types:
  Device:
    type: object
    properties:
      deviceId: string
      name: string
      online: boolean
      targetC?: number
      locked?: boolean
      recording?: boolean

/homes:
  /{homeId}:
    /devices:
`,
  ramlChecks: [
    {
      label: 'Device has a required deviceId, kind, name and boolean online',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Device', prop: 'deviceId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Device', prop: 'kind', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Device', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Device', prop: 'online', want: { type: 'boolean', required: true } },
        ],
      },
    },
    { label: 'Device uses kind as its discriminator', rule: { type: 'typeDecl', name: 'Device', want: { discriminator: { is: 'kind' } } } },
    {
      label: 'Device no longer holds the fields of one kind',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Thermostat' },
          { type: 'noProp', typeName: 'Device', prop: 'targetC' },
          { type: 'noProp', typeName: 'Device', prop: 'locked' },
          { type: 'noProp', typeName: 'Device', prop: 'recording' },
        ],
      },
    },
    {
      label: 'Thermostat extends Device with the value thermostat and a targetC from 5 to 30',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Thermostat', extends: 'Device', want: { discriminatorValue: { is: 'thermostat' } } },
          { type: 'prop', typeName: 'Thermostat', prop: 'targetC', want: { type: 'number', required: true, minimum: 5, maximum: 30 } },
          { type: 'prop', typeName: 'Thermostat', prop: 'currentC', want: { type: 'number', required: true } },
        ],
      },
    },
    {
      label: 'SmartLock extends Device with the value lock and a batteryPct from 0 to 100',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'SmartLock', extends: 'Device', want: { discriminatorValue: { is: 'lock' } } },
          { type: 'prop', typeName: 'SmartLock', prop: 'locked', want: { type: 'boolean', required: true } },
          { type: 'prop', typeName: 'SmartLock', prop: 'batteryPct', want: { type: 'integer', required: true, minimum: 0, maximum: 100 } },
        ],
      },
    },
    {
      label: 'Camera extends Device with the value camera and a resolution of 720p, 1080p or 4k',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Camera', extends: 'Device', want: { discriminatorValue: { is: 'camera' } } },
          { type: 'prop', typeName: 'Camera', prop: 'recording', want: { type: 'boolean', required: true } },
          { type: 'prop', typeName: 'Camera', prop: 'resolution', want: { required: true, enum: { exactly: ['720p', '1080p', '4k'] } } },
        ],
      },
    },
    { label: 'GET devices returns Device[] with its own example', rule: { type: 'response', path: '/homes/{}/devices', method: 'get', status: '200', typeIs: 'Device[]', example: 'own' } },
    {
      label: 'POST devices takes a Device and returns a Device with 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/homes/{}/devices', method: 'post', typeIs: 'Device' },
          { type: 'response', path: '/homes/{}/devices', method: 'post', status: '201', typeIs: 'Device' },
        ],
      },
    },
    { label: 'POST devices returns 422 for an unsupported kind', rule: { type: 'response', path: '/homes/{}/devices', method: 'post', status: '422' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Smart Home API
mediaType: application/json

types:
  Device:
    type: object
    discriminator: kind
    properties:
      deviceId: string
      kind: string
      name: string
      online: boolean
  Thermostat:
    type: Device
    discriminatorValue: thermostat
    properties:
      targetC:
        type: number
        minimum: 5
        maximum: 30
      currentC: number
  SmartLock:
    type: Device
    discriminatorValue: lock
    properties:
      locked: boolean
      batteryPct:
        type: integer
        minimum: 0
        maximum: 100
  Camera:
    type: Device
    discriminatorValue: camera
    properties:
      recording: boolean
      resolution:
        type: string
        enum: [ 720p, 1080p, 4k ]

/homes:
  /{homeId}:
    /devices:
      get:
        responses:
          200:
            body:
              type: Device[]
              example:
                - deviceId: D-1001
                  kind: thermostat
                  name: Hall thermostat
                  online: true
                  targetC: 20.5
                  currentC: 19.0
                - deviceId: D-1002
                  kind: lock
                  name: Front door
                  online: true
                  locked: true
                  batteryPct: 64
                - deviceId: D-1003
                  kind: camera
                  name: Driveway
                  online: false
                  recording: false
                  resolution: 1080p
      post:
        body:
          type: Device
        responses:
          201:
            body:
              type: Device
          422:
            description: The home hub does not support this kind of device.
`,
  keyPoints: [
    'discriminator sits on the base type, and the property it names must be declared there.',
    'discriminatorValue sits on each child. Without it, the value is the name of the child type.',
    'A list of the base type, Device[], can hold any mix of children.',
    'Each kind keeps its own fields required, where one wide type makes them all optional.',
  ],
  solution: `
The starter put every field on \`Device\` and made the kind-specific ones optional. A lock with a \`targetC\` was valid, and a thermostat with no \`targetC\` was valid too.

Now \`Device\` holds what all devices share and names \`kind\` as the discriminator. Each child adds its own fields and keeps them required. A thermostat with \`kind: thermostat\` must have \`targetC\` and \`currentC\`.

\`discriminatorValue\` keeps the wire values short and stable. The app reads \`lock\`, not \`SmartLock\`, so renaming the type later does not break any client.

The list is declared as \`Device[]\`, and the example shows the point of the design: three kinds in one response. A new kind, such as a smoke alarm, is a new child type and changes nothing on the resource.

\`422\` fits a body that is well formed but names a kind this hub cannot handle.
`,
  followUps: [
    {
      q: 'What should an old app do when it meets a kind it does not know?',
      a: 'Skip it or show a generic tile with the name and online status from Device. Plan for this from the start, because new kinds will arrive.',
    },
    {
      q: 'Why not a union type, Thermostat | SmartLock | Camera?',
      a: 'A union forces a reader to try each member. The discriminator names the kind in one property, so a reader picks the right type straight away.',
    },
    {
      q: 'How would a Mule flow route a new device to the right vendor cloud?',
      a: 'A Choice router on payload.kind, with one route per kind. Each route calls the vendor connector for that device.',
    },
    {
      q: 'Why should Device not set additionalProperties to false?',
      a: 'Children add properties that Device does not list. A closed base type would reject targetC on a thermostat when the item is checked as a Device.',
    },
  ],
}
