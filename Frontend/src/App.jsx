import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import API from "../API/api.js";

import { Spinner } from "@/components/ui/spinner";

// layouts
import CustomerLayout from "./layouts/CustomerLayout";
import AdminLayout from "./layouts/AdminLayout";

// auth
import Login from "./pages/Login";
import Register from "./pages/Register";
import Success from "./pages/Success";

// customer
import Home from "./pages/customer/Home";
import ProductsCustomer from "./pages/customer/Products";
import SinglePage from "./pages/customer/SinglePage";
import Cart from "./pages/customer/Cart";
import CheckoutPage from "./pages/customer/CheckoutPage";
import Order from "./pages/customer/Orders";
import OrderDetails from "./pages/customer/OrderDetails";
import CustomerRoute from "./pages/customer/CustomerRoute";
import Wishlist from "./pages/customer/Wishlist";
import Settings from "./pages/customer/Settings";
import SupportPage from "./pages/customer/SupportPage";
import About from "./pages/customer/About";

// admin
import Dashboard from "./pages/Admin/Dashboard.jsx";
import AdminRoute from "./pages/Admin/AdminRoute.jsx";
import Controllers from "./pages/Admin/Controllers";
import Products from "./pages/Admin/Products";
import Orders from "./pages/Admin/AdminOrders";
import AdminOrderDetail from "./pages/Admin/AdminOrderDetail";
import Add from "./pages/Admin/products/Add";
import Edit from "./pages/Admin/products/Edit";
import Analytics from "./pages/Admin/Analytics";
import Customers from "./pages/Admin/Customers";
import DriverPortal from "./pages/DriverPortal";
import DriverSettings from "./pages/DriverSettings.jsx";
import DriverRoute from "./pages/DriverRoute";
import NotFound from "./pages/NotFound.jsx";
import AdminDrivers from "./pages/Admin/Drivers";
import DriverHistory from "./pages/Admin/DriverHistory";
import AdminRefunds from "./pages/Admin/Refunds";
import AdminRefundDetails from "./pages/Admin/RefundDetails.jsx";
import AdminStaff from "./pages/Admin/Staff";
import ShippingSettings from "./pages/Admin/ShippingSettings";
import NotificationWarnings from "./pages/Admin/NotificationWarnings";
import { isActiveDriver } from "./pages/driverRouting.js";
import { canManageAdminSupport } from "./pages/adminSupportAccess.js";

API.defaults.withCredentials = true;

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await API.get("/auth/me");
        setUser(res.data.user);
      } catch (err) {
        console.log(err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  if (loading)
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-4 py-8">
        <section
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-labelledby="startup-loading-title"
          className="w-full max-w-md rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-sm sm:px-10"
        >
          <span aria-hidden="true" className="mx-auto mb-6 grid size-16 place-items-center rounded-2xl bg-primary/10">
            <Spinner aria-hidden="true" className="size-8 text-primary motion-reduce:animate-none" />
          </span>
          <h1 id="startup-loading-title" className="text-xl font-semibold text-foreground sm:text-2xl">
            Waking up the server
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground sm:text-base">
            We’re connecting to the store and checking your session. This can take a little while if the server has been idle.
          </p>
        </section>
      </main>
    );

  return (
    <Router>
      <Routes>
        <Route path="/driver/login" element={<Login user={user} setUser={setUser} />} />
        <Route path="/driver/dashboard" element={<DriverRoute user={user}><DriverPortal user={user} setUser={setUser} /></DriverRoute>} />
        <Route path="/driver/deliveries" element={<DriverRoute user={user}><DriverPortal user={user} setUser={setUser} /></DriverRoute>} />
        <Route path="/driver/deliveries/:id" element={<DriverRoute user={user}><DriverPortal user={user} setUser={setUser} /></DriverRoute>} />
        <Route path="/driver/settings" element={<DriverRoute user={user}><DriverSettings user={user} setUser={setUser} /></DriverRoute>} />
        <Route path="/driver/*" element={<DriverRoute user={user}><NotFound /></DriverRoute>} />
        {/* ---------- CUSTOMER LAYOUT ---------- */}

        <Route element={<CustomerLayout user={user} setUser={setUser} />}>
          <Route path="/about" element={<About />} />
          <Route path="/faq" element={<SupportPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/" element={isActiveDriver(user) ? <Navigate to="/driver/dashboard" replace /> : <Home user={user} />} />

          <Route
            path="/products"
            element={<ProductsCustomer user={user} setUser={setUser} />}
          />

          <Route
            path="/products/:id"
            element={<SinglePage user={user} setUser={setUser} />}
          />

          <Route
            path="/settings"
            element={
              <CustomerRoute user={user}>
                <Settings user={user} setUser={setUser} />
              </CustomerRoute>
            }
          />

          <Route path="/success" element={<Success />} />

          <Route
            path="/cart"
            element={
              <CustomerRoute user={user}>
                <Cart user={user} setUser={setUser} />
              </CustomerRoute>
            }
          />

          <Route
            path="/checkout"
            element={
              <CustomerRoute user={user}>
                <CheckoutPage user={user} setUser={setUser} />
              </CustomerRoute>
            }
          />

          <Route
            path="/order"
            element={
              <CustomerRoute user={user}>
                <Order user={user} setUser={setUser} />
              </CustomerRoute>
            }
          />

          <Route
            path="/order/:id"
            element={
              <CustomerRoute user={user}>
                <OrderDetails user={user} setUser={setUser} />
              </CustomerRoute>
            }
          />

          <Route
            path="/wishlist"
            element={
              <CustomerRoute user={user}>
                <Wishlist user={user} setUser={setUser} />
              </CustomerRoute>
            }
          />
        </Route>

        {/* ---------- AUTH ---------- */}

        <Route
          path="/login"
          element={<Login user={user} setUser={setUser} />}
        />

        <Route
          path="/register"
          element={<Register user={user} setUser={setUser} />}
        />

        <Route path="*" element={<NotFound />} />

        {/* ---------- ADMIN ---------- */}

        <Route
          path="/admin"
          element={
            <AdminRoute user={user}>
              <AdminLayout user={user} />
            </AdminRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="restricted" element={<div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center"><h2 className="text-xl font-semibold">Access restricted</h2><p className="mt-2 text-muted-foreground">An administrator must grant access to at least one dashboard section.</p></div>} />

          <Route path="products" element={<Products />} />

          <Route
            path="products/add"
            element={<Add user={user} setUser={setUser} />}
          />
          <Route path="customers" element={<Customers />} />
          <Route path="drivers" element={<AdminDrivers />} />
          <Route path="drivers/:userId/history" element={<DriverHistory />} />
          <Route path="refunds" element={<AdminRefunds />} />
          <Route path="refunds/:refundId" element={<AdminRefundDetails />} />
          <Route path="staff" element={<AdminStaff />} />
          <Route path="shipping" element={<ShippingSettings />} />
          <Route path="notifications" element={<NotificationWarnings />} />
          <Route path="support" element={canManageAdminSupport(user) ? <SupportPage adminMode /> : <Navigate to="/admin" replace />} />

          <Route
            path="products/:id"
            element={<Edit user={user} setUser={setUser} />}
          />

          <Route path="category" element={<Controllers />} />

          <Route path="orders" element={<Orders user={user} />} />

          <Route path="orders/:id" element={<AdminOrderDetail />} />

          <Route path="analytics" element={<Analytics />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster richColors position="top-right" />
    </Router>
  );
}

export default App;
