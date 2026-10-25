export function getDriverPushState({ supported, configured, permission, registered }) {
  if (!supported) return "unsupported";
  if (!configured) return "unavailable";
  if (permission === "denied") return "denied";
  if (registered) return "enabled";
  if (permission === "granted") return "granted";
  return "not_enabled";
}

export function decodeVapidPublicKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

const pushStorageKey = (driverId) => `driver-background-push:${driverId}`;

export function setDriverPushRegistered(driverId, registered) {
  if (!driverId || typeof window === "undefined") return;
  try {
    if (registered) window.localStorage.setItem(pushStorageKey(driverId), "true");
    else window.localStorage.removeItem(pushStorageKey(driverId));
  } catch { /* Push registration remains stored on the server if local storage is unavailable. */ }
}

export function isDriverPushRegistered(driverId) {
  if (!driverId || typeof window === "undefined") return false;
  try { return window.localStorage.getItem(pushStorageKey(driverId)) === "true"; }
  catch { return false; }
}
