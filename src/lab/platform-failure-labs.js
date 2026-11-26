// Guided labs of the More production failures group, one file per lab.
import { LABS as duplicateOrders } from './failures/duplicate-orders.lab.js'
import { LABS as schedulerTwice } from './failures/scheduler-twice.lab.js'
import { LABS as expiredCert } from './failures/expired-cert.lab.js'
import { LABS as dbPool } from './failures/db-pool.lab.js'
import { LABS as retryStorm } from './failures/retry-storm.lab.js'
import { LABS as sasExpired } from './failures/sas-expired.lab.js'
import { LABS as smtpAuth } from './failures/smtp-auth.lab.js'

export const FAILURE_LABS = [...duplicateOrders, ...schedulerTwice, ...expiredCert, ...dbPool, ...retryStorm, ...sasExpired, ...smtpAuth]
