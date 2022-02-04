import * as admin from 'firebase-admin'
import getDeletionRoutineFunction from 'graphql-firebase-subscriptions/firebase-function'
admin.initializeApp()

export enum RsEvents {
  MARK_ADDED = 'MARK_ADDED'
}

export const pubSubDeletionRoutine = getDeletionRoutineFunction({
  topics: RsEvents
})
