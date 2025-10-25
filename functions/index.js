const functions = require('firebase-functions');
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount) 
});

const db = admin.firestore();
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

const app = express();
app.use(cors());
app.use(express.json());


const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};

const logEvent = async (type, userId, data) => {
  try {
    await db.collection('events').add({
      type,
      actorUserId: userId,
      payload: data,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`📝 Audit log: ${type}`, data);
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

// Send FCM notification using Firebase Admin SDK
const sendNotification = async (userId, title, body, data = {}) => {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log(`⚠️ User ${userId} not found`);
      return;
    }

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;

    if (!fcmToken) {
      console.log(`⚠️ No FCM token for user ${userData.email}`);
      return;
    }

    const message = {
      notification: {
        title: title,
        body: body
      },
      data: data,
      token: fcmToken
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notification sent to ${userData.email}:`, response);
    
    return response;
  } catch (error) {
    console.error('Error sending notification:', error);
    
    if (error.code === 'messaging/registration-token-not-registered' || 
        error.code === 'messaging/invalid-registration-token') {
      console.log(`🗑️ Removing invalid FCM token for user ${userId}`);
      await db.collection('users').doc(userId).update({
        fcmToken: admin.firestore.FieldValue.delete()
      });
    }
  }
};



app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
});



app.post('/api/approve', verifyToken, async (req, res) => {
  try {
    const { visitorId } = req.body;
    const userRole = req.user.role;

    if (!visitorId) {
      return res.status(400).json({ error: 'Visitor ID is required' });
    }

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can approve visitors' });
    }

    const visitorRef = db.collection('visitors').doc(visitorId);
    const visitorDoc = await visitorRef.get();

    if (!visitorDoc.exists) {
      return res.status(404).json({ error: 'Visitor not found' });
    }

    const visitor = visitorDoc.data();

    if (visitor.status !== 'pending') {
      return res.status(400).json({ 
        error: `Cannot approve visitor with status: ${visitor.status}` 
      });
    }

    await visitorRef.update({
      status: 'approved',
      approvedBy: req.user.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logEvent('approval', req.user.uid, { 
      visitorId, 
      visitorName: visitor.name,
      householdId: visitor.householdId || 'N/A'
    });

    // Send notification to resident
    await sendNotification(
      visitor.createdBy,
      '✅ Visitor Approved',
      `${visitor.name} has been approved and can now visit.`,
      { type: 'approval', visitorId, visitorName: visitor.name }
    );

    // Send notification to all guards
    const guardsSnapshot = await db.collection('users')
      .where('role', '==', 'guard')
      .get();
    
    for (const guardDoc of guardsSnapshot.docs) {
      await sendNotification(
        guardDoc.id,
        '🚪 New Approved Visitor',
        `${visitor.name} (${visitor.householdId}) is approved for check-in.`,
        { type: 'approved_for_checkin', visitorId }
      );
    }

    console.log(`✅ Approved visitor: ${visitor.name} (Household: ${visitor.householdId})`);

    res.json({ 
      success: true, 
      message: `${visitor.name} has been approved` 
    });
  } catch (error) {
    console.error('Approve error:', error);
    res.status(500).json({ error: 'Failed to approve visitor' });
  }
});

app.post('/api/deny', verifyToken, async (req, res) => {
  try {
    const { visitorId, reason } = req.body;
    const userRole = req.user.role;

    if (!visitorId) {
      return res.status(400).json({ error: 'Visitor ID is required' });
    }

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can deny visitors' });
    }

    const visitorRef = db.collection('visitors').doc(visitorId);
    const visitorDoc = await visitorRef.get();

    if (!visitorDoc.exists) {
      return res.status(404).json({ error: 'Visitor not found' });
    }

    const visitor = visitorDoc.data();

    if (visitor.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Can only deny pending visitors' 
      });
    }

    await visitorRef.update({
      status: 'denied',
      deniedBy: req.user.uid,
      deniedAt: admin.firestore.FieldValue.serverTimestamp(),
      denialReason: reason || 'No reason provided'
    });

    await logEvent('denial', req.user.uid, { 
      visitorId, 
      visitorName: visitor.name,
      householdId: visitor.householdId || 'N/A',
      reason 
    });

    // Send notification to resident
    await sendNotification(
      visitor.createdBy,
      '❌ Visitor Request Denied',
      `Your request for ${visitor.name} has been denied. Reason: ${reason}`,
      { type: 'denial', visitorId, reason }
    );

    console.log(`❌ Denied visitor: ${visitor.name} (Household: ${visitor.householdId})`);

    res.json({ 
      success: true, 
      message: `${visitor.name} has been denied` 
    });
  } catch (error) {
    console.error('Deny error:', error);
    res.status(500).json({ error: 'Failed to deny visitor' });
  }
});

app.post('/api/checkin', verifyToken, async (req, res) => {
  try {
    const { visitorId } = req.body;
    const userRole = req.user.role;

    if (!visitorId) {
      return res.status(400).json({ error: 'Visitor ID is required' });
    }

    if (userRole !== 'guard' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only guards can check-in visitors' });
    }

    const visitorRef = db.collection('visitors').doc(visitorId);
    const visitorDoc = await visitorRef.get();

    if (!visitorDoc.exists) {
      return res.status(404).json({ error: 'Visitor not found' });
    }

    const visitor = visitorDoc.data();

    if (visitor.status !== 'approved') {
      return res.status(400).json({ 
        error: 'Visitor must be approved first' 
      });
    }

    await visitorRef.update({
      status: 'checked_in',
      checkedInBy: req.user.uid,
      checkedInAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logEvent('checkin', req.user.uid, { 
      visitorId, 
      visitorName: visitor.name,
      householdId: visitor.householdId || 'N/A'
    });

    // Send notification to resident
    await sendNotification(
      visitor.createdBy,
      '🚪 Visitor Checked In',
      `${visitor.name} has arrived and checked in at the gate.`,
      { type: 'checkin', visitorId }
    );

    console.log(`🚪 Checked in visitor: ${visitor.name} (Household: ${visitor.householdId})`);

    res.json({ 
      success: true, 
      message: `${visitor.name} checked in successfully` 
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in visitor' });
  }
});

app.post('/api/checkout', verifyToken, async (req, res) => {
  try {
    const { visitorId } = req.body;
    const userRole = req.user.role;

    if (!visitorId) {
      return res.status(400).json({ error: 'Visitor ID is required' });
    }

    if (userRole !== 'guard' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only guards can check-out visitors' });
    }

    const visitorRef = db.collection('visitors').doc(visitorId);
    const visitorDoc = await visitorRef.get();

    if (!visitorDoc.exists) {
      return res.status(404).json({ error: 'Visitor not found' });
    }

    const visitor = visitorDoc.data();

    if (visitor.status !== 'checked_in') {
      return res.status(400).json({ 
        error: `Cannot check-out visitor with status: ${visitor.status}. Visitor must be checked in first.` 
      });
    }

    await visitorRef.update({
      status: 'checked_out',
      checkedOutBy: req.user.uid,
      checkedOutAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logEvent('checkout', req.user.uid, { 
      visitorId, 
      visitorName: visitor.name,
      householdId: visitor.householdId || 'N/A'
    });

    console.log(`✅ Checked out visitor: ${visitor.name} (Household: ${visitor.householdId})`);

    res.json({ 
      success: true, 
      message: `${visitor.name} checked out successfully` 
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ error: 'Failed to check out visitor' });
  }
});



app.post('/api/admin/create-user', verifyToken, async (req, res) => {
  try {
    const { email, password, role, householdNumber } = req.body;
    const adminRole = req.user.role;

    if (adminRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create users' });
    }

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }

    if (!['resident', 'guard', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (role === 'resident' && !householdNumber) {
      return res.status(400).json({ error: 'Household number is required for residents' });
    }

    const newUser = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: false
    });

    const customClaims = { role: role };
    if (role === 'resident' && householdNumber) {
      customClaims.householdId = householdNumber;
    }
    await admin.auth().setCustomUserClaims(newUser.uid, customClaims);

    const userData = {
      email: email,
      role: role,
      password: password,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid
    };

    if (role === 'resident' && householdNumber) {
      userData.householdId = householdNumber;
    }

    await db.collection('users').doc(newUser.uid).set(userData);

    if (role === 'resident' && householdNumber) {
      const householdRef = db.collection('households').doc(householdNumber);
      const householdDoc = await householdRef.get();

      if (householdDoc.exists) {
        await householdRef.update({
          members: admin.firestore.FieldValue.arrayUnion(newUser.uid),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await householdRef.set({
          householdId: householdNumber,
          members: [newUser.uid],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: req.user.uid
        });
      }
    }

    await logEvent('user_created', req.user.uid, {
      newUserId: newUser.uid,
      newUserEmail: email,
      newUserRole: role,
      householdId: householdNumber || null
    });

    console.log(`✅ New ${role} created: ${email}${householdNumber ? ` (Household: ${householdNumber})` : ''}`);

    res.json({
      success: true,
      message: `User created successfully`,
      userId: newUser.uid,
      email: email,
      role: role,
      householdId: householdNumber || null
    });

  } catch (error) {
    console.error('Create user error:', error);
    
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    res.status(500).json({ 
      error: 'Failed to create user',
      details: error.message 
    });
  }
});

app.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    const adminRole = req.user.role;

    if (adminRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can view users' });
    }

    const usersSnapshot = await db.collection('users').get();
    
    const users = usersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        userId: doc.id,
        email: data.email,
        role: data.role,
        householdId: data.householdId || null,
        password: data.password || 'Not stored',
        createdAt: data.createdAt?.toDate?.() || new Date()
      };
    });

    users.sort((a, b) => b.createdAt - a.createdAt);

    res.json({ 
      success: true, 
      users,
      count: users.length
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch users',
      details: error.message 
    });
  }
});


app.post('/api/chat', verifyToken, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    const userRole = req.user.role;

    const visitorsSnapshot = await db.collection('visitors')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const visitors = visitorsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const tools = [
      {
        type: 'function',
        function: {
          name: 'approve_visitor',
          description: 'Approve a pending visitor (admin only)',
          parameters: {
            type: 'object',
            properties: {
              visitorId: { type: 'string', description: 'The ID of the visitor to approve' }
            },
            required: ['visitorId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'deny_visitor',
          description: 'Deny a pending visitor (admin only)',
          parameters: {
            type: 'object',
            properties: {
              visitorId: { type: 'string', description: 'The ID of the visitor to deny' },
              reason: { type: 'string', description: 'Reason for denial' }
            },
            required: ['visitorId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'checkin_visitor',
          description: 'Check in an approved visitor (guard only)',
          parameters: {
            type: 'object',
            properties: {
              visitorId: { type: 'string', description: 'The ID of the visitor to check in' }
            },
            required: ['visitorId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'checkout_visitor',
          description: 'Check out a checked-in visitor (guard only)',
          parameters: {
            type: 'object',
            properties: {
              visitorId: { type: 'string', description: 'The ID of the visitor to check out' }
            },
            required: ['visitorId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_visitors',
          description: 'Get list of visitors by status',
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['pending', 'approved', 'denied', 'checked_in', 'checked_out', 'all'],
                description: 'Filter visitors by status'
              }
            },
            required: ['status']
          }
        }
      }
    ];

    const systemPrompt = `You are an AI assistant for a community gate management system.

Current user role: ${userRole}

Available visitors:
${JSON.stringify(visitors, null, 2)}

Help users manage visitors through natural conversation. Match visitor names flexibly.
Be helpful and conversational.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto'
    });

    const responseMessage = completion.choices[0].message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      let functionResult;

      switch (functionName) {
        case 'approve_visitor':
          const approveRes = await fetch(`http://localhost:${process.env.PORT}/api/approve`, {
            method: 'POST',
            headers: {
              'Authorization': req.headers.authorization,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ visitorId: functionArgs.visitorId })
          });
          functionResult = await approveRes.json();
          break;

        case 'deny_visitor':
          const denyRes = await fetch(`http://localhost:${process.env.PORT}/api/deny`, {
            method: 'POST',
            headers: {
              'Authorization': req.headers.authorization,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(functionArgs)
          });
          functionResult = await denyRes.json();
          break;

        case 'checkin_visitor':
          const checkinRes = await fetch(`http://localhost:${process.env.PORT}/api/checkin`, {
            method: 'POST',
            headers: {
              'Authorization': req.headers.authorization,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ visitorId: functionArgs.visitorId })
          });
          functionResult = await checkinRes.json();
          break;

        case 'checkout_visitor':
          const checkoutRes = await fetch(`http://localhost:${process.env.PORT}/api/checkout`, {
            method: 'POST',
            headers: {
              'Authorization': req.headers.authorization,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ visitorId: functionArgs.visitorId })
          });
          functionResult = await checkoutRes.json();
          break;

        case 'list_visitors':
          const status = functionArgs.status;
          let filtered = visitors;
          if (status !== 'all') {
            filtered = visitors.filter(v => v.status === status);
          }
          functionResult = { visitors: filtered, count: filtered.length };
          break;

        default:
          functionResult = { error: 'Unknown function' };
      }

      const secondCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          ...messages,
          responseMessage,
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(functionResult)
          }
        ]
      });

      const finalMessage = secondCompletion.choices[0].message.content;

      return res.json({
        message: finalMessage,
        functionCalled: functionName,
        functionArgs,
        functionResult,
        conversationHistory: [
          ...conversationHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: finalMessage }
        ]
      });
    }

    res.json({
      message: responseMessage.content,
      conversationHistory: [
        ...conversationHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: responseMessage.content }
      ]
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Chat failed', 
      details: error.message 
    });
  }
});

exports.api = functions.https.onRequest(app);

module.exports = app;
