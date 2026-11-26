import { useAuth } from "./AuthContext";

/** Shows whether this tab can change data, and offers to unlock or lock. */
function AccessBar() {
  const { writesEnabled, unlocked, requestUnlock, lock } = useAuth();

  if (writesEnabled === false) {
    return (
      <div className="access-bar access-bar--off" role="status">
        <span className="access-dot" aria-hidden="true" />
        <span>Read-only server: editing is turned off.</span>
      </div>
    );
  }

  if (unlocked) {
    return (
      <div className="access-bar access-bar--on" role="status">
        <span className="access-dot" aria-hidden="true" />
        <span>Editing unlocked</span>
        <button type="button" className="access-button" onClick={lock}>
          Lock
        </button>
      </div>
    );
  }

  return (
    <div className="access-bar" role="status">
      <span className="access-dot" aria-hidden="true" />
      <span>Viewing only</span>
      <button type="button" className="access-button" onClick={() => requestUnlock()}>
        Unlock editing
      </button>
    </div>
  );
}

/** What replaces a form that cannot be used yet. */
export function LockedNotice({ what }) {
  const { writesEnabled, requestUnlock } = useAuth();
  if (writesEnabled === false) {
    return <p className="locked-note">The server is read-only, so {what} is switched off.</p>;
  }
  return (
    <div className="locked-note">
      <p>{what.charAt(0).toUpperCase() + what.slice(1)} needs the access token.</p>
      <button type="button" className="access-button" onClick={() => requestUnlock()}>
        Unlock editing
      </button>
    </div>
  );
}

export default AccessBar;
