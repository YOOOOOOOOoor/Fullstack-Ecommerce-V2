export const canManageAdminSupport = (user) => user?.role === "admin" && user?.staff_status === "active" && user?.is_super_admin === true;
