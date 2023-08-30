import * as admin from 'firebase-admin'
import { DocumentSnapshot } from 'firebase-admin/firestore'
import { pubsub, logger } from 'firebase-functions'
import getDeletionRoutineFunction from 'graphql-firebase-subscriptions/firebase-function'
admin.initializeApp()

export enum RsEvents {
  MARK_ADDED = 'MARK_ADDED',
  DEVICE_MARK_ADDED = 'DEVICE_MARK_ADDED',
  HEAT_CHANGED = 'HEAT_CHANGED',
  SCORESHEET_CHANGED = 'SCORESHEET_CHANGED'
}

export const pubSubDeletionRoutine = getDeletionRoutineFunction({
  topics: RsEvents
})

export const deviceShareDeletionRoutine = pubsub.schedule('every 1 hours').onRun(async () => {
  try {
    const db = admin.firestore()
    const query = db.collection('device-stream-shares')
      .where('expiresAt', '<', admin.firestore.Timestamp.now())
      .orderBy('expiresAt')

    return new Promise<void>((resolve, reject) => {
      deleteQueryBatch(db, query, resolve).catch(reject)
    })
  } catch (err) {
    logger.error(err)
  }
})

export const rankedResultsDeletionRoutine = pubsub.schedule('every 1 hours').onRun(async () => {
  try {
    const db = admin.firestore()
    const query = db.collection('ranked-results')
      .where('versionType', '==', 'temporary')
      .orderBy('maxEntryLockedAt', 'asc')
      .limit(100)

    return new Promise<void>((resolve, reject) => {
      deleteQueryBatch(
        db,
        query,
        resolve,
        (dSnap) => dSnap.createTime != null && dSnap.createTime.toMillis() < new Date(Date.now() - (60 * 60 * 1000)).getTime()
      ).catch(reject)
    })
  } catch (err) {
    logger.error(err)
  }
})

async function deleteQueryBatch (db: admin.firestore.Firestore, query: admin.firestore.Query, resolve: () => void, predicate?: (dSnap: DocumentSnapshot) => boolean) {
  const snapshot = await query.get()
  const docs = predicate != null ? snapshot.docs.filter(dSnap => predicate(dSnap)) : snapshot.docs

  const batchSize = predicate != null ? docs.length : snapshot.size
  if (batchSize === 0) {
    // When there are no documents left, we are done
    logger.info(`Firestore: (${snapshot.readTime.toMillis()}) no docs to delete`)
    resolve()
    return
  }

  // Delete documents in a batch
  logger.info(`Firestore: (${snapshot.readTime.toMillis()}) deleting ${batchSize} docs`)
  const batch = db.batch()
  docs.forEach(doc => {
    batch.delete(doc.ref)
  })
  await batch.commit()
  logger.info(`Firestore: (${snapshot.readTime.toMillis()}) deleted ${batchSize} docs`)

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    void deleteQueryBatch(db, query, resolve)
  })
}
