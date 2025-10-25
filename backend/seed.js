const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function createUser(email, password, role, householdId = null) {
  const userRecord = await admin.auth().createUser({
    email, password, emailVerified: false
  });
  const claims = { role };
  if (householdId) claims.householdId = householdId;
  await admin.auth().setCustomUserClaims(userRecord.uid, claims);

  let data = { email, role, createdAt: admin.firestore.FieldValue.serverTimestamp() };
  if (role === 'resident' && householdId) data.householdId = householdId;

  await db.collection('users').doc(userRecord.uid).set(data);
  console.log(`Created user ${email} with role ${role}`);
  return userRecord.uid;
}

async function seed() {
  try {
    const residentId = await createUser('resident@example.com', 'test123', 'resident', 'A-101');
    await createUser('guard@example.com', 'test123', 'guard');
    await createUser('admin@example.com', 'test123', 'admin');

    await db.collection('visitors').add({
      name: 'Visitor Example',
      phone: '1234567890',
      purpose: 'Delivery',
      status: 'pending',
      householdId: 'A-101',
      createdBy: residentId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('Seed complete!');
  } catch (err) {
    console.error('Seed failed:', err);
  }
}

seed();
