// The guided lab aws-s3-denied. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { allowed, arnBucket, arnKey, arnUser, newAwsAccount, policyDoc, putPolicy, REGION } from '../platform-aws.js'
import { ARCHIVER } from './aws-s3-denied.pkg.js'

const USER = 'svc-invoice-archiver'
const BUCKET = 'brightmart-finance-archive'
const KMS_ALIAS = 'alias/brightmart-finance'
const KEY_ID = 'AKIA_LAB_0002204'
const SECRET = 'lab-only/invoice-archiver-2204'
const SEC = 'lena.okafor'
const POLICY = 'invoice-archive-write'

const y = (s) => s.aws ?? {}
const keyArn = (s) => Object.values(y(s).keys ?? {}).find((k) => k.alias === KMS_ALIAS)?.arn ?? ''
const a = (s) => app(s, ARCHIVER)
const running = (s) => a(s)?.status === 'Running'
const headerOk = (s) => running(s) && String(a(s)?.props?.['s3.serverSideEncryption'] ?? '').trim() === 'aws:kms'
const kmsOk = (s) => Boolean(s.aws?.users?.[USER]) && allowed(y(s), `user:${USER}`, 'kms:GenerateDataKey', keyArn(s)) && !allowed(y(s), `user:${USER}`, 'kms:ScheduleKeyDeletion', keyArn(s)) && !allowed(y(s), `user:${USER}`, 'kms:GenerateDataKey', arnKey('00000000-0000-4000-a000-000000000000'))
const kmsObjects = (s) => Object.values(y(s).buckets?.[BUCKET]?.objects ?? {}).filter((o) => o.sse === 'aws:kms' && o.by === USER).length

const BUCKET_POLICY = policyDoc(
  { Sid: 'DenyUnencryptedObjectUploads', Effect: 'Deny', Principal: '*', Action: 's3:PutObject', Resource: arnBucket(BUCKET, '*'), Condition: { StringNotEquals: { 's3:x-amz-server-side-encryption': 'aws:kms' } } },
  { Sid: 'DenyInsecureTransport', Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: [arnBucket(BUCKET), arnBucket(BUCKET, '*')], Condition: { Bool: { 'aws:SecureTransport': 'false' } } },
)

function account(now) {
  return newAwsAccount(now, {
    users: [
      { name: USER, keys: [{ id: KEY_ID, secret: SECRET, created: at(-40, 10) }], policies: { [POLICY]: policyDoc({ Sid: 'WriteInvoices', Effect: 'Allow', Action: 's3:PutObject', Resource: arnBucket(BUCKET, 'invoices/*') }, { Sid: 'ListArchive', Effect: 'Allow', Action: 's3:ListBucket', Resource: arnBucket(BUCKET) }) } },
      { name: SEC, managed: ['AdministratorAccess'] },
    ],
    keys: [{ alias: KMS_ALIAS, created: at(-2, 15) }],
    buckets: [
      { name: BUCKET, created: at(-200, 9), objects: { 'invoices/2026/10/INV-88101.pdf': { body: '%PDF-1.7 invoice INV-88101 (lab copy)', t: at(-1, 17), by: USER }, 'invoices/2026/11/INV-88400.pdf': { body: '%PDF-1.7 invoice INV-88400 (lab copy)', t: at(1, 7, 35), by: USER } } },
      { name: 'brightmart-web-assets', created: at(-300, 9) },
    ],
  })
}

// 08:05: the change SEC-2290 of the security team on the bucket
function securityChange(s) {
  const x = structuredClone(s)
  const b = x.aws.buckets[BUCKET]
  b.encryption = { type: 'SSE-KMS', key: KMS_ALIAS }
  b.policy = BUCKET_POLICY
  for (const [m, name, msg] of [
    [3, 'PutBucketEncryption', 'Change SEC-2290: default encryption SSE-KMS with alias/brightmart-finance'],
    [5, 'PutBucketPolicy', 'Change SEC-2290: deny uploads without SSE-KMS, deny plain HTTP'],
  ])
    x.aws.trail.push({ id: `5ec2290${m}-0000-4000-a000-00000000000${m}`, t: at(1, 8, m), ip: '198.51.100.40', src: 's3', name, user: SEC, arn: arnUser(SEC), key: '', res: arnBucket(BUCKET), code: '', msg })
  return x
}

