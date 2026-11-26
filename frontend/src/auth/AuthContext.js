import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { checkToken, fetchConfig } from "../services/api";
import { clearToken, getToken, setToken } from "../services/auth";

const AuthContext = createContext(null);

/**
 * Who may change data. Everybody can look; adding, importing, editing and deleting need the admin token.
 *  - writesEnabled: null while unknown, false when the server has no ADMIN_TOKEN (read-only), true otherwise
 *  - unlocked: this browser tab holds a token the server accepted
 */
export function AuthProvider({ children }) {
  const [writesEnabled, setWritesEnabled] = useState(null);
  const [unlocked, setUnlocked] = useState(() => Boolean(getToken()));
  const [dialog, setDialog] = useState(null); // { reason } while the unlock dialog is open

  useEffect(() => {
    let cancelled = false;
    fetchConfig()
      .then((config) => !cancelled && setWritesEnabled(Boolean(config.writesEnabled)))
      .catch(() => !cancelled && setWritesEnabled(null)); // unknown: the load error is shown elsewhere
    return () => {
      cancelled = true;
    };
  }, []);

  const lock = useCallback(() => {
    clearToken();
    setUnlocked(false);
  }, []);

  /** Checks the token with the server; stores it only when it is right. Throws an ApiError otherwise. */
  const unlock = useCallback(async (token) => {
    const trimmed = String(token || "").trim();
    if (!trimmed) throw new Error("Enter the access token.");
    await checkToken(trimmed);
    setToken(trimmed);
    setUnlocked(true);
    setDialog(null);
  }, []);

  const requestUnlock = useCallback((reason = "") => setDialog({ reason }), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  /**
   * Call this with any error from a change request. When the cause was the token it locks, asks again and returns true.
   */
  const handleAuthError = useCallback(
    (error) => {
      if (error?.code === "UNAUTHORIZED") {
        lock();
        setDialog({ reason: "The access token was not accepted. Enter it again." });
        return true;
      }
      if (error?.code === "WRITES_DISABLED") {
        lock();
        setWritesEnabled(false);
        return false; // the caller still shows the server's message
      }
      return false;
    },
    [lock],
  );

  const value = useMemo(
    () => ({ writesEnabled, unlocked, dialog, unlock, lock, requestUnlock, closeDialog, handleAuthError }),
    [writesEnabled, unlocked, dialog, unlock, lock, requestUnlock, closeDialog, handleAuthError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
