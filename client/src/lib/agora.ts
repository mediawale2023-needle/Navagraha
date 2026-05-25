// Lazily loads the Agora Web SDK from the CDN (kept out of the JS bundle).
declare global {
  interface Window {
    AgoraRTC: any;
  }
}

let loadPromise: Promise<any> | null = null;

export function loadAgoraSDK(): Promise<any> {
  if (window.AgoraRTC) return Promise.resolve(window.AgoraRTC);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.0.js';
    script.onload = () => resolve(window.AgoraRTC);
    script.onerror = () => reject(new Error('Failed to load Agora SDK'));
    document.body.appendChild(script);
  });
  return loadPromise;
}
