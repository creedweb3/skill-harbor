import { useCallback, useEffect, useState } from "react";
import {
  getAdminSession,
  postAdminLogin,
  postAdminLogout,
  patchAdminSettings,
} from "../api";
import { AdminPage } from "../pages/AdminPage";
import { Button } from "../components/ui/Button";
import { Field, TextInput } from "../components/ui/Field";
import "../styles/admin.css";

export function AdminDashboardApp() {
  const [auth, setAuth] = useState<{
    authenticated: boolean;
    github_token_set: boolean;
    credentials_configured: boolean;
  } | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const s = await getAdminSession();
      setAuth(s);
    } catch {
      setAuth({ authenticated: false, github_token_set: false, credentials_configured: false });
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const login = async () => {
    setBusy(true);
    setLoginError("");
    try {
      await postAdminLogin(username.trim(), password);
      setPassword("");
      await loadSession();
    } catch (e) {
      setLoginError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await postAdminLogout();
    setAuth({ authenticated: false, github_token_set: false, credentials_configured: true });
  };

  if (auth === null) {
    return (
      <div className="admin-standalone">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!auth.authenticated) {
    return (
      <div className="admin-standalone">
        <div className="admin-gate-card">
          <span className="admin-gate-icon" aria-hidden>
            ◈
          </span>
          <h1>Admin dashboard</h1>
          <p>
            Sign in to manage the registry. Dev default: <strong>admin</strong> / <strong>admin</strong>
          </p>
          {loginError ? <p className="admin-login-error">{loginError}</p> : null}
          <Field label="Username">
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && login()}
            />
          </Field>
          <Button variant="primary" full onClick={login} disabled={busy || !password}>
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell harbor-scroll">
      <AdminPage
        githubTokenSet={auth.github_token_set}
        onLogout={logout}
        onGithubTokenSaved={loadSession}
        patchGithubToken={patchAdminSettings}
      />
    </div>
  );
}
