const STORAGE_KEY = 'dotta.userId';
const USER_KEY = 'dotta.currentUser';

export function getCurrentUser() {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user) {
  try {
    if (user && user.id) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
      window.localStorage.setItem(STORAGE_KEY, user.id);
    } else {
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

export function clearCurrentUser() {
  try {
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function getUserId() {
  try {
    const user = getCurrentUser();
    if (user?.id) return user.id;
    const id = window.localStorage.getItem(STORAGE_KEY);
    if (id && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) {
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

export default getUserId;
