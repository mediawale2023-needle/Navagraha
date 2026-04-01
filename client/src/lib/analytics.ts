import posthog from 'posthog-js';

// Initialize PostHog
export function initAnalytics(posthogKey: string) {
  if (typeof window !== 'undefined' && posthogKey) {
    posthog.init(posthogKey, {
      api_host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,
    });
  }
}

// Track custom events
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined' && posthog.__loaded) {
    posthog.capture(eventName, properties);
  }
}

// Identify user
export function identifyUser(userId: string, traits?: Record<string, any>) {
  if (typeof window !== 'undefined' && posthog.__loaded) {
    posthog.identify(userId, traits);
  }
}

// Reset user on logout
export function resetUser() {
  if (typeof window !== 'undefined' && posthog.__loaded) {
    posthog.reset();
  }
}
