export async function logoutDriver({ api, setUser, navigate }) {
  await api.post("/auth/logout");
  setUser(null);
  navigate("/driver/login", { replace: true });
}
