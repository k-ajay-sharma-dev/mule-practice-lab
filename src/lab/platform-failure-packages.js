// Sample applications of the More production failures labs, one file per lab.
import { PACKAGES as duplicateOrders } from './failures/duplicate-orders.pkg.js'
import { PACKAGES as schedulerTwice } from './failures/scheduler-twice.pkg.js'
import { PACKAGES as expiredCert } from './failures/expired-cert.pkg.js'
import { PACKAGES as dbPool } from './failures/db-pool.pkg.js'
import { PACKAGES as retryStorm } from './failures/retry-storm.pkg.js'
import { PACKAGES as sasExpired } from './failures/sas-expired.pkg.js'
import { PACKAGES as smtpAuth } from './failures/smtp-auth.pkg.js'
import { PACKAGES as ledBreakingChange } from './failures/led-breaking-change.pkg.js'
import { PACKAGES as ledChattyCalls } from './failures/led-chatty-calls.pkg.js'
import { PACKAGES as ledStaleCache } from './failures/led-stale-cache.pkg.js'
import { PACKAGES as ledLostCorrelation } from './failures/led-lost-correlation.pkg.js'
import { PACKAGES as ledPiiExposure } from './failures/led-pii-exposure.pkg.js'
import { PACKAGES as mqAckTimeout } from './failures/mq-ack-timeout.pkg.js'
import { PACKAGES as jwtKeyRotation } from './failures/jwt-key-rotation.pkg.js'
import { PACKAGES as mockUrlProd } from './failures/mock-url-prod.pkg.js'

export const FAILURE_PACKAGES = { ...duplicateOrders, ...schedulerTwice, ...expiredCert, ...dbPool, ...retryStorm, ...sasExpired, ...smtpAuth, ...ledBreakingChange, ...ledChattyCalls, ...ledStaleCache, ...ledLostCorrelation, ...ledPiiExposure, ...mqAckTimeout, ...jwtKeyRotation, ...mockUrlProd }
