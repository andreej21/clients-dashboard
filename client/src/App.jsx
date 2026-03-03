import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./Login";
import Admin from "./Admin";
import Dashboard from "./Dashboard";
import GoogleDashboard from "./GoogleDashboard";
import ResetPassword from "./ResetPassword";
import API from "./config";

export default function App() {
  const [auth, setAuth] = useState(() => {
    const t = localStorage.getItem("token");
    const u = localStorage.getItem("user");
    return t && u ? { token: t, user: JSON.parse(u) } : null;
  });
  const [myDashboards, setMyDashboards] = useState([]);
  const [activeDash, setActiveDash] = useState(null);

  const login = (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setAuth({ token, user });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuth(null);
    setMyDashboards([]);
    setActiveDash(null);
  };

  // Load dashboards once logged in
  useEffect(() => {
    if (!auth) return;
    fetch(`${API}/my-dashboards`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    }).then(r => r.json()).then(data => {
      setMyDashboards(Array.isArray(data) ? data : []);
    });
  }, [auth]);

  // Smart router — picks the right dashboard component based on type
  const DashboardRouter = (props) => {
    const type = activeDash?.type;
    if (type === "google") {
      return <GoogleDashboard {...props} myDashboards={myDashboards} activeDash={activeDash} setActiveDash={setActiveDash} />;
    }
    return <Dashboard {...props} myDashboards={myDashboards} activeDash={activeDash} setActiveDash={setActiveDash} />;
  };

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      {!auth ? (
        <Route path="*" element={<Login onLogin={login} />} />
      ) : (
        <>
          <Route path="/" element={<Navigate to="/dashboards" replace />} />
          <Route path="/dashboards" element={<DashboardRouter auth={auth} onLogout={logout} />} />
          <Route path="/dashboards/:id" element={<DashboardRouter auth={auth} onLogout={logout} />} />
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