const lab = {
  id: 'p-aws-s3-denied',
  group: 'Data and cloud',
  title: 'S3 says Access Denied',
  minutes: 25,
  scenario: `${ARCHIVER} writes every closed invoice of Brightmart as a PDF to the S3 bucket ${BUCKET}, as IAM user ${USER}. Since about 08:05 each run fails and the backlog grows. Finance asks why no invoice of today is in the archive. At 08:05 the security team ran change SEC-2290 on the bucket. Find why S3 refuses the uploads, fix it with the least rights, and get the backlog archived.`,
  start() {
    let s = newPlatform({
      clock: at(1, 7, 40),
      apps: [
        newApp(ARCHIVER, {
          props: { 'aws.region': REGION, 'aws.accessKeyId': KEY_ID, 's3.bucket': BUCKET, 's3.prefix': 'invoices/', 's3.serverSideEncryption': 'AES256' },
          secrets: { 'aws.secretAccessKey': SECRET },
          store: { next: 88401 },
        }),
      ],
      aws: account(at(1, 7, 40)),
      mail: [
        {
          t: at(1, 9, 5),
          to: OPS,
          subject: 'Invoices missing in the archive',
          body: `Good morning. The invoice archive in S3 has nothing from today after INV-88400. Our auditors pull from ${BUCKET} at noon. Can you check? Brightmart finance`,
          source: 'Brightmart finance',
        },
      ],
    })
    s = until(s, at(1, 8, 5))
    s = securityChange(s)
    return until(s, at(1, 9, 10))
  },
  steps: [
    sawLogs(ARCHIVER),
    {
      title: 'Find the refused uploads in CloudTrail',
      how: `AWS from the console menu, CloudTrail tab, Event history. Set Lookup attributes to User name and enter ${USER}. The Error code column shows AccessDenied. Open one PutObject event: its errorMessage names the type of policy that denied it. Then look up the user ${SEC}: two changes on the bucket at 08:03 and 08:05.`,
      done: (s) => Boolean(s.seen['aws:event:AccessDenied']),
    },
    {
      title: 'Read the bucket policy',
      how: `S3 tab, bucket ${BUCKET}, Permissions. The bucket policy has two Deny statements. Then the Properties tab: Default encryption is now SSE-KMS with ${KMS_ALIAS}.`,
      done: (s) => Boolean(s.seen[`aws:s3:${BUCKET}:Permissions`]),
    },
    ask(
      'Why the allow does not help',
      `The policy ${POLICY} of ${USER} allows s3:PutObject on invoices/*. Why is the upload still refused?`,
      [
        'The user policy is too old and must be created again',
        `The statement DenyUnencryptedObjectUploads denies s3:PutObject when the header x-amz-server-side-encryption is not aws:kms. The app sends AES256. An explicit deny in any policy wins over every allow`,
        'S3 needs the AmazonS3FullAccess policy for any upload',
        'The bucket policy only applies to other accounts',
      ],
      1,
      'IAM evaluates every policy that applies: an explicit Deny anywhere ends it, then any Allow grants, else the implicit deny. A bucket policy with Principal * covers the user of the same account too. StringNotEquals is also met when the key is missing, so leaving the header out would be denied as well.',
    ),
    {
      title: 'Send the right encryption header',
      how: `Runtime Manager, Applications, ${ARCHIVER}, Settings, Properties. Set s3.serverSideEncryption to aws:kms and Apply Changes. The bucket default is now SSE-KMS with ${KMS_ALIAS}, so the app sends no key ID and S3 takes the default key.`,
      done: headerOk,
    },
    ask(
      'Why KMS joins in',
      `After the header fix the error changes to kms:GenerateDataKey. Why does an upload need a KMS permission at all?`,
      [
        'S3 calls KMS GenerateDataKey for each object with SSE-KMS, as the caller. The caller needs kms:GenerateDataKey to write and kms:Decrypt to read, allowed by the key policy or by IAM when the key policy lets IAM decide',
        'KMS checks the bucket policy again',
        'Only the root user may upload encrypted objects',
        'The connector must encrypt the PDF itself first',
      ],
      0,
      'With SSE-KMS, S3 asks KMS for a data key on behalf of the caller, so CloudTrail shows a GenerateDataKey event with the user as the caller. The default key policy has the statement Enable IAM User Permissions for the account root, which hands the decision to IAM policies. Without that statement only the key policy can grant.',
    ),
    {
      title: 'Allow the key, and only this key',
      how: `IAM tab, Users, ${USER}, Permissions. Edit the policy ${POLICY} and add a statement: Effect Allow, Action kms:GenerateDataKey, Resource the ARN of ${KMS_ALIAS} (KMS tab shows it). Save changes. Not kms:* and not Resource *. Check it in Policy simulator: kms:GenerateDataKey on the key is allowed, kms:ScheduleKeyDeletion is denied.`,
      done: kmsOk,
    },
    {
      title: 'Archive the backlog',
      how: `Move the clock 10 minutes. The next runs write the backlog. S3 tab, ${BUCKET}, Objects: the new invoices under invoices/2026/11/ show encryption SSE-KMS. The logs show no error and the backlog is 0.`,
      done: (s) => headerOk(s) && kmsOk(s) && (a(s)?.store?.backlog ?? [1]).length === 0 && kmsObjects(s) >= 6 && Boolean(s.seen[`aws:s3:${BUCKET}:Objects`]),
    },
  ],
  why: `An S3 AccessDenied names its reason in the message: an explicit deny in a resource-based policy points at the bucket policy, no identity-based policy allows points at IAM, and a kms: action points at the key. Evaluate as AWS does: an explicit Deny anywhere wins, then an Allow in the identity or bucket policy, else the implicit deny. A bucket policy that requires SSE-KMS denies any upload that does not send x-amz-server-side-encryption aws:kms, and StringNotEquals also matches a missing header. With SSE-KMS every upload makes S3 call kms:GenerateDataKey as the caller, and every download kms:Decrypt, so the caller needs those actions on that key. Grant them on the key ARN only. CloudTrail shows the denied call, the policy type that denied it, and the change that started it.`,
  docs: 'https://docs.mulesoft.com/amazon-s3-connector/latest/',
  solve(start) {
    let s = [`logs:${ARCHIVER}`, 'aws:trail', 'aws:event:AccessDenied', `aws:s3:${BUCKET}:Permissions`].reduce(mark, start)
    s = change(s, ARCHIVER, { props: { ...a(s).props, 's3.serverSideEncryption': 'aws:kms' } })
    const doc = JSON.parse(s.aws.users[USER].policies[POLICY])
    doc.Statement.push({ Sid: 'UseFinanceKey', Effect: 'Allow', Action: 'kms:GenerateDataKey', Resource: keyArn(s) })
    s = putPolicy(s, 'user', USER, POLICY, JSON.stringify(doc)).state
    s = until(s, s.clock + 11 * 60000)
    return mark(s, `aws:s3:${BUCKET}:Objects`)
  },
  answers: { 3: 1, 5: 0 },
}

export const LABS = [lab]
