import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, House, LogOut, Plus, Shield } from "lucide-react";
import { api, formatDate } from "./api.js";
import "./workspace.css";
import "./account.css";

function Brand({ onHome }) {
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
      .then(() => { window.history.replaceState(null, "", "/"); setNotice("Your email is confirmed. You can sign in now."); setView("signin"); })
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
        window.history.replaceState(null, "", "/");
        setNotice("Password updated. Sign in with your new password."); setView("signin");
      }
    } catch (e) {
      setError(e.message);
      if (e.code === "email_not_verified") setNeedsConfirm(f.email);
    } finally { setBusy(false); }
  }

  const copy = {
    signin: ["WELCOME BACK", "Sign in to FindIt", "Save locators and pick up where you left off."],
    signup: ["CREATE YOUR ACCOUNT", "Join FindIt", "Free to join. We'll email you a link to confirm your address. Enter your first and last name and create a strong password."],
    forgot: ["RESET PASSWORD", "Forgot your password?", "Enter your email and we'll send you a reset link."],
    reset: ["RESET PASSWORD", "Choose a new password", "Use 12 or more characters with uppercase and lowercase letters, a number, and a symbol."],
    verify: ["ONE MOMENT", "Confirming your email", "This only takes a second."],
    notice: ["CHECK YOUR EMAIL", "Check your inbox", ""],
  }[view];

  return (
    <main className="auth-page">
      <header className="workspace-header">
        <Brand onHome={onHome} />
        <button className="workspace-back" onClick={onHome}><ArrowLeft size={15} /> Back to FindIt</button>
      </header>
      <div className="auth-layout">
        <aside className="auth-story">
          <span className="auth-kicker"><span /> HOUSTON, WITH A HUMAN TOUCH</span>
          <h1>Good moves<br /><em>start with good people.</em></h1>
          <p>Find an apartment locator who knows your neighborhood, then go straight to their listings.</p>
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
export function MemberAccount({ user, saved, savedError = "", onUnsave, onOpenProfile, onHome, onSignOut }) {
  const [passwordState, setPasswordState] = useState({ busy: false, error: "", message: "" });
  async function changePassword(event) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    if (values.password !== values.confirmPassword) { setPasswordState({ busy: false, error: "The new passwords do not match.", message: "" }); return; }
    setPasswordState({ busy: true, error: "", message: "" });
    try { const result = await api.changePassword({ currentPassword: values.currentPassword, password: values.password }); form.reset(); setPasswordState({ busy: false, error: "", message: result.message }); }
    catch (error) { setPasswordState({ busy: false, error: error.message, message: "" }); }
  }
  return (
    <main className="account-page">
      <header className="workspace-header">
        <Brand onHome={onHome} />
        <button className="workspace-back" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
      </header>
      <section className="account-main">
        <h1>Hi, {user.name.split(" ")[0]}.</h1>
        <p className="account-sub">Signed in as {user.email}</p>
        {savedError && <p className="form-error" role="alert">Could not load saved locators. {savedError}</p>}
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
        <h2>Saved locators</h2>
        {saved.length === 0 ? (
          <div className="account-empty">
            <p>You haven't saved anyone yet. Use the bookmark on a locator's card to keep them here.</p>
            <button className="button button-dark" onClick={onHome}>Find locators</button>
          </div>
        ) : (
          <ul className="saved-list">
            {saved.map((l) => (
              <li key={l.id}>
                <img src={l.image} alt="" />
                <div>
                  <strong>{l.name}</strong>
                  <span>{l.company} · {l.serviceAreas.join(", ")}</span>
                </div>
                <div className="saved-actions">
                  <button className="link-button" onClick={() => onOpenProfile(l)}>View profile</button>
                  {l.listingsUrl && <a className="link-button" href={l.listingsUrl} target="_blank" rel="noopener noreferrer">Listings <ExternalLink size={12} /></a>}
                  <button className="link-button danger" onClick={() => onUnsave(l.id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="account-note"><Shield size={14} /> Paid memberships, named shortlists and email alerts arrive in a later release.</p>
      </section>
    </main>
  );
}

/* ------------------------------------------------------- Staff console */
const EMPTY = { name: "", company: "", area: "", radius: "", years: "", response: "", tags: "", serviceAreas: "", zipCodes: "", languages: "", contactEmail: "", contactPhone: "", about: "", image: "", listingsUrl: "", source: "", featured: false };
const toForm = (l) => ({ ...EMPTY, ...l, years: l.years ?? "", tags: l.tags.join(", "), serviceAreas: l.serviceAreas.join(", "), zipCodes: l.zipCodes.join(", "), languages: l.languages.join(", ") });

export function StaffConsole({ user, onHome, onSignOut }) {
  const [tab, setTab] = useState("Profiles");
  const [rows, setRows] = useState([]);
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState(null);
  const [editing, setEditing] = useState(null); // null | {id?, form}
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState("all");

  const refresh = () => Promise.all([api.admin.locators(), api.admin.reports("open"), api.admin.summary()])
    .then(([l, r, s]) => { setRows(l.locators); setReports(r.reports); setSummary(s); })
    .catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const run = async (fn, message) => { setError(""); try { await fn(); await refresh(); if (message) flash(message); } catch (e) { setError(e.message); } };

  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  async function save(event) {
    event.preventDefault();
    const { id, form, publish } = editing;
    setError("");
    try {
      if (id) await api.admin.update(id, form); else await api.admin.create({ ...form, publish });
      setEditing(null); await refresh(); flash(id ? "Profile saved." : publish ? "Profile published." : "Profile saved as hidden.");
    } catch (e) { setError(e.message); }
  }
  const field = (name, label, props = {}) => (
    <label key={name}>{label}
      {props.area ? <textarea rows={3} value={editing.form[name]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [name]: e.target.value } })} />
        : <input value={editing.form[name]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [name]: e.target.value } })} {...props} />}
    </label>
  );

  return (
    <main className="staff-page">
      <header className="workspace-header">
        <Brand onHome={onHome} />
        <div className="staff-head-right"><span>{user.email}</span><button className="workspace-back" onClick={onSignOut}><LogOut size={15} /> Sign out</button></div>
      </header>
      <section className="staff-main">
        <h1>Staff console</h1>
        {summary && (
          <div className="staff-metrics">
            <div><strong>{summary.published}</strong><span>Published</span></div>
            <div><strong>{summary.hidden}</strong><span>Hidden</span></div>
            <div><strong>{summary.openReports}</strong><span>Open reports</span></div>
            <div><strong>{summary.members}</strong><span>Members</span></div>
          </div>
        )}
        <div className="staff-tabs" role="tablist">
          {["Profiles", "Reports"].map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t}{t === "Reports" && reports.length ? ` (${reports.length})` : ""}
            </button>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {toast && <p className="form-ok" role="status">{toast}</p>}

        {tab === "Profiles" && !editing && (
          <>
            <div className="staff-toolbar">
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
                <option value="all">All profiles</option><option value="published">Published</option><option value="hidden">Hidden</option>
              </select>
              <button className="button button-dark" onClick={() => setEditing({ form: EMPTY })}><Plus size={15} /> Add profile</button>
            </div>
            {shown.length === 0 ? <p className="account-empty">No profiles match this filter.</p> : (
              <div className="table-wrap">
                <table className="staff-table">
                  <thead><tr><th>Locator</th><th>Status</th><th>Source</th><th>Last updated</th><th>Actions</th></tr></thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.name}</strong><br /><small>{r.company}</small></td>
                        <td><span className={`pill pill-${r.status}`}>{r.status}</span></td>
                        <td>{r.source}</td>
                        <td>{formatDate(r.lastUpdated)}</td>
                        <td className="row-actions">
                          <button onClick={() => setEditing({ id: r.id, form: toForm(r) })}>Edit</button>
                          {r.status === "published"
                            ? <button onClick={() => run(() => api.admin.setStatus(r.id, "hidden"), "Profile hidden.")}>Hide</button>
                            : <button onClick={() => run(() => api.admin.setStatus(r.id, "published"), "Profile published.")}>Publish</button>}
                          <button className="danger" onClick={() => window.confirm(`Remove ${r.name}? They will disappear from the directory and this list.`) && run(() => api.admin.setStatus(r.id, "removed"), "Profile removed.")}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "Profiles" && editing && (
          <form className="staff-form" onSubmit={save}>
            <h2>{editing.id ? "Edit profile" : "Add a locator profile"}</h2>
            <div className="form-grid">
              {field("name", "Name", { required: true, maxLength: 120 })}
              {field("company", "Company or brokerage", { maxLength: 120 })}
              {field("area", "Main area (e.g. Houston, TX)", { maxLength: 120 })}
              {field("radius", "Travel radius (e.g. 20 mi)", { maxLength: 30 })}
              {field("years", "Years of experience", { type: "number", min: 0, max: 80 })}
              {field("response", "Typical response time", { maxLength: 80 })}
              {field("serviceAreas", "Service areas (comma separated)")}
              {field("zipCodes", "ZIP codes (comma separated)")}
              {field("tags", "Specialties (comma separated)")}
              {field("languages", "Languages (comma separated)")}
              {field("contactEmail", "Contact email", { type: "email", maxLength: 320 })}
              {field("contactPhone", "Contact phone", { type: "tel", maxLength: 40 })}
              {field("image", "Photo link (https or /assets path)")}
              {field("listingsUrl", "Link to their listings (https)")}
              {field("source", "Where this information came from", { maxLength: 120 })}
            </div>
            {field("about", "About", { area: true })}
            <label className="check"><input type="checkbox" checked={!!editing.form.featured} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, featured: e.target.checked } })} /> Featured</label>
            <div className="form-actions">
              <button type="button" className="button" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
              {editing.id
                ? <button className="button button-dark" type="submit">Save changes</button>
                : <>
                    <button className="button" type="submit" onClick={() => (editing.publish = false)}>Save as hidden</button>
                    <button className="button button-dark" type="submit" onClick={() => (editing.publish = true)}>Save and publish</button>
                  </>}
            </div>
          </form>
        )}

        {tab === "Reports" && (
          reports.length === 0 ? <p className="account-empty">No open reports. Nice work.</p> : (
            <ul className="report-list">
              {reports.map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>{r.locatorName}</strong> <span className={`pill pill-${r.locatorStatus}`}>{r.locatorStatus}</span>
                    <p>{r.reason}{r.details ? ` — ${r.details}` : ""}</p>
                    <small>{formatDate(r.createdAt)} · {r.reporter || "Visitor"}</small>
                  </div>
                  <div className="row-actions">
                    {r.locatorStatus === "published" && <button onClick={() => run(() => api.admin.setStatus(r.locatorId, "hidden"), "Profile hidden.")}>Hide profile</button>}
                    <button onClick={() => run(() => api.admin.setReport(r.id, "resolved"), "Report resolved.")}>Resolve</button>
                    <button onClick={() => run(() => api.admin.setReport(r.id, "dismissed"), "Report dismissed.")}>Dismiss</button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </main>
  );
}
