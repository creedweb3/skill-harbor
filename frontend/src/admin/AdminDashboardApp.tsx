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
      <div className="admin-login-page" aria-busy="true">
        <div className="admin-login-page__bg" aria-hidden />
        <div className="admin-login-loading">
          <div className="admin-login-mark" aria-hidden>
            <span className="admin-login-mark__diamond">◆</span>
          </div>
          <p className="admin-login-loading__text">Checking session…</p>
        </div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-page__bg" aria-hidden>
          <div className="admin-login-page__glow admin-login-page__glow--a" />
          <div className="admin-login-page__glow admin-login-page__glow--b" />
          <div className="admin-login-page__grid" />
        </div>

        <div className="admin-login-shell">
          <section className="admin-login-brand" aria-labelledby="admin-login-title">
            <p className="admin-eyebrow">Skill Harbor</p>
            <div className="admin-login-mark" aria-hidden>
              <span className="admin-login-mark__diamond">◆</span>
            </div>
            <h1 id="admin-login-title">Registry control room</h1>
            <p className="admin-login-brand__lead">
              Sign in to crawl GitHub, refresh stars, tune discovery, and keep the local
              skill catalog healthy.
            </p>
            <ul className="admin-login-features">
              <li>
                <span className="admin-login-features__icon" aria-hidden>
                  ↻
                </span>
                <span>Sync &amp; expand the registry from seed repos</span>
              </li>
              <li>
                <span className="admin-login-features__icon" aria-hidden>
                  ★
                </span>
                <span>Refresh live GitHub star counts</span>
              </li>
              <li>
                <span className="admin-login-features__icon" aria-hidden>
                  ◫
                </span>
                <span>Monitor jobs, queue depth, and activity logs</span>
              </li>
            </ul>
            <a className="admin-login-back" href="/">
              ← Back to marketplace
            </a>
          </section>

          <section className="admin-login-card" aria-labelledby="admin-login-form-title">
            <header className="admin-login-card__head">
              <h2 id="admin-login-form-title">Admin sign in</h2>
              <p>Use your registry operator credentials.</p>
            </header>

            {loginError ? (
              <div className="admin-login-alert" role="alert">
                {loginError}
              </div>
            ) : null}

            <form
              className="admin-login-form"
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              <Field label="Username">
                <TextInput
                  className="admin-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  placeholder="admin"
                />
              </Field>
              <Field label="Password">
                <TextInput
                  className="admin-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </Field>
              <Button
                variant="accent"
                full
                type="submit"
                disabled={busy || !password.trim()}
              >
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <footer className="admin-login-card__foot">
              <span className="admin-login-dev-label">Development default</span>
              <code className="admin-login-dev-creds">admin / admin</code>
            </footer>
          </section>
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
