import { useCallback, useMemo, useSyncExternalStore } from "react";

const defaults = Object.freeze({ enabled: true, volume: 45, sound: "chime" });
const preferenceEvent = "driver-notification-preferences-changed";
const storageKey = (driverId) => `driver-notification-preferences:${driverId}`;

export function readDriverPreferences(driverId) {
  if (!driverId) return { ...defaults };
  try {
    const raw = window.localStorage.getItem(storageKey(driverId));
    const saved = JSON.parse(raw || "null");
    return {
      enabled: typeof saved?.enabled === "boolean" ? saved.enabled : defaults.enabled,
      volume: Number.isFinite(Number(saved?.volume)) ? Math.min(100, Math.max(0, Number(saved.volume))) : defaults.volume,
      sound: ["chime", "double-beep", "clear-alert", "loud-alert"].includes(saved?.sound) ? saved.sound : defaults.sound,
    };
  } catch {
    return { ...defaults };
  }
}

export function saveDriverPreferences(driverId, preferences) {
  if (!driverId) return;
  const next = {
    enabled: Boolean(preferences.enabled),
    volume: Math.min(100, Math.max(0, Number(preferences.volume) || 0)),
    sound: ["chime", "double-beep", "clear-alert", "loud-alert"].includes(preferences.sound) ? preferences.sound : defaults.sound,
  };
  try { window.localStorage.setItem(storageKey(driverId), JSON.stringify(next)); } catch { /* preferences are best effort */ }
  window.dispatchEvent(new CustomEvent(preferenceEvent, { detail: { driverId: String(driverId), preferences: next } }));
}

export function useDriverPreferences(driverId) {
  const subscribe = useCallback((notify) => {
    const onChange = (event) => {
      if (String(event.detail?.driverId) === String(driverId)) notify();
    };
    const onStorage = (event) => {
      if (event.key === storageKey(driverId)) notify();
    };
    window.addEventListener(preferenceEvent, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(preferenceEvent, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [driverId]);
  const getSnapshot = useCallback(() => JSON.stringify(readDriverPreferences(driverId)), [driverId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const preferences = useMemo(() => JSON.parse(snapshot), [snapshot]);

  const updatePreferences = useCallback((patch) => {
    saveDriverPreferences(driverId, { ...readDriverPreferences(driverId), ...patch });
  }, [driverId]);

  return [preferences, updatePreferences];
}

export const defaultDriverPreferences = defaults;
