import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';


const firebaseConfig = {
  apiKey: "AIzaSyCxb1fGUuV93PAaJ6VZa25aSg9BnK9KQvM",
  authDomain: "community-gate-app.firebaseapp.com",
  projectId: "community-gate-app",
  storageBucket: "community-gate-app.firebasestorage.app",
  messagingSenderId: "18828883289",
  appId: "1:18828883289:web:031a2cbcb5ad59c8794848"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Firebase Cloud Messaging
let messaging = null;
try {
  messaging = getMessaging(app);
  console.log('✅ Firebase Messaging initialized');
} catch (error) {
  console.warn('⚠️ Firebase Messaging not available:', error.message);
}

export { messaging };

const VAPID_KEY = 'BG9Yhqh6DkCoAW_he35-vjqj8hmuvXdl_RiFFhVl2qR_4HFCL0CvzZcrFEiAIscdlgaiulRpuB7oZGY2mexn0yU';

export const requestNotificationPermission = async () => {
  if (!messaging) {
    console.warn('⚠️ Messaging not available');
    return null;
  }

  try {
    console.log('📢 Requesting notification permission...');
    
    if (!('Notification' in window)) {
      console.warn('⚠️ This browser does not support notifications');
      return null;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('✅ Notification permission granted');
      
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      
      if (token) {
        console.log('🔑 FCM Token obtained');
        return token;
      } else {
        console.warn('⚠️ No FCM token available');
        return null;
      }
    } else {
      console.warn('❌ Notification permission denied');
      return null;
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
};

export const onMessageListener = () => {
  if (!messaging) {
    return Promise.reject('Messaging not available');
  }

  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      console.log('📨 Foreground message received:', payload);
      resolve(payload);
    });
  });
};
