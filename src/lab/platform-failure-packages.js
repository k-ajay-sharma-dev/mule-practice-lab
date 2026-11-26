// Sample applications of the More production failures labs, one file per lab.
import { PACKAGES as duplicateOrders } from './failures/duplicate-orders.pkg.js'
import { PACKAGES as schedulerTwice } from './failures/scheduler-twice.pkg.js'
import { PACKAGES as expiredCert } from './failures/expired-cert.pkg.js'
import { PACKAGES as dbPool } from './failures/db-pool.pkg.js'
import { PACKAGES as retryStorm } from './failures/retry-storm.pkg.js'
import { PACKAGES as sasExpired } from './failures/sas-expired.pkg.js'
import { PACKAGES as smtpAuth } from './failures/smtp-auth.pkg.js'

export const FAILURE_PACKAGES = { ...duplicateOrders, ...schedulerTwice, ...expiredCert, ...dbPool, ...retryStorm, ...sasExpired, ...smtpAuth }
