// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');


firebase.initializeApp({
  apiKey: "AIzaSyCxb1fGUuV93PAaJ6VZa25aSg9BnK9KQvM",
  authDomain: "community-gate-app.firebaseapp.com",
  projectId: "community-gate-app",
  storageBucket: "community-gate-app.firebasestorage.app",
  messagingSenderId: "18828883289",
  appId: "1:18828883289:web:031a2cbcb5ad59c8794848"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('📨 Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || 'Community Gate';
  const notificationOptions = {
    body: payload.notification?.body || 'New notification',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'community-gate-notification',
    requireInteraction: false,
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});
