import type { PreviewAuthStorage } from "./previewAuthStorage";

const REMEMBER_KEY = "saha.auth.remember";

export function setRememberMe(enabled: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, enabled ? "true" : "false");
  } catch {
    // Storage can be disabled by browser privacy settings; the session can still work in memory.
  }
}

export function getRememberMe() {
  return shouldRemember();
}

function shouldRemember() {
  try {
    const setting = localStorage.getItem(REMEMBER_KEY);
    if (setting !== null) return setting === "true";
    // Keep pre-existing remembered sessions working once after this update.
    return Object.keys(localStorage).some((key) => key.startsWith("sb-") && key.endsWith("-auth-token") && Boolean(localStorage.getItem(key)));
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
