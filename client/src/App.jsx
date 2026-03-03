import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import Login from "./Login";
import Admin from "./Admin";
import Dashboard from "./Dashboard";
import ResetPassword from "./ResetPassword";

export default function App() {
  const [auth, setAuth] = useState(() => {
    const t = localStorage.getItem("token");
    const u = localStorage.getItem("user");
    return t && u ? { token: t, user: JSON.parse(u) } : null;
  });

  const login = (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setAuth({ token, user });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuth(null);
  };

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      {!auth ? (
        <Route path="*" element={<Login onLogin={login} />} />
      ) : (
        <>
          <Route path="/" element={<Navigate to="/dashboards" replace />} />
          <Route path="/dashboards" element={<Dashboard auth={auth} onLogout={logout} />} />
          <Route path="/dashboards/:id" element={<Dashboard auth={auth} onLogout={logout} />} />
          <Route path="/admin" element={
            auth.user.role === "admin"
              ? <Admin auth={auth} onLogout={logout} />
              : <Navigate to="/dashboards" replace />
          } />
          <Route path="*" element={<Navigate to="/dashboards" replace />} />
        </>
      )}
    </Routes>
  );
}