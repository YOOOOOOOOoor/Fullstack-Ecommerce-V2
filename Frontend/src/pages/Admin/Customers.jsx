import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import API from "../../../API/api.js";
import ProfileAvatar from "@/components/customer/ProfileAvatar.jsx";

import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toSelectItems } from "@/lib/selectOptions.js";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const Customers = () => {
  const { user: currentUser } = useOutletContext();
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [role, setRole] = useState("all");

  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);

  const [updatingId, setUpdatingId] = useState(null);

  const [deletingId, setDeletingId] = useState(null);
  const [accountChange, setAccountChange] = useState(null);
  const [changeReason, setChangeReason] = useState("");
  const [permissionOptions, setPermissionOptions] = useState([]);
  const [selectedPermissions, setSelectedPermissions] = useState([]);

  // =========================
  // FETCH USERS
  // =========================

  const fetchUsers = async () => {
    try {
      const res = await API.get("/admin/customers", {
        params: {
          page,
          search: appliedSearch,
          role,
        },
      });

      setUsers(res.data.users);

      setTotalPages(res.data.pages);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    API.get("/admin/customers", { params: { page, search: appliedSearch, role } })
      .then((res) => {
        if (cancelled) return;
        setUsers(res.data.users);
        setTotalPages(res.data.pages);
      })
      .catch((error) => { if (!cancelled) toast.error(error.response?.data?.message || "Failed to load customers."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, role, appliedSearch]);

  useEffect(() => {
    if (!currentUser?.is_super_admin) return;
    API.get("/admin/staff").then((res) => setPermissionOptions(res.data.permissions || []))
      .catch((error) => toast.error(error.response?.data?.message || "Could not load staff permissions."));
  }, [currentUser?.is_super_admin]);

  // =========================
  // SEARCH
  // =========================

  const handleSearch = () => {
    setPage(1);
    setAppliedSearch(search);
  };

  // =========================
  // UPDATE ROLE
  // =========================

  const updateAccountType = async () => {
    if (!accountChange) return;
    try {
      setUpdatingId(accountChange.user.id);
      const result = await API.put(`/admin/customers/${accountChange.user.id}/account-type`, {
        type: accountChange.type,
        reason: changeReason,
        permissions: accountChange.type === "staff" ? selectedPermissions : [],
      });
      toast.success(result.data.message || "Account type updated.");
      setAccountChange(null);
      setChangeReason("");
      setSelectedPermissions([]);
      await fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update account type.");
    } finally {
      setUpdatingId(null);
    }
  };

  const openAccountChange = (user, type) => {
    setAccountChange({ user, type });
    setChangeReason("");
    setSelectedPermissions([]);
  };

  // =========================
  // DELETE USER
  // =========================

  const deleteUser = async (id) => {
    try {
      setDeletingId(id);

      await API.delete(`/admin/customers/${id}`);

      toast.success("User deleted successfully.");

      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete user.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="
    p-6
    space-y-8
    bg-background
    "
    >
      {/* HEADER */}

      <div
        className="
      flex
      flex-col
      md:flex-row
      md:justify-between
      md:items-center
      gap-4
      "
      >
        <div>
          <h1
            className="
          text-3xl
          font-bold
          text-foreground
          "
          >
            Customers
          </h1>

          <p className="text-muted-foreground">
            Manage customer accounts and permissions
          </p>
        </div>

        <div
          className="
        flex
        flex-col
        sm:flex-row
        gap-3
        "
        >
          <input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="
          border
          border-border
          bg-background
          text-foreground
          placeholder:text-muted-foreground
          rounded-lg
          px-4
          py-2
          w-full
          sm:w-64
          "
          />

          <Select
            value={role}
            items={toSelectItems([{ value: "all", label: "All Users" }, { value: "customer", label: "Customers" }, { value: "admin", label: "Staff" }])}
            onValueChange={(value) => {
              setRole(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>

              <SelectItem value="customer">Customers</SelectItem>

              <SelectItem value="admin">Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* CUSTOMER GRID */}

      <div
        className="
      grid
      grid-cols-1
      sm:grid-cols-2
      lg:grid-cols-3
      xl:grid-cols-4
      gap-6
      "
      >
        {loading ? (
          <>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
              <div
                key={item}
                className="
          bg-background
          border
          border-border
          rounded-2xl
          shadow-sm
          p-5
          space-y-4
        "
              >
                {/* Profile Skeleton */}
                <div className="flex items-center gap-4">
                  <Skeleton
                    className="
              w-16
              h-16
              rounded-full
            "
                  />

                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />

                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </div>

                {/* Information Skeleton */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-44" />
                  </div>

                  <div className="space-y-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-28" />
                  </div>

                  <div className="space-y-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                </div>

                {/* Actions Skeleton */}
                <div
                  className="
            flex
            flex-col
            gap-3
            pt-3
            border-t
            border-border
          "
                >
                  <Skeleton className="h-10 w-full rounded-lg" />

                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground">No customers found.</p>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className="
            bg-background
            border
            border-border
            rounded-2xl
            shadow-sm
            p-5
            space-y-4
            "
            >
              {/* PROFILE */}

              <div
                className="
              flex
              items-center
              gap-4
              "
              >
                <ProfileAvatar src={user.avatar} alt={user.name} className="size-16 rounded-full border border-border" />

                <div>
                  <h2
                    className="
                  font-semibold
                  text-lg
                  text-foreground
                  "
                  >
                    {user.name}
                  </h2>

                  <span
                    className={`
                  inline-block
                  mt-1
                  px-3
                  py-1
                  rounded-full
                  text-xs
                  font-medium
                  ${
                    user.role === "admin"
                      ? `
                      bg-purple-100
                      dark:bg-purple-950
                      text-purple-700
                      dark:text-purple-300
                      `
                      : `
                      bg-muted
                      text-muted-foreground
                      `
                  }
                  `}
                  >
                  {user.is_super_admin ? "Super Admin" : user.account_type === "admin" || user.account_type === "staff" ? "Staff" : user.account_type?.replaceAll("_", " ") || user.role}
                  </span>
                  {user.driver_status && (
                    <span className="ml-2 inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                      Driver · {user.driver_status}
                    </span>
                  )}
                  {user.staff_status && !user.is_super_admin && (
                    <span className="ml-2 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Staff Â· {user.staff_status}</span>
                  )}
                </div>
              </div>

              {/* INFORMATION */}

              <div
                className="
              space-y-2
              text-sm
              "
              >
                <div>
                  <p className="text-muted-foreground">Email</p>

                  <p
                    className="
                  font-medium
                  text-foreground
                  truncate
                  "
                  >
                    {user.email}
                  </p>
                </div>

                <div>
                  <p className="text-muted-foreground">Phone</p>

                  <p className="font-medium text-foreground">
                    {user.phone || "N/A"}
                  </p>
                </div>

                <div>
                  <p className="text-muted-foreground">Joined</p>

                  <p className="font-medium text-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* ACTIONS */}

              <div
                className="
              flex
              flex-col
              gap-3
              pt-3
              border-t
              border-border
              "
              >
                {user.is_super_admin ? <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Protected Super Admin account</p> : currentUser?.is_super_admin ? <div className="grid grid-cols-2 gap-2">
                  {user.account_type !== "driver" && user.driver_status !== "revoked" && <button className="rounded-lg border border-primary px-2 py-2 text-sm font-medium text-primary hover:bg-accent" onClick={() => openAccountChange(user, "driver")}>Promote to Driver</button>}
                  {user.driver_status === "revoked" && <p className="col-span-2 text-xs text-muted-foreground">This driver was permanently offboarded and cannot be reactivated.</p>}
                  {user.account_type !== "staff" && <button className="rounded-lg border border-primary px-2 py-2 text-sm font-medium text-primary hover:bg-accent" onClick={() => openAccountChange(user, "staff")}>Promote to Staff</button>}
                  {user.account_type !== "customer" && <button className="col-span-2 rounded-lg border px-2 py-2 text-sm font-medium hover:bg-accent" onClick={() => openAccountChange(user, "customer")}>Return to Customer</button>}
                </div> : <p className="text-sm text-muted-foreground">Account type: {user.account_type?.replaceAll("_", " ") || user.role}</p>}

                {!user.is_super_admin && <AlertDialog>
                  <AlertDialogTrigger
                    className="
                  w-full
                  bg-red-600
                  text-white
                  py-2
                  rounded-lg
                  text-sm
                  hover:bg-red-700
                  transition
                  "
                  >
                    Delete Account
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete User?</AlertDialogTitle>

                      <AlertDialogDescription>
                        This action cannot be undone. The account and related
                        data will be permanently removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>

                      <AlertDialogAction
                        disabled={deletingId === user.id}
                        className="
                      bg-red-600
                      hover:bg-red-700
                      "
                        onClick={() => deleteUser(user.id)}
                      >
                        {deletingId === user.id ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>}
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog open={Boolean(accountChange)} onOpenChange={(open) => { if (!open) setAccountChange(null); }}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm account change</AlertDialogTitle>
            <AlertDialogDescription>
              {accountChange && `Change ${accountChange.user.name} to ${accountChange.type.replaceAll("_", " ")}? Their order and account history will be retained.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {accountChange?.type === "staff" && <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Assign staff permissions</legend>
            {permissionOptions.map((permission) => <label key={permission} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selectedPermissions.includes(permission)} onChange={(event) => setSelectedPermissions((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} />
              {permission.replaceAll("_", " ")}
            </label>)}
          </fieldset>}
          {currentUser?.is_super_admin && <p className="text-sm text-muted-foreground">Super Admin account changes are recorded in the audit log.</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!accountChange || (!currentUser?.is_super_admin && changeReason.trim().length < 5) || (accountChange?.type === "staff" && selectedPermissions.length === 0) || updatingId !== null} onClick={updateAccountType}>
              {updatingId !== null ? "Saving..." : "Confirm change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PAGINATION */}

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();

                if (page > 1) {
                  setPage(page - 1);
                }
              }}
            />
          </PaginationItem>

          {Array.from(
            {
              length: totalPages,
            },
            (_, index) => index + 1,
          ).map((number) => (
            <PaginationItem key={number}>
              <PaginationLink
                href="#"
                isActive={page === number}
                onClick={(e) => {
                  e.preventDefault();
                  setPage(number);
                }}
              >
                {number}
              </PaginationLink>
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();

                if (page < totalPages) {
                  setPage(page + 1);
                }
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

export default Customers;
