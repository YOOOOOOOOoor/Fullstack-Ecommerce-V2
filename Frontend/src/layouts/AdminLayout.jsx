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
    <SidebarProvider style={{ "--sidebar-width-icon": "3.5rem" }}>
      {" "}
      <div className="min-h-screen bg-background flex w-full">
        {" "}
        <AdminSidebar user={user} />{" "}
        <SidebarInset className="min-w-0 bg-background">
          {" "}
          <header className="flex h-16 items-center gap-3 border-b bg-background px-4 sm:px-6">
            {" "}
            <SidebarTrigger />{" "}
            <h1 className="text-xl font-semibold text-foreground">
              {" "}
              Admin Dashboard{" "}
            </h1>{" "}
            <div className="ml-auto"><ThemeToggle /></div>
          </header>{" "}
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            {" "}
            <AdminSectionGate user={user}><Outlet context={{ user }} /></AdminSectionGate>{" "}
          </main>{" "}
        </SidebarInset>{" "}
      </div>{" "}
    </SidebarProvider>
  );
};
export default AdminLayout;
