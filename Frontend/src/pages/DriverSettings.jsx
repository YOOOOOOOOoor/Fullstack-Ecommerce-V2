import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import ThemeToggle from "../components/ThemeToggle.jsx";
import DriverHeader from "../components/driver/DriverHeader.jsx";
import API from "../../API/api.js";
import { playAssignmentSound } from "./driverPortalUtils.js";
import { useDriverPreferences } from "./driverPreferences.js";
import { decodeVapidPublicKey, getDriverPushState, setDriverPushRegistered } from "./driverPushNotifications.js";

const card = "space-y-5 rounded-3xl border bg-card p-5 shadow-sm sm:p-7";

const DriverSettings = ({ user, setUser }) => {
  const [profile, setProfile] = useState({ name: "", email: "", phone: "", avatar: "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingSound, setTestingSound] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [pushConfig, setPushConfig] = useState({ loaded: false, supported: false, publicKey: null });
  const [pushPermission, setPushPermission] = useState(() => typeof Notification === "undefined" ? "default" : Notification.permission);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [preferences, updatePreferences] = useDriverPreferences(user?.id);
  const navigate = useNavigate();
  const browserSupportsPush = typeof window !== "undefined" && window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const pushState = getDriverPushState({ supported: browserSupportsPush, configured: pushConfig.supported, permission: pushPermission, registered: pushRegistered });

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await API.get("/settings");
      setProfile(data);
      setProfileError("");
    } catch (error) {
      if (error.response?.status === 401) {
        setUser(null);
        navigate("/driver/login", { replace: true });
      } else {
        setProfileError("Could not load your profile. Check your connection and try again.");
      }
    } finally { setLoading(false); }
  }, [navigate, setUser]);

  useEffect(() => {
    let active = true;
    API.get("/settings").then(({ data }) => {
      if (active) { setProfile(data); setProfileError(""); }
    }).catch((error) => {
      if (!active) return;
      if (error.response?.status === 401) {
        setUser(null);
        navigate("/driver/login", { replace: true });
      } else setProfileError("Could not load your profile. Check your connection and try again.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [navigate, setUser]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    let active = true;
    if (!browserSupportsPush) return () => { active = false; };
    API.get("/driver/push/config").then(async ({ data }) => {
      if (!active) return;
      setPushConfig({ loaded: true, supported: Boolean(data.supported), publicKey: data.publicKey || null });
      if (!data.supported) return;
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!active || !subscription) { if (active) setPushRegistered(false); return; }
        const result = await API.post("/driver/push/subscription/status", { endpoint: subscription.endpoint });
        if (active) {
          const registered = Boolean(result.data.registered);
          setPushRegistered(registered);
          setDriverPushRegistered(user?.id, registered);
        }
      } catch {
        if (active) setPushError("Could not verify this device's notification registration. Try enabling notifications again.");
      }
    }).catch((error) => {
      if (active) { setPushConfig({ loaded: true, supported: false, publicKey: null }); setPushError(error.response?.data?.message || "Could not check background notification setup."); }
    });
    return () => { active = false; };
  }, [browserSupportsPush, user?.id]);

  const selectAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (passwords.newPassword && passwords.newPassword !== passwords.confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.append("name", profile.name);
    form.append("email", profile.email);
    form.append("phone", profile.phone);
    if (avatarFile) form.append("avatar", avatarFile);
    if (passwords.currentPassword) form.append("currentPassword", passwords.currentPassword);
    if (passwords.newPassword) form.append("newPassword", passwords.newPassword);
    try {
      const { data } = await API.put("/settings", form, { headers: { "Content-Type": "multipart/form-data" } });
      setProfile(data);
      setUser((current) => current ? { ...current, ...data } : current);
      setAvatarFile(null);
      setPreview("");
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Profile updated successfully.");
    } catch (error) {
      if (error.response?.status === 401) {
        setUser(null);
        navigate("/driver/login", { replace: true });
      } else toast.error(error.response?.data?.message || "Could not save your profile.");
    } finally { setSaving(false); }
  };

  const testSound = async () => {
    setTestingSound(true);
    setSoundBlocked(false);
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const played = await playAssignmentSound(AudioContextClass, preferences);
    if (!played) setSoundBlocked(true);
    setTestingSound(false);
    if (played) toast.success("Notification sound preview played.");
    else toast.error("The browser blocked audio. Interact with this page and try again.");
  };

  const updatePreference = (patch) => updatePreferences(patch);

  const enableBackgroundNotifications = async () => {
    if (!browserSupportsPush || !pushConfig.publicKey || pushBusy) return;
    setPushBusy(true); setPushError("");
    try {
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      setPushPermission(permission);
      if (permission !== "granted") {
        if (permission === "denied") setPushError("Notifications are blocked for this site. Change the permission in your browser or device settings, then return here.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/driver-push-sw.js", { scope: "/" });
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidPublicKey(pushConfig.publicKey) });
      await API.post("/driver/push/subscription", subscription.toJSON());
      setPushRegistered(true);
      setDriverPushRegistered(user?.id, true);
      toast.success("Background delivery notifications are enabled on this device.");
    } catch (error) {
      setPushError(error.response?.data?.message || "Could not enable background notifications. Check your connection and try again.");
    } finally { setPushBusy(false); }
  };

  const disableBackgroundNotifications = async () => {
    if (pushBusy) return;
    setPushBusy(true); setPushError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await API.delete("/driver/push/subscription", { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setPushRegistered(false);
      setDriverPushRegistered(user?.id, false);
      toast.success("Background notifications are disabled on this device.");
    } catch (error) {
      setPushError(error.response?.data?.message || "Could not disable notifications. Try again.");
    } finally { setPushBusy(false); }
  };

  const pushStateLabels = {
    unsupported: "Unsupported in this browser or connection",
    unavailable: "Server push is not configured yet",
    denied: "Blocked in browser settings",
    enabled: "Enabled on this device",
    granted: "Browser permission granted; setup is not complete",
    not_enabled: "Not enabled yet",
  };

  return <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
    <div className="mx-auto max-w-3xl space-y-6">
      <DriverHeader user={user} setUser={setUser} />
      <header><p className="text-sm font-semibold text-primary">Driver portal</p><h1 className="mt-1 text-3xl font-bold sm:text-4xl">Settings</h1><p className="mt-2 text-muted-foreground">Manage your profile, appearance, and delivery alerts.</p></header>

      <form onSubmit={saveProfile} className={card}>
        <div><h2 className="text-xl font-bold sm:text-2xl">Profile information</h2><p className="mt-1 text-sm text-muted-foreground">Update the account details used by the store.</p></div>
        {loading ? <p className="text-sm text-muted-foreground">Loading profile…</p> : profileError ? <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{profileError}<button type="button" onClick={() => { setProfileError(""); setLoading(true); void loadProfile(); }} className="ml-3 min-h-10 rounded-lg border px-3 font-medium">Retry</button></div> : <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Name<Input className="mt-2" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label>
            <label className="text-sm font-medium">Email<Input className="mt-2" type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></label>
            <label className="text-sm font-medium">Phone<Input className="mt-2" type="tel" value={profile.phone || ""} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
          </div>
          <Field>
            <FieldLabel htmlFor="driver-avatar">Profile picture</FieldLabel>
            <Input id="driver-avatar" type="file" accept="image/*" onChange={selectAvatar} />
            <FieldDescription>Choose an image to update your account picture.</FieldDescription>
          </Field>
          {(preview || profile.avatar) && <img src={preview || profile.avatar} alt="Profile preview" className="size-28 rounded-2xl border object-cover" />}
          <div className="space-y-3 border-t pt-5"><h3 className="font-semibold">Change password</h3><div className="grid gap-3 sm:grid-cols-3">
            <Input aria-label="Current password" type="password" autoComplete="current-password" placeholder="Current password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} />
            <Input aria-label="New password" type="password" autoComplete="new-password" placeholder="New password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} />
            <Input aria-label="Confirm new password" type="password" autoComplete="new-password" placeholder="Confirm new password" value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} />
          </div></div>
          <button disabled={saving} className="min-h-11 w-full rounded-xl bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-50 sm:w-fit">{saving ? "Saving…" : "Save profile"}</button>
        </>}
      </form>

      <section className={card}>
        <div><h2 className="text-xl font-bold sm:text-2xl">Appearance</h2><p className="mt-1 text-sm text-muted-foreground">Theme preference is shared with the rest of the store.</p></div>
        <div className="flex items-center justify-between rounded-xl border p-4"><span className="font-medium">Color theme</span><ThemeToggle /></div>
      </section>

      <section className={card}>
        <div><h2 className="text-xl font-bold sm:text-2xl">New delivery notifications</h2><p className="mt-1 text-sm text-muted-foreground">Preferences are saved on this browser for your driver account and apply to dashboard alerts.</p></div>
        <p role="status" className="text-sm text-muted-foreground">Changes are saved automatically.</p>
        <label className="flex min-h-11 items-center gap-3"><input className="size-4 accent-primary" type="checkbox" checked={preferences.enabled} onChange={(event) => updatePreference({ enabled: event.target.checked })} /><span className="font-medium">Play a sound for new assignments</span></label>
        <label className="block space-y-2"><span className="flex justify-between text-sm font-medium"><span>Notification volume</span><span>{preferences.volume}%</span></span><input aria-label="Notification volume" className="w-full accent-primary" type="range" min="0" max="100" step="5" value={preferences.volume} onChange={(event) => updatePreference({ volume: Number(event.target.value) })} /><span className="flex justify-between text-xs text-muted-foreground"><span>0%</span><span>100%</span></span></label>
        <label className="block space-y-2 text-sm font-medium">Notification sound<select className="min-h-11 w-full rounded-lg border bg-background px-3 text-foreground" value={preferences.sound} onChange={(event) => updatePreference({ sound: event.target.value })}><option value="chime">Soft chime</option><option value="double-beep">Double beep</option><option value="clear-alert">Clear alert</option><option value="loud-alert">Loud alert</option></select><span className="block text-xs font-normal text-muted-foreground">Loud alert uses a brighter, stronger tone. Preview your choice before saving.</span></label>
        <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={testingSound} onClick={testSound} className="min-h-11 rounded-lg border px-4 font-medium disabled:opacity-50">{testingSound ? "Playing…" : "Test sound"}</button><span aria-live="polite" className="text-sm text-muted-foreground">{soundBlocked ? "Audio is blocked. Interact with this page, then try the preview again." : "Your browser may require a page interaction before it allows audio."}</span></div>
      </section>

      <section className={card} aria-labelledby="background-notifications-heading">
        <div><h2 id="background-notifications-heading" className="text-xl font-bold sm:text-2xl">Background notifications</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Enable this if you want the browser or device to notify you when a delivery is assigned while the dashboard is in the background. We send only a generic assignment notice; it contains no customer address or phone number.</p></div>
        <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold" role="status">{pushStateLabels[pushState]}</span>{pushBusy && <span className="text-sm text-muted-foreground">Updating…</span>}</div>
        {pushState === "not_enabled" && <p className="text-sm text-muted-foreground">Choose Enable to ask the browser for permission. The browser will not be prompted until you press that button.</p>}
        {pushState === "granted" && <p className="text-sm text-muted-foreground">Permission is already granted. Enable background delivery messages for this driver account on this device.</p>}
        {pushState === "denied" && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><p className="font-medium">Notifications are blocked.</p><p className="mt-1 text-muted-foreground">Open this site’s permissions from your browser address bar or device notification settings, change Notifications to Allow, then reload this page. This site will not prompt repeatedly.</p></div>}
        {pushState === "unavailable" && <p className="text-sm text-muted-foreground">The server has not been configured for Web Push yet. Your dashboard polling and selected sound continue to work while the portal is open.</p>}
        {pushState === "unsupported" && <p className="text-sm text-muted-foreground">This browser, connection, or device does not support Web Push here. The dashboard will continue checking for assignments while it is open.</p>}
        {pushError && <p role="alert" className="text-sm text-destructive">{pushError}</p>}
        {(pushState === "not_enabled" || pushState === "granted") && <button type="button" disabled={pushBusy || !pushConfig.loaded} onClick={enableBackgroundNotifications} className="min-h-11 w-full rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50 sm:w-fit">{pushBusy ? "Enabling…" : "Enable background notifications"}</button>}
        {pushState === "enabled" && <button type="button" disabled={pushBusy} onClick={disableBackgroundNotifications} className="min-h-11 rounded-xl border px-5 font-semibold disabled:opacity-50">{pushBusy ? "Disabling…" : "Disable on this device"}</button>}
        <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground"><p>When the dashboard is open, your selected sound and volume are used. In the background, the browser or device controls the notification sound; custom web audio and its volume slider cannot run reliably after the page is closed.</p><p>For iPhone and iPad, use Safari’s Share menu, choose Add to Home Screen, then open the installed icon before enabling notifications. Apple supports Web Push for Home Screen web apps on iOS/iPadOS 16.4 and later. Browser and device power settings can delay or suppress notifications.</p><p>On other devices, install the site as an app if your browser offers that option. Push still depends on browser permission, network access, and the device’s background settings.</p></div>
      </section>
    </div>
  </main>;
};

export default DriverSettings;
