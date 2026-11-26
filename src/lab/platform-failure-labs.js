// Guided labs of the More production failures group, one file per lab.
import { LABS as duplicateOrders } from './failures/duplicate-orders.lab.js'
import { LABS as schedulerTwice } from './failures/scheduler-twice.lab.js'
import { LABS as expiredCert } from './failures/expired-cert.lab.js'
import { LABS as dbPool } from './failures/db-pool.lab.js'
import { LABS as retryStorm } from './failures/retry-storm.lab.js'
import { LABS as sasExpired } from './failures/sas-expired.lab.js'
import { LABS as smtpAuth } from './failures/smtp-auth.lab.js'
import { LABS as ledBreakingChange } from './failures/led-breaking-change.lab.js'
import { LABS as ledChattyCalls } from './failures/led-chatty-calls.lab.js'
import { LABS as ledStaleCache } from './failures/led-stale-cache.lab.js'
import { LABS as ledLostCorrelation } from './failures/led-lost-correlation.lab.js'
import { LABS as ledPiiExposure } from './failures/led-pii-exposure.lab.js'
import { LABS as mqAckTimeout } from './failures/mq-ack-timeout.lab.js'
import { LABS as jwtKeyRotation } from './failures/jwt-key-rotation.lab.js'
import { LABS as mockUrlProd } from './failures/mock-url-prod.lab.js'

export const FAILURE_LABS = [...duplicateOrders, ...schedulerTwice, ...expiredCert, ...dbPool, ...retryStorm, ...sasExpired, ...smtpAuth, ...ledBreakingChange, ...ledChattyCalls, ...ledStaleCache, ...ledLostCorrelation, ...ledPiiExposure, ...mqAckTimeout, ...jwtKeyRotation, ...mockUrlProd]
