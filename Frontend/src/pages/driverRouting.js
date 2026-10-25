export const isActiveDriver = (user) => user?.driver_status === "active";

export const getPostLoginDestination = (user) => {
  if (isActiveDriver(user)) return "/driver/dashboard";
  if (user?.role === "admin" && user?.staff_status === "active") {
    if (user?.is_super_admin) return "/admin";
    const sections = [
      ["view_dashboard", "/admin"],
      ["manage_products", "/admin/products"],
      ["view_orders", "/admin/orders"],
      ["view_reports", "/admin/analytics"],
      ["manage_customers", "/admin/customers"],
      ["assign_drivers", "/admin/drivers"],
      ["view_refunds", "/admin/refunds"],
      ["view_notifications", "/admin/notifications"],
    ];
    return sections.find(([permission]) => user?.permissions?.includes(permission))?.[1] || "/admin/restricted";
  }
  return "/";
};
