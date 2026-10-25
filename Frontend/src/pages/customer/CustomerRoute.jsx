import { Navigate } from "react-router-dom";

const CustomerRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/login" />;
  }

  return children;
};

export default CustomerRoute;
