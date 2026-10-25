export const hasAdminNavigationAccess = (user, item) => {
  if (user?.is_super_admin === true) return true;
  if (item.superAdmin) return false;
  if (item.anyPermissions) return item.anyPermissions.some((permission) => user?.permissions?.includes(permission));
  if (!item.permission) return true;
  return Array.isArray(user?.permissions) && user.permissions.includes(item.permission);
};

export const getFirstAuthorizedAdminPath = (user) => {
  if (user?.is_super_admin) return "/admin";
  const paths = [
    ["view_dashboard", "/admin"],
    ["manage_products", "/admin/products"],
    ["view_orders", "/admin/orders"],
    ["view_reports", "/admin/analytics"],
    ["manage_customers", "/admin/customers"],
    ["assign_drivers", "/admin/drivers"],
    ["view_delivery_history", "/admin/drivers"],
    ["view_refunds", "/admin/refunds"],
    ["view_notifications", "/admin/notifications"],
  ];
  return paths.find(([permission]) => user?.permissions?.includes(permission))?.[1] || null;
};
