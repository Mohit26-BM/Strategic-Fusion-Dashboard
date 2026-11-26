import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

/** Asks for the admin token. Opened by "Unlock editing" or when the server rejects the saved token. */
function UnlockDialog() {
  const { dialog, unlock, closeDialog } = useAuth();
  const [token, setTokenText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (dialog) {
      setTokenText("");
      setError("");
      inputRef.current?.focus();
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, closeDialog]);

  if (!dialog) return null;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await unlock(token);
    } catch (err) {
      setError(
        err.code === "UNAUTHORIZED"
          ? "That token is not correct."
          : err.code === "WRITES_DISABLED"
            ? "Editing is turned off on this server."
            : err.message || "Could not check the token.",
      );
      setBusy(false);
      inputRef.current?.focus();
      return;
    }
    setBusy(false);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <form className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="unlock-title" onSubmit={submit}>
        <p className="dialog-kicker">Restricted</p>
        <h2 id="unlock-title" className="dialog-title">Unlock editing</h2>
        <p className="dialog-copy">
          {dialog.reason || "Anyone can view the map. Adding, importing, editing and deleting nodes needs the access token."}
        </p>
        <label className="dialog-field">
          <span>Access token</span>
          <input
            ref={inputRef}
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setTokenText(e.target.value)}
            aria-describedby={error ? "unlock-error" : undefined}
            aria-invalid={Boolean(error)}
            disabled={busy}
          />
        </label>
        {error && (
          <p id="unlock-error" className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="dialog-hint">The token is kept only in this browser tab and is forgotten when you close it.</p>
        <div className="dialog-actions">
          <button type="button" className="dialog-button" onClick={closeDialog} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="dialog-button dialog-button--primary" disabled={busy || !token.trim()}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default UnlockDialog;
