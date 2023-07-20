import * as admin from 'firebase-admin'
import { pubsub } from 'firebase-functions'
// import getDeletionRoutineFunction from 'graphql-firebase-subscriptions/firebase-function'
admin.initializeApp()

export enum RsEvents {
  MARK_ADDED = 'MARK_ADDED',
  DEVICE_MARK_ADDED = 'DEVICE_MARK_ADDED',
  HEAT_CHANGED = 'HEAT_CHANGED',
  SCORESHEET_CHANGED = 'SCORESHEET_CHANGED'
}

export const pubSubDeletionRoutine = pubsub.schedule('every 10 minutes').onRun(async () => {
  try {
    const db = admin.database()
    const baseRef = db.ref('/graphql-firebase-subscriptions')
    const topics = Object.values(RsEvents)

    for (const topic of topics) {
      const ref = baseRef.child(topic.toString())
      const toDelete = await ref
        .orderByChild('timestamp')
        .endAt(Date.now() - (10 * 60 * 1000))
        .get()

      if (toDelete.exists()) {
        const data = toDelete.val()
        await ref.update(Object.fromEntries(Object.entries(data).map(k => [k, null])))
      }
    }
  } catch (err) {
    console.error(err)
  }
})

// export const pubSubDeletionRoutine = getDeletionRoutineFunction({
//   topics: RsEvents
// })

export const deviceShareDeletionRoutine = pubsub.schedule('every 1 hours').onRun(async () => {
  try {
    const db = admin.firestore()
    const query = db.collection('device-stream-shares')
      .where('expiresAt', '<', admin.firestore.Timestamp.now())
      .orderBy('expiresAt')
      .limit(100)

    return new Promise<void>((resolve, reject) => {
      deleteQueryBatch(db, query, resolve).catch(reject)
    })
  } catch (err) {
    console.error(err)
  }
})

async function deleteQueryBatch (db: admin.firestore.Firestore, query: admin.firestore.Query, resolve: () => void) {
  const snapshot = await query.get()

  const batchSize = snapshot.size
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve()
    return
  }

  // Delete documents in a batch
  const batch = db.batch()
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref)
  })
  await batch.commit()

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    void deleteQueryBatch(db, query, resolve)
  })
}
