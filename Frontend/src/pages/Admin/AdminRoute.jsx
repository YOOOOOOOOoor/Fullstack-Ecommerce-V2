import { Navigate, useLocation } from "react-router-dom";
import { getFirstAuthorizedAdminPath } from "../../components/admin/adminNavigation.js";

const ROUTE_PERMISSIONS = [
  [/^\/admin\/?$/, "view_dashboard"],
  [/^\/admin\/(products|category)(\/|$)/, "manage_products"],
  [/^\/admin\/orders(\/|$)/, "view_orders"],
  [/^\/admin\/analytics(\/|$)/, "view_reports"],
  [/^\/admin\/customers(\/|$)/, "manage_customers"],
  [/^\/admin\/drivers\/\d+\/history$/, "view_delivery_history"],
  [/^\/admin\/drivers(\/|$)/, "assign_drivers"],
  [/^\/admin\/refunds(\/|$)/, "view_refunds"],
  [/^\/admin\/notifications(\/|$)/, "view_notifications"],
];

export const AdminSectionGate = ({ user, children }) => {
  const { pathname } = useLocation();
  if (user?.is_super_admin) return children;
  if (pathname === "/admin/drivers" && user?.permissions?.includes("view_delivery_history")) return children;
  if (pathname === "/admin/staff" || pathname === "/admin/shipping" || pathname === "/admin/support") {
    return <Navigate to={getFirstAuthorizedAdminPath(user) || "/admin/restricted"} replace />;
  }
  const permission = ROUTE_PERMISSIONS.find(([pattern]) => pattern.test(pathname))?.[1];
  if (!permission || user?.permissions?.includes(permission)) return children;
  return <Navigate to={getFirstAuthorizedAdminPath(user) || "/admin/restricted"} replace />;
};

const AdminRoute = ({ user, children }) => {
  if (!user || user.role !== "admin" || user.staff_status !== "active") {
    return <Navigate to="/" />;
  }

  return children;
};

export default AdminRoute;
