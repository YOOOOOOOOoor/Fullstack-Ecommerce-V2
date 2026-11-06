import { Outlet } from "react-router-dom";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminSidebar } from "../components/admin/AdminSidebar";
import ThemeToggle from "../components/ThemeToggle";
import { AdminSectionGate } from "../pages/Admin/AdminRoute";
const AdminLayout = ({ user }) => {
  return (
    <SidebarProvider style={{ "--sidebar-width": "14.5rem", "--sidebar-width-icon": "3.5rem" }}>
      {" "}
      <div className="min-h-screen bg-background flex w-full">
        {" "}
        <AdminSidebar user={user} />{" "}
        <SidebarInset className="min-w-0 bg-background">
          {" "}
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
            {" "}
            <SidebarTrigger />{" "}
            <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {" "}
              Admin Dashboard{" "}
            </h1>{" "}
            <div className="ml-auto"><ThemeToggle /></div>
          </header>{" "}
          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-7">
            {" "}
            <AdminSectionGate user={user}><Outlet context={{ user }} /></AdminSectionGate>{" "}
          </main>{" "}
        </SidebarInset>{" "}
      </div>{" "}
    </SidebarProvider>
  );
};
export default AdminLayout;
