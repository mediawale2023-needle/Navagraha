/**
 * Google OAuth 2.0 Authentication
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID     — from Google Cloud Console → Credentials
 *   GOOGLE_CLIENT_SECRET — from Google Cloud Console → Credentials
 *   SESSION_SECRET       — long random string for cookie signing
 *
 * OAuth Consent Screen → Authorised redirect URIs must include:
 *   https://<your-domain>/api/auth/google/callback
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import type { Express, RequestHandler } from 'express';
import { storage } from './storage';

// ─── Session setup ────────────────────────────────────────────

let sessionMiddleware: ReturnType<typeof session> | null = null;

export interface SessionIdentity {
  userId?: string;
  astrologerId?: string;
}

export function getSession() {
  if (sessionMiddleware) {
    return sessionMiddleware;
  }

  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week

  if (!process.env.DATABASE_URL) {
    console.warn('[auth] DATABASE_URL not set — using MemoryStore for sessions. Sessions will be lost on restart.');
    sessionMiddleware = session({
      secret: process.env.SESSION_SECRET || 'fallback-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: sessionTtl,
      },
    });
    return sessionMiddleware;
  }

  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: 'sessions',
    errorLog: (err) => console.error('[session-store] Error:', err),
  });

  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
  });
  return sessionMiddleware;
}

export function getSessionIdentity(req: any): SessionIdentity {
  const passportUser = req.session?.passport && typeof req.session.passport === 'object'
    ? (req.session.passport as { user?: unknown }).user
    : undefined;

  return {
    userId: req.session?.userId || (typeof passportUser === 'string' ? passportUser : undefined),
    astrologerId: req.session?.astrologerId,
  };
}

function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

// ─── Passport + routes setup ──────────────────────────────────

export async function setupAuth(app: Express) {
  app.set('trust proxy', 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('[auth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set – Google OAuth disabled');
    // Still register placeholder routes so the app doesn't 404
    app.get('/api/auth/google', (_req, res) => res.status(503).json({ message: 'OAuth not configured' }));
    app.get('/api/auth/google/callback', (_req, res) => res.redirect('/?error=oauth_not_configured'));
    app.get('/api/login', (_req, res) => res.status(503).json({ message: 'OAuth not configured' }));
    app.get('/api/logout', (req, res) => { req.logout(() => res.redirect('/')); });

    passport.serializeUser((user: any, done) => done(null, user.id));
    passport.deserializeUser(async (id: string, done) => {
      try { const user = await storage.getUser(id); done(null, user ?? false); }
      catch (err) { done(err); }
    });
    return;
  }

  // Google requires the redirect_uri we send to EXACTLY match an "Authorized
  // redirect URI" configured on the OAuth client. A relative callbackURL makes
  // the value depend on the request host/proto (unreliable behind a proxy), so
  // derive an absolute, deterministic URL from APP_URL (or an explicit override)
  // and log it so it can be registered verbatim in Google Cloud Console.
  const baseUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const callbackURL = process.env.GOOGLE_CALLBACK_URL
    || (baseUrl ? `${baseUrl}/api/auth/google/callback` : '/api/auth/google/callback');
  console.log(
    `[auth] Google OAuth callback URL: ${callbackURL}\n` +
    `[auth] This EXACT URL must be listed under "Authorized redirect URIs" in ` +
    `Google Cloud Console → Credentials → your OAuth 2.0 Client.`,
  );

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL,
        proxy: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const user = await storage.upsertUser({
            id: profile.id,          // Google's stable sub ID
            email,
            firstName: profile.name?.givenName,
            lastName: profile.name?.familyName,
            profileImageUrl: profile.photos?.[0]?.value,
          });
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  // ── Auth routes ────────────────────────────────────────────

  // Initiate Google login
  app.get('/api/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }),
  );

  // Google redirects here after the user approves
  app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?error=auth_failed' }),
    (_req, res) => res.redirect('/'),
  );

  // Backwards-compat: old /api/login links on the client still work
  app.get('/api/login', (_req, res) => res.redirect('/api/auth/google'));

  // Logout
  app.get('/api/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
  });
}

// ─── Auth guard middleware ────────────────────────────────────

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  // Google OAuth session (Passport)
  if (req.isAuthenticated()) return next();

  // Email/password session
  const sessionUserId = req.session?.userId;
  if (sessionUserId) {
    try {
      const user = await storage.getUser(sessionUserId);
      if (user) {
        req.user = user;
        return next();
      }
    } catch {
      // fall through to 401
    }
  }

  res.status(401).json({ message: 'Unauthorized' });
};

export const isAdmin: RequestHandler = async (req: any, res, next) => {
  const adminEmails = getAdminEmails();

  if (!req.isAuthenticated?.() && !req.session?.userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = req.user || (req.session?.userId ? await storage.getUser(req.session.userId) : undefined);
  const email = user?.email?.toLowerCase?.();

  if (!email || !adminEmails.has(email)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  req.user = user;
  next();
};
