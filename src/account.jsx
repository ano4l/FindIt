import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Circle, ExternalLink, Eye, EyeOff, House, LogOut, Shield } from "lucide-react";
import { AVAILABILITY, money } from "../shared/catalog.js";
import { api } from "./api.js";
import { Freshness } from "./ui.jsx";
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

/* ------------------------------------------------------ Password field */
// The same rule the server applies when a password is set, shown as a checklist so nobody has to guess.
const PASSWORD_RULES = [
  ["12 or more characters", (v) => v.length >= 12],
  ["An uppercase letter", (v) => /[A-Z]/.test(v)],
  ["A lowercase letter", (v) => /[a-z]/.test(v)],
  ["A number", (v) => /\d/.test(v)],
  ["A symbol", (v) => /[^A-Za-z0-9]/.test(v)],
];

// A password input with a show/hide button. With `rules`, it also lists the password rules and ticks each
// one off as it is typed. The checklist is guidance only: the form and the server still enforce the rule.
function PasswordField({ label, rules = false, ...props }) {
  const [show, setShow] = useState(false);
  const [value, setValue] = useState("");
  const input = useRef(null);
  const id = useId();
  // The form clears itself after a successful change, so the checklist starts again too.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return undefined;
    const clear = () => { setValue(""); setShow(false); };
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);
  return (
    <div className="password-field">
      <div className="password-input">
        <label>{label}
          <input {...props} ref={input} type={show ? "text" : "password"} onChange={(e) => setValue(e.target.value)} aria-describedby={rules ? `${id}-rules` : undefined} />
        </label>
        <button type="button" className="password-toggle" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={`Show ${label.toLowerCase()}`} title={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {rules && (
        <ul className="password-rules" id={`${id}-rules`} aria-label="Password requirements">
          {PASSWORD_RULES.map(([text, test]) => {
            const met = test(value);
            return (
              <li key={text} className={met ? "is-met" : ""}>
                {met ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
                <span>{text}</span><span className="visually-hidden">{met ? " (done)" : " (still needed)"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Auth */
// view: signin | signup | forgot | reset | verify | resend | notice
export function AuthScreen({ mode, token, emailOn = true, onMode, onHome, onSignedIn }) {
  // A confirm or reset address opened without its token can't do anything, so it goes straight to the
  // screen where a new link can be requested instead of waiting forever.
  const broken = !token && (mode === "verify" || mode === "reset");
  const [view, setView] = useState(token ? (mode === "reset" ? "reset" : "verify") : mode === "verify" ? "resend" : mode === "reset" ? "forgot" : mode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(broken ? "That link is incomplete. Open it again from the email, or request a new one here." : "");
  const [notice, setNotice] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState("");

  useEffect(() => {
    if (view !== "verify" || !token) return;
    api.verify(token)
      .then((r) => {
        window.history.replaceState(null, "", "/signin");
        setNotice(r?.firstAdmin
          ? "Your email is confirmed. This is the first account on FindIt, so it's the admin account. Sign in to open the staff console."
          : "Your email is confirmed. You can sign in now.");
        setView("signin");
      })
      // An expired or already-used link: offer a new one right here.
      .catch((e) => { window.history.replaceState(null, "", "/resend-confirmation"); setError(e.message); setView("resend"); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (next) => { setError(""); setNotice(""); setNeedsConfirm(""); setView(next); onMode?.(next); };

  async function submit(event) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError(""); setNotice("");
    try {
      if (view === "signup") {
        const r = await api.signup({ name: f.name, email: f.email, password: f.password });
        // While confirmation emails are switched off the new account is signed in straight away.
        if (r.user) { onSignedIn(r.user); return; }
        setNotice(r.message); setView("notice");
      } else if (view === "signin") {
        const { user } = await api.login({ email: f.email, password: f.password });
        onSignedIn(user);
      } else if (view === "forgot") {
        const r = await api.forgot(f.email); setNotice(r.message); setView("notice");
      } else if (view === "resend") {
        const r = await api.resend(f.email); setNotice(r.message); setView("notice");
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
    signup: ["CREATE YOUR ACCOUNT", "Join FindIt", emailOn
      ? "Free to join. We'll email you a link to confirm your address. Enter your first and last name and create a strong password."
      : "Free to join. Enter your first and last name and create a strong password."],
    forgot: ["RESET PASSWORD", "Forgot your password?", "Enter your email and we'll send you a reset link."],
    reset: ["RESET PASSWORD", "Choose a new password", "Use 12 or more characters with uppercase and lowercase letters, a number, and a symbol."],
    verify: ["ONE MOMENT", "Confirming your email", "This only takes a second."],
    resend: ["CONFIRM YOUR EMAIL", "Get a new confirmation link", "Enter the email you signed up with and we'll send a fresh link. Links work for 48 hours."],
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
          {["signin", "signup", "forgot", "reset", "resend"].includes(view) && (
            <form className="auth-form" onSubmit={submit}>
              {view === "signup" && <label>Full name<input name="name" autoComplete="name" required minLength={3} maxLength={80} pattern="[^ ]+ +.+" title="Enter at least your first and last name." /></label>}
              {view !== "reset" && <label>Email address<input type="email" name="email" autoComplete="email" required maxLength={320} pattern="[^ @]+@[^ @]+[.][^ @]{2,}" title="Enter a valid email address, such as name@example.com." /></label>}
              {view !== "forgot" && view !== "resend" && (
                <PasswordField label={view === "reset" ? "New password" : "Password"} rules={view !== "signin"}
                  name="password" required minLength={view === "signin" ? 1 : 12} maxLength={200}
                  pattern={view === "signin" ? undefined : "(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,}"}
                  autoComplete={view === "signin" ? "current-password" : "new-password"}
                  title={view === "signin" ? undefined : "Use 12 or more characters with uppercase and lowercase letters, a number, and a symbol."} />
              )}
              <button className="button button-dark auth-submit" type="submit" disabled={busy} aria-busy={busy}>
                {busy ? "Please wait…" : { signin: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Save new password", resend: "Send confirmation link" }[view]}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
          {view === "signin" && (emailOn
            ? <p className="auth-switch"><button onClick={() => go("forgot")}>Forgot password?</button> · <button onClick={() => go("resend")}>Didn’t get a confirmation email?</button></p>
            : <p className="auth-switch">Forgotten your password? <a href="/contact?topic=Account%20help">Send us a message</a> and we’ll help you back in.</p>)}
          {view === "reset" && <p className="auth-switch"><button onClick={() => go("forgot")}>Request a new reset link</button></p>}
          {view === "notice" && <p className="auth-switch">Nothing after a few minutes? Check your spam folder, or <button onClick={() => go("resend")}>send a new confirmation link</button>.</p>}
          {(view === "signin" || view === "signup") && (
            <p className="auth-switch">
              {view === "signup" ? "Already have an account?" : "New to FindIt?"}{" "}
              <button onClick={() => go(view === "signup" ? "signin" : "signup")}>{view === "signup" ? "Sign in" : "Create an account"}</button>
            </p>
          )}
          {(view === "forgot" || view === "notice" || view === "resend") && <p className="auth-switch"><button onClick={() => go("signin")}>Back to sign in</button></p>}
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------ Member account */
function SavedRow({ image, title, sub, meta, children }) {
  return (
    <li>
      {image ? <img src={image} alt="" /> : <span className="saved-thumb-empty" aria-hidden="true" />}
      <div className="saved-text"><strong>{title}</strong><span>{sub}</span>{meta && <div className="saved-meta">{meta}</div>}</div>
      <div className="saved-actions">{children}</div>
    </li>
  );
}

export function MemberAccount({ user, saved, savedError = "", savedLoading = false, onUnsave, onOpen, onHome, onSignOut }) {
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
          {user.role === "staff" && <button className="workspace-back" onClick={() => onOpen("/staff")}>Staff console</button>}
          <button className="workspace-back" onClick={() => onOpen("/apartments")}>Apartments</button>
          <button className="workspace-back" onClick={() => onOpen("/locators")}>Locators</button>
          <button className="workspace-back" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
        </nav>
      </header>
      <section className="account-main">
        <h1>Hi, {user.name.split(" ")[0]}.</h1>
        <p className="account-sub">Signed in as {user.email}</p>
        {savedError && <p className="form-error" role="alert">We couldn’t load your saved places. {savedError} <button className="link-button" onClick={() => window.location.reload()}>Try again</button></p>}

        <h2>Saved apartments{savedLoading || savedError ? "" : ` (${properties.length})`}</h2>
        {savedLoading ? <p role="status">Loading your saved apartments…</p> : savedError && properties.length === 0 ? null : properties.length === 0 ? (
          <div className="account-empty">
            <p>You haven't saved any apartments yet. Use the bookmark on a listing to keep it here.</p>
            <button className="button button-dark" onClick={() => onOpen("/apartments")}>Search apartments</button>
          </div>
        ) : (
          <ul className="saved-list saved-properties">
            {properties.map((p) => (
              <SavedRow key={p.id} image={p.photos?.[0]} title={p.name}
                sub={[p.neighborhood, p.summary?.rent ? `${money(p.summary.rent[0])}+ /mo` : "Price not provided"].filter(Boolean).join(" · ")}
                meta={<><span className={`avail avail-${p.availability}`}>{AVAILABILITY[p.availability]}</span><Freshness checkedAt={p.availabilityCheckedAt} stale={p.availabilityStale} /></>}>
                <button className="link-button" onClick={() => onOpen(`/apartments/${encodeURIComponent(p.id)}`)}>View listing</button>
                <button className="link-button danger" onClick={() => onUnsave("properties", p)}>Remove</button>
              </SavedRow>
            ))}
          </ul>
        )}

        <h2 className="account-h2-gap">Saved locators{savedLoading || savedError ? "" : ` (${locators.length})`}</h2>
        {savedLoading ? <p role="status">Loading your saved locators…</p> : savedError && locators.length === 0 ? null : locators.length === 0 ? (
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
            <PasswordField label="Current password" name="currentPassword" autoComplete="current-password" required />
            <PasswordField label="New password" rules name="password" autoComplete="new-password" minLength={12} maxLength={200} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}" title="Use 12 or more characters with uppercase and lowercase letters, a number, and a symbol." required />
            <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={200} required />
            {passwordState.error && <p className="form-error" role="alert">{passwordState.error}</p>}
            {passwordState.message && <p className="form-ok" role="status">{passwordState.message}</p>}
            <button className="button button-dark" disabled={passwordState.busy} aria-busy={passwordState.busy}>{passwordState.busy ? "Saving…" : "Update password"}</button>
          </form>
        </section>
        <p className="account-note"><Shield size={14} /> Saved searches, named shortlists and email alerts arrive with memberships in a later release.</p>
      </section>
    </main>
  );
}
