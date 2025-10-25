import { useState, useEffect } from 'react';
import { auth, db, requestNotificationPermission, onMessageListener } from './firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, orderBy, limit, doc, setDoc } from 'firebase/firestore';
import axios from 'axios';
import './App.css';

const API_BASE_URL = 'http://localhost:8080/api';

// Notification Prompt Component
function NotificationPrompt({ onEnable, isEnabled }) {
  if (isEnabled) return null;

  return (
    <div className="notification-prompt">
      <div className="notification-prompt-content">
        <span className="notification-icon">🔔</span>
        <div>
          <strong>Enable Notifications</strong>
          <p>Get real-time updates about your visitors</p>
        </div>
        <button onClick={onEnable} className="btn btn-primary btn-sm">
          Enable
        </button>
      </div>
    </div>
  );
}

// User Management Component (Admin)
function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState({});

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = await currentUser.getIdToken();
        const response = await axios.get(
          `${API_BASE_URL}/admin/users`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUsers(response.data.users || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [currentUser]);

  const togglePasswordVisibility = (userId) => {
    setShowPasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('✅ Copied to clipboard!');
  };

  const removeUser = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to delete the user: ${email}? This action cannot be undone.`)) {
      return;
    }

    try {
      const token = await currentUser.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/admin/remove-user`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert(response.data.message || 'User deleted successfully');
      // Refresh users list
      setLoading(true);
      const refreshed = await axios.get(
        `${API_BASE_URL}/admin/users`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers(refreshed.data.users || []);
      setLoading(false);
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('Error deleting user: ' + errorMsg);
    }
  };

  if (loading) {
    return <div className="loading-text">Loading users...</div>;
  }

  return (
    <div className="user-management">
      <h3>👥 User Management ({users.length} users)</h3>
      <div className="users-list">
        {users.length === 0 ? (
          <p className="empty-state">No users found</p>
        ) : (
          users.map(user => (
            <div key={user.userId} className="user-item">
              <div className="user-info">
                <div className="user-email">
                  <strong>{user.email}</strong>
                  <span className={`role-badge role-${user.role}`}>{user.role}</span>
                  {user.householdId && (
                    <span className="household-badge-small">🏘️ {user.householdId}</span>
                  )}
                </div>
                <div className="user-password">
                  <span className="password-label">Password:</span>
                  <span className="password-value">
                    {showPasswords[user.userId] ? user.password : '••••••••'}
                  </span>
                  <button
                    onClick={() => togglePasswordVisibility(user.userId)}
                    className="btn btn-xs btn-secondary"
                  >
                    {showPasswords[user.userId] ? '🙈 Hide' : '👁️ Show'}
                  </button>
                  <button
                    onClick={() => copyToClipboard(user.password)}
                    className="btn btn-xs btn-secondary"
                  >
                    📋 Copy
                  </button>
                  <button
                    onClick={() => removeUser(user.userId, user.email)}
                    className="btn btn-xs btn-danger"
                    title="Delete User"
                  >
                    🗑️ Delete
                  </button>
                </div>
                <div className="user-meta">
                  Created: {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Admin User Creation Component
function AdminUserManagement({ currentUser, onUserCreated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('resident');
  const [householdNumber, setHouseholdNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const createNewUser = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      alert('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    if (role === 'resident' && !householdNumber) {
      alert('Please enter household number for residents');
      return;
    }

    setLoading(true);

    try {
      const token = await currentUser.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/admin/create-user`,
        { 
          email, 
          password, 
          role,
          householdNumber: role === 'resident' ? householdNumber : null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert(
        `✅ User created successfully!\n\nEmail: ${email}\nRole: ${role}` 
        + (role === 'resident' ? `\nHousehold: ${householdNumber}` : '') 
        + `\n\n✅ You can view the password in User Management section`
      );
      
      setEmail('');
      setPassword('');
      setRole('resident');
      setHouseholdNumber('');
      
      if (onUserCreated) onUserCreated();
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('❌ Error creating user: ' + errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-panel">
      <h3>➕ Create New User</h3>
      <form onSubmit={createNewUser} className="user-form">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="input"
          disabled={loading}
          required
        />
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6 chars)"
          className="input"
          disabled={loading}
          required
        />
        
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="input"
          disabled={loading}
        >
          <option value="resident">👤 Resident</option>
          <option value="guard">👮 Guard</option>
          <option value="admin">👨‍💼 Admin</option>
        </select>

        {role === 'resident' && (
          <input
            type="text"
            value={householdNumber}
            onChange={(e) => setHouseholdNumber(e.target.value)}
            placeholder="Household Number (e.g., A-101, B-205)"
            className="input"
            disabled={loading}
            required
          />
        )}
        
        <button 
          type="submit" 
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Creating...' : '➕ Create User'}
        </button>
      </form>
    </div>
  );
}

// Visitor Creation Form Component
function VisitorCreationForm({ currentUser, householdId, onClose, onSuccess }) {
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitPurpose, setVisitPurpose] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!visitorName.trim()) {
      alert('Please enter visitor name');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'visitors'), {
        name: visitorName.trim(),
        phone: visitorPhone.trim() || 'N/A',
        purpose: visitPurpose.trim() || 'General visit',
        status: 'pending',
        householdId: householdId,
        createdBy: currentUser.uid,
        createdAt: new Date()
      });
      alert('✅ Visitor request created successfully!');
      onSuccess();
      onClose();
    } catch (error) {
      alert('❌ Error creating visitor: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>➕ Request Visitor Pass</h3>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="visitor-form">
          <div className="form-group">
            <label className="form-label">Visitor Name *</label>
            <input
              type="text"
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              placeholder="Enter visitor's full name"
              className="input"
              disabled={loading}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              type="tel"
              value={visitorPhone}
              onChange={(e) => setVisitorPhone(e.target.value)}
              placeholder="Enter phone number (optional)"
              className="input"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Purpose of Visit</label>
            <textarea
              value={visitPurpose}
              onChange={(e) => setVisitPurpose(e.target.value)}
              placeholder="e.g., Delivery, Meeting, Social visit"
              className="input textarea"
              rows="3"
              disabled={loading}
            />
          </div>
          <div className="modal-actions">
            <button 
              type="button"
              onClick={onClose} 
              className="btn btn-outline"
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Audit Logs Viewer Component
function AuditLogsViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const logsQuery = query(
      collection(db, 'events'),
      orderBy('timestamp', 'desc'),
      limit(15)
    );

    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const logsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(logsList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getEventIcon = (type) => {
    const icons = {
      'approval': '✅',
      'denial': '❌',
      'checkin': '🚪',
      'checkout': '🚶',
      'user_created': '👤'
    };
    return icons[type] || '📝';
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="audit-logs">
      <h3>📊 Recent Activity</h3>
      {loading ? (
        <p className="loading-text">Loading logs...</p>
      ) : logs.length === 0 ? (
        <p className="empty-state">No activity yet</p>
      ) : (
        <div className="logs-list">
          {logs.map(log => (
            <div key={log.id} className="log-item">
              <span className="log-icon">{getEventIcon(log.type)}</span>
              <div className="log-details">
                <div className="log-type">{log.type}</div>
                <div className="log-payload">
                  {log.payload?.visitorName && `Visitor: ${log.payload.visitorName}`}
                  {log.payload?.householdId && ` (🏘️ ${log.payload.householdId})`}
                  {log.payload?.newUserEmail && `User: ${log.payload.newUserEmail} (${log.payload.newUserRole})`}
                  {log.payload?.newUserRole === 'resident' && log.payload?.householdId && ` - 🏘️ ${log.payload.householdId}`}
                  {log.payload?.reason && ` - Reason: ${log.payload.reason}`}
                </div>
                <div className="log-timestamp">{formatTimestamp(log.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Notification Toast Component
function NotificationToast({ notification, onClose }) {
  if (!notification) return null;

  return (
    <div className="notification-toast">
      <div className="notification-content">
        <strong>{notification.title}</strong>
        <p>{notification.body}</p>
      </div>
      <button onClick={onClose} className="notification-close">✕</button>
    </div>
  );
}

// Main App()
function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [allVisitors, setAllVisitors] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [householdId, setHouseholdId] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showVisitorForm, setShowVisitorForm] = useState(false);
  const [refreshUsers, setRefreshUsers] = useState(0);
  const [notification, setNotification] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUser(user);
        setLoginError('');
        
        const tokenResult = await user.getIdTokenResult();
        const role = tokenResult.claims.role || 'resident';
        const household = tokenResult.claims.householdId || null;
        
        setUserRole(role);
        setHouseholdId(household);

        const savedMessages = localStorage.getItem(`chat_${user.uid}`);
        if (savedMessages) {
          try {
            setMessages(JSON.parse(savedMessages));
          } catch (e) {
            console.error('Error loading chat history:', e);
          }
        } else {
          setMessages([]);
        }
        
        let visitorsQuery;
        
        if (role === 'resident') {
          if (household) {
            visitorsQuery = query(
              collection(db, 'visitors'),
              where('householdId', '==', household)
            );
          } else {
            setAllVisitors([]);
            return;
          }
        } else {
          visitorsQuery = query(collection(db, 'visitors'));
        }

        const unsubscribeVisitors = onSnapshot(visitorsQuery, (snapshot) => {
          const visitorsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setAllVisitors(visitorsList);
        });

        return () => unsubscribeVisitors();
      } else {
        setCurrentUser(null);
        setAllVisitors([]);
        setMessages([]);
        setConversation([]);
        setHouseholdId(null);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const setupNotifications = async () => {
      if (currentUser && Notification.permission === 'granted') {
        const fcmToken = await requestNotificationPermission();
        if (fcmToken) {
          setNotificationsEnabled(true);
          try {
            await setDoc(doc(db, 'users', currentUser.uid), {
              fcmToken: fcmToken,
              fcmTokenUpdatedAt: new Date()
            }, { merge: true });
          } catch (error) {
            console.error('Error saving FCM token:', error);
          }
        }
      }
    };

    if (currentUser) {
      setupNotifications();
    }
  }, [currentUser]);

  // Add notification listener
  useEffect(() => {
    if (currentUser && notificationsEnabled) {
      onMessageListener()
        .then((payload) => {
          setNotification({
            title: payload.notification.title,
            body: payload.notification.body
          });

          if (Notification.permission === 'granted') {
            new Notification(payload.notification.title, {
              body: payload.notification.body,
              icon: '/favicon.ico'
            });
          }

          setTimeout(() => setNotification(null), 5000);
        })
        .catch((err) => console.error('Notification error:', err));
    }
  }, [currentUser, notificationsEnabled]);

  useEffect(() => {
    if (currentUser && messages.length > 0) {
      localStorage.setItem(`chat_${currentUser.uid}`, JSON.stringify(messages));
    }
  }, [messages, currentUser]);

  const handleEnableNotifications = async () => {
    const fcmToken = await requestNotificationPermission();
    if (fcmToken) {
      setNotificationsEnabled(true);
      try {
        await setDoc(doc(db, 'users', currentUser.uid), {
          fcmToken: fcmToken,
          fcmTokenUpdatedAt: new Date()
        }, { merge: true });
        alert('✅ Notifications enabled successfully!');
      } catch (error) {
        alert('❌ Failed to enable notifications. Check console for details.');
      }
    } else {
      alert('⚠️ Please enable notifications in browser settings and retry.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!loginEmail || !loginPassword) {
      setLoginError('⚠️ Please enter both email and password');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (error) {
      const errorMap = {
        'auth/invalid-credential': '❌ Incorrect email or password. Please try again.',
        'auth/wrong-password': '❌ Incorrect email or password. Please try again.',
        'auth/user-not-found': '❌ No account found with this email. Please contact admin.',
        'auth/invalid-email': '❌ Invalid email format. Please check and try again.',
        'auth/too-many-requests': '❌ Too many failed attempts. Please try again later.'
      };
      setLoginError(errorMap[error.code] || '❌ Login failed. Please contact admin.');
    }
  };

  const handleLogout = () => {
    setMessages([]);
    setConversation([]);
    setLoginError('');
    setNotificationsEnabled(false);
    signOut(auth);
  };

  const approveVisitor = async (visitorId) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/approve`,
        { visitorId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(response.data.message || 'Visitor approved!');
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('Error approving visitor: ' + errorMsg);
    }
  };

  const denyVisitor = async (visitorId) => {
    const reason = prompt('Please provide a reason for denial:');
    if (!reason) return;
    try {
      const token = await currentUser.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/deny`,
        { visitorId, reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(response.data.message || 'Visitor denied');
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('Error denying visitor: ' + errorMsg);
    }
  };

  const checkInVisitor = async (visitorId) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/checkin`,
        { visitorId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(response.data.message || 'Visitor checked in successfully!');
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('Error checking in: ' + errorMsg);
    }
  };

  const checkOutVisitor = async (visitorId) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/checkout`,
        { visitorId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(response.data.message || 'Visitor checked out successfully!');
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('Error checking out: ' + errorMsg);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    setLoading(true);
    const userMessage = chatInput;
    setChatInput('');
    const newUserMessage = { role: 'user', content: userMessage };
    setMessages((prev) => [...prev, newUserMessage]);

    try {
      const token = await currentUser.getIdToken();
      const response = await axios.post(
        `${API_BASE_URL}/chat`,
        {
          message: userMessage,
          conversationHistory: conversation,
          userId: currentUser.uid,
          userRole: userRole,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const aiMessage = {
        role: 'assistant',
        content: response.data.message,
        functionCalled: response.data.functionCalled,
      };
      setMessages((prev) => [...prev, aiMessage]);
      if (response.data.conversationHistory) {
        setConversation(response.data.conversationHistory);
      }
    } catch (error) {
      const errorMessage = {
        role: 'error',
        content: 'Sorry, something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const clearChatHistory = () => {
    if (window.confirm('Are you sure you want to clear your chat history?')) {
      setMessages([]);
      setConversation([]);
      if (currentUser) {
        localStorage.removeItem(`chat_${currentUser.uid}`);
      }
      alert('Chat history cleared!');
    }
  };

  if (!currentUser) {
    return (
      <div className="container">
        <div className="login-card">
          <h1>🏠 Community Gate</h1>
          <p className="subtitle">Smart Visitor Management System</p>
          <form onSubmit={handleLogin}>
            <input
              value={loginEmail}
              onChange={(e) => {
                setLoginEmail(e.target.value);
                setLoginError('');
              }}
              placeholder="Email address"
              className="input"
              type="email"
            />
            <input
              value={loginPassword}
              onChange={(e) => {
                setLoginPassword(e.target.value);
                setLoginError('');
              }}
              type="password"
              placeholder="Password"
              className="input"
            />
            {loginError && <div className="error-message">{loginError}</div>}
            <button type="submit" className="btn btn-primary">
              Sign In
            </button>
          </form>
          <div className="login-help">
            <p>🔐 Forgot password? Contact your administrator</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {notification && (
        <NotificationToast
          notification={notification}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="header">
        <div className="header-left">
          <h1>🏠 Community Gate</h1>
          <span className={`role-badge role-${userRole}`}>{userRole}</span>
          {householdId && <span className="household-badge">🏘️ {householdId}</span>}
        </div>
        <button onClick={handleLogout} className="btn btn-outline">
          Sign Out
        </button>
      </div>
      <NotificationPrompt
        onEnable={handleEnableNotifications}
        isEnabled={notificationsEnabled}
      />
      {userRole === 'admin' && (
        <div className="admin-section">
          <AdminUserManagement
            currentUser={currentUser}
            onUserCreated={() => setRefreshUsers((prev) => prev + 1)}
          />
          <UserManagement currentUser={currentUser} key={refreshUsers} />
        </div>
      )}
      {userRole === 'resident' && (
        <button
          onClick={() => setShowVisitorForm(true)}
          className="btn btn-primary add-btn"
        >
          ➕ Request Visitor Pass
        </button>
      )}
      {showVisitorForm && (
        <VisitorCreationForm
          currentUser={currentUser}
          householdId={householdId}
          onClose={() => setShowVisitorForm(false)}
          onSuccess={() => {}}
        />
      )}
      <div className="grid">
        <div className="visitors-section">
          <h2>
            Visitors ({allVisitors.length})
            {userRole === 'resident' && householdId && (
              <span className="section-subtitle"> - Your household only</span>
            )}
          </h2>
          <div className="visitors-list">
            {allVisitors.length === 0 ? (
              <p className="empty-state">No visitors found</p>
            ) : (
              allVisitors.map((visitor) => (
                <div key={visitor.id} className="visitor-card">
                  <div className="visitor-header">
                    <h3>{visitor.name}</h3>
                    <span className={`status-badge status-${visitor.status}`}>
                      {visitor.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="visitor-detail">📋 {visitor.purpose}</p>
                  <p className="visitor-detail">📞 {visitor.phone}</p>
                  {visitor.householdId && (
                    <p className="visitor-detail">🏘️ Household: {visitor.householdId}</p>
                  )}
                  <div className="visitor-actions">
                    {userRole === 'resident' && visitor.status === 'pending' && (
                      <>
                        <button
                          onClick={() => approveVisitor(visitor.id)}
                          className="btn btn-sm btn-success"
                        >
                          ✅ Approve
                        </button>
                        <button
                          onClick={() => denyVisitor(visitor.id)}
                          className="btn btn-sm btn-danger"
                        >
                          ❌ Deny
                        </button>
                      </>
                    )}
                    {userRole === 'admin' && visitor.status === 'pending' && (
                      <div className="admin-monitor-badge">
                        👀 Awaiting Resident Approval
                      </div>
                    )}
                    {userRole === 'guard' && visitor.status === 'approved' && (
                      <button
                        onClick={() => checkInVisitor(visitor.id)}
                        className="btn btn-sm btn-info"
                      >
                        🚪 Check In
                      </button>
                    )}
                    {userRole === 'guard' && visitor.status === 'checked_in' && (
                      <button
                        onClick={() => checkOutVisitor(visitor.id)}
                        className="btn btn-sm btn-warning"
                      >
                        🚶 Check Out
                      </button>
                    )}
                    {userRole === 'resident' && visitor.status === 'pending' && (
                      <div className="status-message">⏳ Awaiting approval</div>
                    )}
                    {visitor.status === 'checked_in' && (
                      <div className="status-indicator active">✨ Currently inside</div>
                    )}
                    {visitor.status === 'checked_out' && (
                      <div className="status-indicator completed">✔️ Visit completed</div>
                    )}
                    {visitor.status === 'denied' && (
                      <div className="status-indicator denied">❌ Access denied</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="right-column">
          <div className="chat-section">
            <div className="chat-header">
              <h2>🤖 AI Assistant</h2>
              {messages.length > 0 && (
                <button
                  onClick={clearChatHistory}
                  className="btn btn-sm btn-secondary"
                  title="Clear chat history"
                >
                  🗑️ Clear
                </button>
              )}
            </div>
            <div className="chat-container">
              <div className="chat-messages">
                {messages.length === 0 ? (
                  <div className="chat-welcome">
                    <p>👋 Hello! How can I help you today?</p>
                    <p className="chat-hint">You can ask me to:</p>
                    <ul>
                      {userRole === 'resident' && (
                        <>
                          <li>Approve or deny my visitors</li>
                          <li>Show my visitor requests</li>
                          <li>Check visitor status</li>
                        </>
                      )}
                      {userRole === 'guard' && (
                        <>
                          <li>Check in visitors</li>
                          <li>Check out visitors</li>
                          <li>Show current visitors</li>
                        </>
                      )}
                      {userRole === 'admin' && (
                        <>
                          <li>Monitor all households</li>
                          <li>View audit logs</li>
                          <li>Manage users</li>
                        </>
                      )}
                    </ul>
                    <p className="privacy-note">🔒 Your chat is private and stored locally</p>
                  </div>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className={`chat-message chat-${msg.role}`}>
                      <div className="message-content">{msg.content}</div>
                      {msg.functionCalled && (
                        <div className="function-indicator">
                          ⚡ Action: {msg.functionCalled}
                        </div>
                      )}
                    </div>
                  ))
                )}
                {loading && (
                  <div className="chat-message chat-assistant">
                    <div className="message-content typing">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}
              </div>
              <div className="chat-input-area">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your message..."
                  className="chat-input"
                  onKeyPress={(e) => e.key === 'Enter' && !loading && sendChatMessage()}
                  disabled={loading}
                />
                <button
                  onClick={sendChatMessage}
                  className="btn btn-primary btn-send"
                  disabled={loading || !chatInput.trim()}
                >
                  {loading ? '...' : '→'}
                </button>
              </div>
            </div>
          </div>
          {(userRole === 'admin' || userRole === 'guard') && (
            <div className="audit-section">
              <AuditLogsViewer />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
