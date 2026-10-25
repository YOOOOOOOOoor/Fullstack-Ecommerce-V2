import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, LogOut, Truck } from "lucide-react";
import API from "../../../API/api.js";
import { logoutDriver } from "../../pages/driverSession.js";

const DriverHeader = ({ setUser }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const logout = async () => {
    try {
      await logoutDriver({ api: API, setUser, navigate });
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Could not log out. Please try again.",
      );
    }
  };

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm sm:px-5 ">
      <Link
        to="/driver/dashboard"
        className="flex min-h-10 items-center gap-2 font-semibold"
      >
        <Truck aria-hidden="true" className="size-5 text-primary" /> Driver
        Portal
      </Link>
      <nav aria-label="Driver navigation" className="flex items-center gap-2">
        <Link
          to="/driver/dashboard"
          aria-current={
            pathname === "/driver/dashboard" ||
            pathname.startsWith("/driver/deliveries")
              ? "page"
              : undefined
          }
          className="min-h-10 rounded-lg px-3 py-2 text-sm hover:bg-muted"
        >
          Deliveries
        </Link>
        <Link
          to="/driver/settings"
          aria-current={pathname === "/driver/settings" ? "page" : undefined}
          aria-label="Driver settings, including delivery alerts"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
        >
          <Bell size={16} />
          <span className="hidden sm:inline">Settings</span>
        </Link>
        <button
          type="button"
          aria-label="Log out"
          onClick={logout}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
        >
          <LogOut size={16} /> <span className="hidden sm:inline">Log out</span>
        </button>
      </nav>
    </header>
  );
};

export default DriverHeader;
