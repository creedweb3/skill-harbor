import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminDashboardApp } from "./admin/AdminDashboardApp";
import "./App.css";
import "./styles/tokens.css";
import "./styles/global.css";

const path = window.location.pathname.replace(/\/$/, "") || "/";
const isAdminRoute =
  path === "/admin-dashboard" || path.startsWith("/admin-dashboard/");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdminRoute ? <AdminDashboardApp /> : <App />}</StrictMode>
);
