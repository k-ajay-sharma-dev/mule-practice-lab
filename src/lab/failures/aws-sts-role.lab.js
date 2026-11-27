// The guided lab aws-sts-role. See platform-labs.js for the shape of a lab.
import { at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { allowed, arnBucket, arnRole, arnUser, awsCtx, createAccessKey, newAwsAccount, policyDoc, readJson, REGION, setTrustPolicy } from '../platform-aws.js'
import { MEDIA_SYNC } from './aws-sts-role.pkg.js'

const USER = 'svc-media-sync'
const DEV = 'tomas.berg'
const ROLE = 'brightmart-media-reader'
const BUCKET = 'brightmart-product-media'
const OLD_KEY = 'AKIA_LAB_0005501'
const DEV_KEY = { id: 'AKIA_LAB_0005590', secret: 'lab-only/tomas-laptop-5590' }

const a = (s) => app(s, MEDIA_SYNC)
const user = (s) => s.aws?.users?.[USER]
const activeKey = (s) => (user(s)?.keys ?? []).find((k) => k.status === 'Active')
const props = (s) => a(s)?.props ?? {}
const secrets = (s) => a(s)?.secrets ?? {}
const word = (v) => String(v ?? '').trim()
const propsOk = (s) => {
  const k = activeKey(s)
  return Boolean(k) && a(s)?.status === 'Running' && word(props(s)['aws.accessKeyId']) === k.id && secrets(s)['aws.secretAccessKey'] === k.secret && props(s)['aws.secretAccessKey'] === undefined && word(props(s)['aws.roleArn']) === arnRole(ROLE) && !word(props(s)['aws.sessionToken']) && !word(secrets(s)['aws.sessionToken'])
}
const trustOk = (s) => {
  const doc = readJson(s.aws?.roles?.[ROLE]?.trust)
  const named = (doc?.Statement ?? []).some((st) => st.Effect === 'Allow' && [].concat(st.Principal?.AWS ?? []).includes(arnUser(USER)))
  const open = (doc?.Statement ?? []).some((st) => st.Effect === 'Allow' && (st.Principal === '*' || [].concat(st.Principal?.AWS ?? []).includes('*')))
  return named && !open && allowed(s.aws, `user:${USER}`, 'sts:AssumeRole', arnRole(ROLE))
}
const sessionsOf = (s) => Object.values(s.aws?.sessions ?? {}).filter((x) => x.app === MEDIA_SYNC && x.from === arnUser(USER))

function account(now) {
  const objects = Object.fromEntries(['H-1250', 'H-1300', 'H-2000', 'H-2210', 'H-1400', 'H-3120', 'H-3300', 'H-3410'].map((sku, i) => [`incoming/${sku}.jpg`, { body: `JPEG image of ${sku} (lab copy)`, t: at(1, 6, i * 5) }]))
  return newAwsAccount(now, {
    users: [
      { name: USER, keys: [{ id: OLD_KEY, secret: 'lab-only/media-sync-5501', status: 'Inactive', created: at(-91, 9) }], policies: { 'assume-media-reader': policyDoc({ Sid: 'AssumeMediaReader', Effect: 'Allow', Action: 'sts:AssumeRole', Resource: arnRole(ROLE) }) } },
      { name: DEV, keys: [{ ...DEV_KEY, created: at(-30, 9) }], policies: { 'assume-media-reader': policyDoc({ Sid: 'AssumeMediaReader', Effect: 'Allow', Action: 'sts:AssumeRole', Resource: arnRole(ROLE) }) } },
    ],
    roles: [{ name: ROLE, created: at(0, 16), maxSession: 3600, desc: 'Read the product images', trust: policyDoc({ Sid: 'Developers', Effect: 'Allow', Principal: { AWS: arnUser(DEV) }, Action: 'sts:AssumeRole' }), policies: { 'read-product-media': policyDoc({ Sid: 'ReadImages', Effect: 'Allow', Action: 's3:GetObject', Resource: arnBucket(BUCKET, 'incoming/*') }, { Sid: 'ListImages', Effect: 'Allow', Action: 's3:ListBucket', Resource: arnBucket(BUCKET) }) } }],
    buckets: [{ name: BUCKET, created: at(-400, 9), objects }],
    trail: [{ t: at(1, 7), src: 'iam', name: 'UpdateAccessKey', user: 'brightmart-key-rotation', arn: arnUser('brightmart-key-rotation'), key: '', res: arnUser(USER), code: '', msg: `${OLD_KEY} Inactive: older than 90 days` }],
  })
}

const lab = {
  id: 'p-aws-sts-role',
  group: 'Data and cloud',
  title: 'ExpiredToken after one hour',
  minutes: 30,
  scenario: `${MEDIA_SYNC} copies new product images from the S3 bucket ${BUCKET}. Yesterday the security team moved S3 access to the role ${ROLE}: the IAM user ${USER} may only assume it. At 07:00 the key rotation job set the 90 day old key of ${USER} to Inactive, and the app failed. At 08:12 the developer ${DEV} got it running again from his laptop. Since about 09:10 it fails again with ExpiredToken. Make the app get its own credentials, so it keeps working.`,
  start() {
    let s = newPlatform({
      clock: at(1, 8),
      apps: [newApp(MEDIA_SYNC, { props: { 'aws.region': REGION, 'aws.accessKeyId': OLD_KEY, 's3.bucket': BUCKET }, secrets: { 'aws.secretAccessKey': 'lab-only/media-sync-5501' }, store: {} })],
      aws: account(at(1, 8)),
      mail: [
        {
          t: at(1, 9, 30),
          to: OPS,
          subject: 'New product images missing again',
          body: `Hi. The images of this morning stopped coming again at about 09:10. I put temporary credentials into the app at 08:12 to get it going, sorry, that was a quick fix. Can you set it up properly? Tomas`,
          source: DEV,
        },
      ],
    })
    s = until(s, at(1, 8, 10))
    // the developer runs aws sts assume-role on his laptop and pastes the result into the properties
    s = structuredClone(s)
    const r = awsCtx(s, { name: 'aws-cli' }).sts({ accessKeyId: DEV_KEY.id, secretAccessKey: DEV_KEY.secret, region: REGION }, 'AssumeRole', { RoleArn: arnRole(ROLE), RoleSessionName: 'tomas-laptop', DurationSeconds: 3600 })
    s = until(s, at(1, 8, 12))
    s = change(s, MEDIA_SYNC, { props: { 'aws.region': REGION, 'aws.accessKeyId': r.Credentials.AccessKeyId, 's3.bucket': BUCKET }, secrets: { 'aws.secretAccessKey': r.Credentials.SecretAccessKey, 'aws.sessionToken': r.Credentials.SessionToken } })
    return until(s, at(1, 9, 40))
  },
  steps: [
    sawLogs(MEDIA_SYNC),
    {
      title: 'Find where the credentials came from',
      how: `AWS from the console menu, CloudTrail tab, Event history. Set Lookup attributes to Event name and type AssumeRole. Open the event of ${DEV} at 08:10: session tomas-laptop on ${ROLE}, DurationSeconds 3600. The access key in the app properties starts with ASIA, the prefix of temporary credentials.`,
      done: (s) => Boolean(s.seen['aws:event:AssumeRole']),
    },
    ask(
      'Why the app cannot go on',
      'Why can the app not renew the credentials it got at 08:12?',
      [
        'Temporary credentials from AssumeRole end at their expiration, at most the maximum session duration of the role. Renewing means calling AssumeRole again, which needs long term credentials of a principal the role trusts. The app has only the temporary set',
        'The session token must be rotated in Key Vault each hour',
        'S3 rejects session tokens from laptops',
        'The connector renews them only on a restart',
      ],
      0,
      'An ASIA key, its secret and its session token work until the Expiration that STS returned. Nothing extends them. A Mule app needs its own source credentials, an IAM user key here, and the Role ARN in the connector so it can assume the role and assume it again before the session ends. On EC2 or EKS an instance profile or IRSA would give the source credentials instead.',
    ),
    {
      title: 'Give the app user a new access key',
      how: `IAM tab, Users, ${USER}, Security credentials. The old key is Inactive. Create access key and copy the access key ID and the secret access key: the secret shows only once. You may delete the old key after you make it Inactive.`,
      done: (s) => Boolean(activeKey(s)),
    },
    {
      title: 'Let the connector assume the role',
      how: `Runtime Manager, ${MEDIA_SYNC}, Settings, Properties. Set aws.accessKeyId to the new key ID and aws.secretAccessKey to its secret, Protected. Add aws.roleArn ${arnRole(ROLE)}. Remove aws.sessionToken. Apply Changes.`,
      done: propsOk,
    },
    {
      title: 'Trust the app user in the role',
      how: `The logs now show AccessDenied on sts:AssumeRole. IAM tab, Roles, ${ROLE}, Trust relationships, Edit trust policy. Add the ARN ${arnUser(USER)} to Principal AWS, next to ${DEV}, and Update policy. Not "*".`,
      done: trustOk,
    },
    ask(
      'Two policies for one role',
      `${USER} has a policy that allows sts:AssumeRole on ${ROLE}. Why did it still get AccessDenied?`,
      [
        'The policy needs sts:* to work',
        'A role is entered only when both sides agree. The trust policy of the role says who may assume it. The permissions of the caller say what it may call. The trust policy named only the developer',
        'The role was in another region',
        'The access key was not active yet',
      ],
      1,
      'For AssumeRole AWS checks the trust policy of the role, a resource policy whose principal is the caller, together with the identity policy of the caller. When the trust policy names the user ARN directly, it is enough in the same account; when it names the account root, the identity policy must allow too. What the session may do then comes from the permissions policies of the role.',
    ),
    {
      title: 'Prove the session renews',
      how: `Move the clock 65 minutes. The session lasts 3600 seconds and the connector assumes the role again 5 minutes before it ends. CloudTrail shows two AssumeRole events of ${USER}, and every run of ${MEDIA_SYNC} in that hour worked.`,
      done: (s) => {
        if (!propsOk(s) || !trustOk(s)) return false
        const runs = (a(s).store?.runs ?? []).filter((x) => x.t > s.clock - 60 * MINUTE)
        return sessionsOf(s).length >= 2 && runs.length >= 10 && runs.every((x) => x.ok)
      },
    },
  ],
  why: 'Temporary credentials from STS, with an access key that starts with ASIA and a session token, expire at the end of the session, one hour by default. Pasting them into an app makes it fail an hour later with ExpiredToken. Give the app its own source credentials, an IAM user key in protected properties or an instance profile, and let the connector assume the role with Role ARN, so it assumes it again before the session ends. Assuming a role needs the trust policy of the role to allow the caller, and the permissions of the role decide what the session can do. CloudTrail shows who called AssumeRole, with which duration, and the errors that followed.',
  docs: 'https://docs.mulesoft.com/amazon-s3-connector/latest/',
  solve(start) {
    let s = [`logs:${MEDIA_SYNC}`, 'aws:trail', 'aws:event:AssumeRole'].reduce(mark, start)
    const k = createAccessKey(s, USER)
    s = k.state
    s = change(s, MEDIA_SYNC, { props: { 'aws.region': REGION, 'aws.accessKeyId': k.result.id, 's3.bucket': BUCKET, 'aws.roleArn': arnRole(ROLE) }, secrets: { 'aws.secretAccessKey': k.result.secret } })
    const trust = readJson(s.aws.roles[ROLE].trust)
    trust.Statement[0].Principal.AWS = [arnUser(DEV), arnUser(USER)]
    s = setTrustPolicy(s, ROLE, JSON.stringify(trust)).state
    return until(s, s.clock + 66 * MINUTE)
  },
  answers: { 2: 0, 6: 1 },
}

export const LABS = [lab]
