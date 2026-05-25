import { apiRequest } from './queryClient';
// Firebase is heavy, so it's imported lazily only when push is actually enabled.
type Messaging = import('firebase/messaging').Messaging;

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

const TOKEN_STORAGE_KEY = 'navagraha_push_token';

let messagingInstance: Messaging | null = null;

function isConfigured(config?: FirebaseConfig): config is FirebaseConfig {
  return Boolean(config && config.projectId && config.apiKey && config.vapidKey);
}

async function getMessagingInstance(config: FirebaseConfig): Promise<Messaging | null> {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getMessaging, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return null;
  if (messagingInstance) return messagingInstance;
  const app = getApps().length ? getApps()[0] : initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

function buildServiceWorkerUrl(config: FirebaseConfig): string {
  const params = new URLSearchParams({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

/**
 * Registers for web push: requests permission, retrieves the FCM token, and
 * persists it on the server. No-op when Firebase isn't configured, the browser
 * doesn't support push, or the user denies permission.
 */
export async function enablePushNotifications(config?: FirebaseConfig): Promise<boolean> {
  try {
    if (!isConfigured(config)) return false;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
      return false;
    }

    const messaging = await getMessagingInstance(config);
    if (!messaging) return false;

    if (Notification.permission === 'denied') return false;
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const { getToken, onMessage } = await import('firebase/messaging');
    const registration = await navigator.serviceWorker.register(buildServiceWorkerUrl(config));
    const token = await getToken(messaging, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;

    if (localStorage.getItem(TOKEN_STORAGE_KEY) !== token) {
      await apiRequest('POST', '/api/push/register', { token, platform: 'web' });
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }

    // Foreground messages: surface a native notification
    onMessage(messaging, (payload) => {
      const n = payload.notification;
      if (n && Notification.permission === 'granted') {
        new Notification(n.title || 'Navagraha', { body: n.body, icon: '/favicon.png' });
      }
    });

    return true;
  } catch (err) {
    console.warn('[push] enable failed:', err);
    return false;
  }
}

export function hasEnabledPush(): boolean {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && Notification.permission === 'granted'
    && Boolean(localStorage.getItem(TOKEN_STORAGE_KEY));
}
