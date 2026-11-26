// The admin token lives in sessionStorage: it is forgotten when the tab is closed and never sent anywhere
// except to the API as an Authorization header.
const KEY = "sfd-admin-token";

export function getToken() {
  try {
    return window.sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    window.sessionStorage.setItem(KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function clearToken() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
