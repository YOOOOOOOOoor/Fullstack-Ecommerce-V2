import { Navigate } from "react-router-dom";

const DriverRoute = ({ user, children }) => {
  if (!user) return <Navigate to="/driver/login" replace />;
  if (user.driver_status !== "active") return <Navigate to="/" replace />;
  return children;
};

export default DriverRoute;
