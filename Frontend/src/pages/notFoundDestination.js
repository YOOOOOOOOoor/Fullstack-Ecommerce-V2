export const getNotFoundDestination = (pathname) => {
  if (pathname === "/driver" || pathname.startsWith("/driver/")) return "/driver/dashboard";
  if (pathname.startsWith("/admin/")) return "/admin";
  return "/";
};
