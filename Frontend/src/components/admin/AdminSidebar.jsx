import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Tags,
  ShoppingCart,
  ArrowLeft,
  Store,
  BarChart3,
  Users,
  Truck,
  RotateCcw,
  ShieldCheck,
  Settings,
  Bell,
  LifeBuoy,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { hasAdminNavigationAccess } from "./adminNavigation";
const data = {
  navMain: [
    {
      title: "OVERVIEW",
      items: [
        { title: "Dashboard", url: "/admin", icon: LayoutDashboard, permission: "view_dashboard" },
      ],
    },
    {
      title: "STORE",
      items: [
        { title: "Products", url: "/admin/products", icon: Package, permission: "manage_products" },
        { title: "Categories", url: "/admin/category", icon: Tags, permission: "manage_products" },
        { title: "Customers", url: "/admin/customers", icon: Users, permission: "manage_customers" },
      ],
    },
    {
      title: "OPERATIONS",
      items: [
        { title: "Orders", url: "/admin/orders", icon: ShoppingCart, permission: "view_orders" },
        { title: "Drivers", url: "/admin/drivers", icon: Truck, anyPermissions: ["assign_drivers", "view_delivery_history"] },
        { title: "Refunds", url: "/admin/refunds", icon: RotateCcw, permission: "view_refunds" },
      ],
    },
    {
      title: "INSIGHTS",
      items: [
        { title: "Analytics", url: "/admin/analytics", icon: BarChart3, permission: "view_reports" },
      ],
    },
    {
      title: "ADMINISTRATION",
      items: [
        { title: "Staff Permissions", url: "/admin/staff", icon: ShieldCheck, superAdmin: true },
        { title: "Shipping Settings", url: "/admin/shipping", icon: Settings, superAdmin: true },
        { title: "Staff Activity", url: "/admin/notifications", icon: Bell, permission: "view_notifications" },
        { title: "Support", url: "/admin/support", icon: LifeBuoy, superAdmin: true },
      ],
    },
  ],
};
export function AdminSidebar({ user, ...props }) {
  const location = useLocation();
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar" {...props}>
      {" "}
      <SidebarHeader>
        {" "}
        <div className="flex min-w-0 items-center gap-3 px-4 py-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {" "}
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            {" "}
            <Store className="size-5 shrink-0" aria-hidden="true" />{" "}
          </div>{" "}
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            {" "}
            <h1 className="text-xl font-bold text-foreground">
              {" "}
              Admin Panel{" "}
            </h1>{" "}
            <p className="text-xs text-muted-foreground">
              {" "}
              Manage your store{" "}
            </p>{" "}
          </div>{" "}
        </div>{" "}
      </SidebarHeader>{" "}
      <SidebarContent>
        {" "}
        {data.navMain.map((group) => (
          <SidebarGroup key={group.title} className="px-3 group-data-[collapsible=icon]:px-2">
            {" "}
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold tracking-[0.12em] text-sidebar-foreground/55"> {group.title} </SidebarGroupLabel>{" "}
            <SidebarGroupContent>
              {" "}
              <SidebarMenu className="gap-1">
                {" "}
                {group.items.filter((item) => hasAdminNavigationAccess(user, item)).map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.title}>
                      {" "}
                      <SidebarMenuButton
                        render={<Link
                          to={item.url}
                          aria-current={location.pathname === item.url ? "page" : undefined}
                          className="flex w-full min-w-0 items-center gap-2.5 px-2.5"
                        >
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 truncate">{item.title}</span>
                        </Link>}
                        size="md"
                        isActive={location.pathname === item.url || (item.url !== "/admin" && location.pathname.startsWith(item.url + "/"))}
                        tooltip={item.title}
                      />{" "}
                    </SidebarMenuItem>
                  );
                })}{" "}
              </SidebarMenu>{" "}
            </SidebarGroupContent>{" "}
          </SidebarGroup>
        ))}{" "}
        {/* Back to store */}{" "}
        <SidebarGroup className="mt-auto">
          {" "}
          <SidebarGroupContent>
            {" "}
            <SidebarMenu>
              {" "}
              <SidebarMenuItem>
                {" "}
                <SidebarMenuButton
                  render={<Link to="/" className="flex w-full items-center gap-2.5 px-2.5"><ArrowLeft aria-hidden="true" /><span>Go back to store</span></Link>}
                  size="md"
                  tooltip="Go back to store"
                />{" "}
              </SidebarMenuItem>{" "}
            </SidebarMenu>{" "}
          </SidebarGroupContent>{" "}
        </SidebarGroup>{" "}
      </SidebarContent>{" "}
      <SidebarRail />{" "}
    </Sidebar>
  );
}
