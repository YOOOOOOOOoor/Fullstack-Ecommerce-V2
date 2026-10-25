import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Navi from "../components/customer/Navi";
import Footer from "../pages/customer/Footer";
import { CustomerShopProvider } from "../context/CustomerShopContext.jsx";
const CustomerLayout = ({ user, setUser }) => {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <CustomerShopProvider user={user}>
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {" "}
      <Navi user={user} setUser={setUser} />{" "}
      <main className="flex-1">
        {" "}
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {" "}
          <div key={location.pathname} className="customer-page-transition"><Outlet /></div>{" "}
        </div>{" "}
      </main>{" "}
      <Footer />{" "}
    </div>
    </CustomerShopProvider>
  );
};
export default CustomerLayout;
