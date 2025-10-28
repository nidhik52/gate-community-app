const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin using serviceAccountKey
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Trigger when a new visitor document is created
exports.onVisitorCreated = functions.firestore
  .document('visitors/{visitorId}')
  .onCreate(async (snap, context) => {
    const visitor = snap.data();
    const visitorId = context.params.visitorId;

    console.log(`🆕 New visitor created: ${visitor.name} (${visitorId})`);

    try {
      //  Notify the resident who created the visitor
      const creatorDoc = await admin.firestore().collection('users').doc(visitor.createdBy).get();
      if (creatorDoc.exists && creatorDoc.data().fcmToken) {
        await admin.messaging().send({
          notification: {
            title: '📝 Visitor Request Created',
            body: `Your request for ${visitor.name} has been created and is pending approval.`
          },
          data: { 
            type: 'visitor_created', 
            visitorId,
            visitorName: visitor.name 
          },
          token: creatorDoc.data().fcmToken
        });
        console.log(`✅ Notification sent to creator: ${creatorDoc.data().email}`);
      }

      // Notify all admins about the new pending visitor
      const adminsSnapshot = await admin.firestore().collection('users').where('role', '==', 'admin').get();
      for (const adminDoc of adminsSnapshot.docs) {
        if (adminDoc.data().fcmToken) {
          await admin.messaging().send({
            notification: {
              title: '🆕 New Visitor Request',
              body: `${visitor.name} (${visitor.householdId || 'N/A'}) is awaiting approval.`
            },
            data: { 
              type: 'new_pending_visitor', 
              visitorId 
            },
            token: adminDoc.data().fcmToken
          });
          console.log(`✅ Notification sent to admin: ${adminDoc.data().email}`);
        }
      }

      // Log audit event
      await admin.firestore().collection('events').add({
        type: 'visitor_created',
        actorUserId: visitor.createdBy,
        payload: {
          visitorId,
          visitorName: visitor.name,
          householdId: visitor.householdId || 'N/A'
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (error) {
      console.error('Error in onVisitorCreated function:', error);
    }
  });
