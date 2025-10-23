import { useAuth } from "./App";
import { Navigate } from "react-router-dom";

function PrivateRoute({ children, allowedRoles }) {
  const { auth } = useAuth();

  if (!auth) {
    return <Navigate to="/login" />;
  }

  if (!allowedRoles.includes(auth.role)) {
    return <Navigate to="/login" />;
  }

  return children;
}

export default PrivateRoute;
