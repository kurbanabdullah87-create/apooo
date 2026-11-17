import type { PreviewAuthStorage } from "./previewAuthStorage";

const REMEMBER_KEY = "saha.auth.remember";

export function setRememberMe(enabled: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, enabled ? "true" : "false");
  } catch {
    // Storage can be disabled by browser privacy settings; the session can still work in memory.
  }
  // Move an already-issued Supabase session to the selected storage immediately.
  // Otherwise a token created before the checkbox was applied can stay session-only.
  if (typeof window === "undefined") return;
  try {
    const tokenSuffix = "-auth-token";
    if (enabled) {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (!key?.startsWith("sb-") || !key.endsWith(tokenSuffix)) continue;
        const value = sessionStorage.getItem(key);
        if (value) localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      }
    } else {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith("sb-") || !key.endsWith(tokenSuffix)) continue;
        const value = localStorage.getItem(key);
        if (value) sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Keep the auth attempt alive if a browser blocks one of its storage backends.
  }
}

export function getRememberMe() {
  return shouldRemember();
}

function shouldRemember() {
  try {
    const setting = localStorage.getItem(REMEMBER_KEY);
    if (setting !== null) return setting === "true";
    // This is an installable, account-based field app. Persist new sessions by
    // default so closing the browser or PWA does not silently sign the user out.
    // An explicit false value still opts out for users who share their device.
    return true;
  } catch {
    return false;
  }
}

/** Keep the PKCE verifier available through the OAuth/email redirect. Persist the session only when requested. */
export function rememberedAuthStorage(previewStorage?: PreviewAuthStorage): PreviewAuthStorage | undefined {
  if (typeof window === "undefined") return undefined;
  const persistent = previewStorage ?? localStorage;

  return {
    getItem: async (key) => {
      try {
        if (key.endsWith("-code-verifier")) return localStorage.getItem(key);
        if (shouldRemember()) return await persistent.getItem(key);
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      try {
        if (key.endsWith("-code-verifier")) {
          localStorage.setItem(key, value);
          return;
        }
        if (shouldRemember()) {
          sessionStorage.removeItem(key);
          await persistent.setItem(key, value);
        } else {
          await persistent.removeItem(key);
          sessionStorage.setItem(key, value);
        }
      } catch {
        // Supabase Auth will report a session error if the browser blocks both storage modes.
      }
    },
    removeItem: async (key) => {
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
        await persistent.removeItem(key);
      } catch {
        // Clearing a disabled storage backend must not block sign-out from other backends.
      }
    },
  };
}
