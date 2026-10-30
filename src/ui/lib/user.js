// Stable per-browser user ID until real auth lands. The server confines all
// workspace file access to this user's own sandboxed folder (user-<id>).
const STORAGE_KEY = 'omni.userId';

export function getUserId() {
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (id && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) {
      return id;
    }
    id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return 'anonymous';
  }
}

export default getUserId;
