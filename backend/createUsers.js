//create test users in Firebase Auth and Firestore

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount) 
});

const db = admin.firestore();

async function createTestUsers() {
  const users = [
    { 
      email: 'admin@test.com', 
      password: 'test123', 
      role: 'admin' 
    },
    { 
      email: 'guard@test.com', 
      password: 'test123', 
      role: 'guard' 
    },
    { 
      email: 'resident1@test.com', 
      password: 'test123', 
      role: 'resident',
      householdId: 'A-101'
    },
    { 
      email: 'resident2@test.com', 
      password: 'test123', 
      role: 'resident',
      householdId: 'A-102'
    }
  ];

  for (const u of users) {
    try {
      const user = await admin.auth().createUser({
        email: u.email,
        password: u.password
      });

      const claims = { role: u.role };
      if (u.householdId) {
        claims.householdId = u.householdId;
      }
      await admin.auth().setCustomUserClaims(user.uid, claims);

      const userData = {
        email: u.email,
        role: u.role,
        password: u.password,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      if (u.householdId) {
        userData.householdId = u.householdId;
      }
      await db.collection('users').doc(user.uid).set(userData);

      if (u.role === 'resident' && u.householdId) {
        await db.collection('households').doc(u.householdId).set({
          householdId: u.householdId,
          members: [user.uid],
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      console.log(`✅ Created ${u.email} (${u.role}${u.householdId ? ` - ${u.householdId}` : ''})`);
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        console.log(`⚠️  ${u.email} already exists`);
      } else {
        console.error(`❌ Error creating ${u.email}:`, error.message);
      }
    }
  }

  console.log('\n✅ Setup complete!');
  console.log('\n📧 Login credentials:');
  console.log('Admin:     admin@test.com / test123');
  console.log('Guard:     guard@test.com / test123');
  console.log('Resident1: resident1@test.com / test123 (A-101)');
  console.log('Resident2: resident2@test.com / test123 (A-102)');

  process.exit(0);
}

createTestUsers();
