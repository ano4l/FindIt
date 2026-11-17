import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, House, LogOut, Shield } from "lucide-react";
import { AVAILABILITY, money } from "../shared/catalog.js";
import { api } from "./api.js";
import "./workspace.css";
import "./account.css";

export function Brand({ onHome }) {
  return (
    <button className="workspace-brand" onClick={onHome} aria-label="Return to FindIt">
      <span className="workspace-brand-mark"><House size={20} strokeWidth={2.7} /></span>
      <span>FINDIT<span>.</span></span><small>HTX</small>
    </button>
  );
}

/* ---------------------------------------------------------------- Auth */
// view: signin | signup | forgot | reset | verify | notice
export function AuthScreen({ mode, token, onMode, onHome, onSignedIn }) {
  const [view, setView] = useState(token ? (mode === "reset" ? "reset" : "verify") : mode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState("");

  useEffect(() => {
    if (view !== "verify" || !token) return;
    api.verify(token)
      .then(() => { window.history.replaceState(null, "", "/signin"); setNotice("Your email is confirmed. You can sign in now."); setView("signin"); })
      .catch((e) => { setError(e.message); setView("signin"); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (next) => { setError(""); setNotice(""); setNeedsConfirm(""); setView(next); onMode?.(next); };

  async function submit(event) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError(""); setNotice("");
    try {
      if (view === "signup") {
        const r = await api.signup({ name: f.name, email: f.email, password: f.password });
        setNotice(r.message); setView("notice");
      } else if (view === "signin") {
        const { user } = await api.login({ email: f.email, password: f.password });
        onSignedIn(user);
      } else if (view === "forgot") {
        const r = await api.forgot(f.email); setNotice(r.message); setView("notice");
      } else if (view === "reset") {
        await api.reset(token, f.password);
        window.history.replaceState(null, "", "/signin");
        setNotice("Password updated. Sign in with your new password."); setView("signin");
      }
    } catch (e) {
      setError(e.message);
      if (e.code === "email_not_verified") setNeedsConfirm(f.email);
    } finally { setBusy(false); }
  }

  const copy = {
    signin: ["WELCOME BACK", "Sign in to FindIt", "Save apartments and locators, and pick up where you left off."],
    signup: ["CREATE YOUR ACCOUNT", "Join FindIt", "Free to join. We'll email you a link to confirm your address. Enter your first and last name and create a strong password."],
    forgot: ["RESET PASSWORD", "Forgot your password?", "Enter your email and we'll send you a reset link."],
    reset: ["RESET PASSWORD", "Choose a new password", "Use 12 or more characters with uppercase and lowercase letters, a number, and a symbol."],
    verify: ["ONE MOMENT", "Confirming your email", "This only takes a second."],
    notice: ["CHECK YOUR EMAIL", "Check your inbox", ""],
  }[view];
  useEffect(() => { document.title = `${copy[1]} · FindIt HTX`; }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="auth-page">
      <header className="workspace-header">
        <Brand onHome={onHome} />
        <button className="workspace-back" onClick={onHome}><ArrowLeft size={15} /> Back to FindIt</button>
      </header>
      <div className="auth-layout">
        <aside className="auth-story">
          <span className="auth-kicker"><span /> HOUSTON, WITH A HUMAN TOUCH</span>
          <h1>Good moves<br /><em>start with good information.</em></h1>
          <p>Search Houston apartments, see when each listing was last checked, and save the places you like.</p>
          <div className="auth-story-photo" role="img" aria-label="Houston skyline at golden hour" />
        </aside>
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-eyebrow">{copy[0]}</div>
          <h2 id="auth-title">{copy[1]}</h2>
          <p className="auth-intro">{view === "notice" ? notice : copy[2]}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && view !== "notice" && <p className="form-ok" role="status">{notice}</p>}
          {needsConfirm && (
          <button className="link-button" onClick={async () => { try { const r = await api.resend(needsConfirm); setError(""); setNotice(r.message); setNeedsConfirm(""); } catch (e) { setError(e.message); } }}>
              Send a new confirmation link
            </button>
          )}
          {["signin", "signup", "forgot", "reset"].includes(view) && (
            <form className="auth-form" onSubmit={submit}>
              {view === "signup" && <label>Full name<input name="name" autoComplete="name" required minLength={3} maxLength={80} pattern="[^ ]+ +.+" title="Enter at least your first and last name." /></label>}
              {view !== "reset" && <label>Email address<input type="email" name="email" autoComplete="email" required maxLength={320} pattern="[^ @]+@[^ @]+[.][^ @]{2,}" title="Enter a valid email address, such as name@example.com." /></label>}
              {view !== "forgot" && (
                <label>{view === "reset" ? "New password" : "Password"}
                  <input type="password" name="password" required minLength={view === "signin" ? 1 : 12} maxLength={200}
                    pattern={view === "signin" ? undefined : "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,}"}
                    autoComplete={view === "signin" ? "current-password" : "new-password"}
                    title={view === "signin" ? undefined : "Use 12 or more characters with uppercase and lowercase letters, a number, and a symbol."}
                    placeholder={view === "signin" ? "" : "12+ characters, uppercase, lowercase, number, symbol"} />
                </label>
              )}
              <button className="button button-dark auth-submit" type="submit" disabled={busy}>
                {busy ? "Please wait…" : { signin: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Save new password" }[view]}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          {view === "signin" && <p className="auth-switch"><button onClick={() => go("forgot")}>Forgot password?</button></p>}
          {(view === "signin" || view === "signup") && (
            <p className="auth-switch">
              {view === "signup" ? "Already have an account?" : "New to FindIt?"}{" "}
              <button onClick={() => go(view === "signup" ? "signin" : "signup")}>{view === "signup" ? "Sign in" : "Create an account"}</button>
            </p>
          )}
          {(view === "forgot" || view === "notice") && <p className="auth-switch"><button onClick={() => go("signin")}>Back to sign in</button></p>}
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------ Member account */
function SavedRow({ image, title, sub, children }) {
  return (
    <li>
      {image ? <img src={image} alt="" /> : <span className="saved-thumb-empty" aria-hidden="true" />}
      <div><strong>{title}</strong><span>{sub}</span></div>
      <div className="saved-actions">{children}</div>
    </li>
  );
}

export function MemberAccount({ user, saved, savedError = "", onUnsave, onOpen, onHome, onSignOut }) {
  const [passwordState, setPasswordState] = useState({ busy: false, error: "", message: "" });
  useEffect(() => { document.title = "My account · FindIt HTX"; }, []);
  async function changePassword(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    if (values.password !== values.confirmPassword) { setPasswordState({ busy: false, error: "The new passwords do not match.", message: "" }); return; }
    setPasswordState({ busy: true, error: "", message: "" });
    try { const result = await api.changePassword({ currentPassword: values.currentPassword, password: values.password }); form.reset(); setPasswordState({ busy: false, error: "", message: result.message }); }
    catch (error) { setPasswordState({ busy: false, error: error.message, message: "" }); }
  }
  const { properties, locators } = saved;
  return (
    <main className="account-page">
      <header className="workspace-header">
        <Brand onHome={onHome} />
        <nav className="workspace-nav" aria-label="Account navigation">
          <button className="workspace-back" onClick={() => onOpen("/apartments")}>Apartments</button>
          <button className="workspace-back" onClick={() => onOpen("/locators")}>Locators</button>
          <button className="workspace-back" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
        </nav>
      </header>
      <section className="account-main">
        <h1>Hi, {user.name.split(" ")[0]}.</h1>
        <p className="account-sub">Signed in as {user.email}</p>
        {savedError && <p className="form-error" role="alert">Could not load your saved items. {savedError}</p>}

        <h2>Saved apartments ({properties.length})</h2>
        {properties.length === 0 ? (
          <div className="account-empty">
            <p>You haven't saved any apartments yet. Use the bookmark on a listing to keep it here.</p>
            <button className="button button-dark" onClick={() => onOpen("/apartments")}>Search apartments</button>
          </div>
        ) : (
          <ul className="saved-list saved-properties">
            {properties.map((p) => (
              <SavedRow key={p.id} image={p.photos?.[0]} title={p.name}
                sub={<>{[p.neighborhood, p.summary?.rent ? `${money(p.summary.rent[0])}+ /mo` : "Price not provided"].filter(Boolean).join(" · ")} · <span className={`avail avail-${p.availability}`}>{AVAILABILITY[p.availability]}</span></>}>
                <button className="link-button" onClick={() => onOpen(`/apartments/${encodeURIComponent(p.id)}`)}>View listing</button>
                <button className="link-button danger" onClick={() => onUnsave("properties", p)}>Remove</button>
              </SavedRow>
            ))}
          </ul>
        )}

        <h2 className="account-h2-gap">Saved locators ({locators.length})</h2>
        {locators.length === 0 ? (
          <div className="account-empty">
            <p>You haven't saved any locators yet.</p>
            <button className="button" onClick={() => onOpen("/locators")}>Find locators</button>
          </div>
        ) : (
          <ul className="saved-list">
            {locators.map((l) => (
              <SavedRow key={l.id} image={l.image} title={l.name} sub={`${l.company || "Company not provided"} · ${(l.serviceAreas || []).join(", ")}`}>
                <button className="link-button" onClick={() => onOpen(`/locators/${encodeURIComponent(l.id)}`)}>View profile</button>
                {l.listingsUrl && <a className="link-button" href={l.listingsUrl} target="_blank" rel="noopener noreferrer">Listings <ExternalLink size={12} /></a>}
                <button className="link-button danger" onClick={() => onUnsave("locators", l)}>Remove</button>
              </SavedRow>
            ))}
          </ul>
        )}

        <section className="account-settings" aria-labelledby="password-heading">
          <h2 id="password-heading">Change password</h2>
          <form className="auth-form" onSubmit={changePassword}>
            <label>Current password<input type="password" name="currentPassword" autoComplete="current-password" required /></label>
            <label>New password<input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={200} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}" title="Use 12 or more characters with uppercase and lowercase letters, a number, and a symbol." required /></label>
            <label>Confirm new password<input type="password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={200} required /></label>
            {passwordState.error && <p className="form-error" role="alert">{passwordState.error}</p>}
            {passwordState.message && <p className="form-ok" role="status">{passwordState.message}</p>}
            <button className="button button-dark" disabled={passwordState.busy}>{passwordState.busy ? "Saving…" : "Update password"}</button>
          </form>
        </section>
        <p className="account-note"><Shield size={14} /> Saved searches, named shortlists and email alerts arrive with memberships in a later release.</p>
      </section>
    </main>
  );
}
