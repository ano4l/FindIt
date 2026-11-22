import React, { useEffect, useState } from "react";
import { ArrowRight, Bookmark, House, MapPin, Menu, X } from "lucide-react";
import { AVAILABILITY, bedsLabel, money } from "../shared/catalog.js";

/* ------------------------------------------------------------ Routing */
export const pathNow = () => window.location.pathname;
export function go(url, { replace = false, keepScroll = false } = {}) {
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  if (!keepScroll) window.scrollTo(0, 0);
}
export function Link({ href, children, onClick, ...props }) {
  return (
    <a href={href} {...props} onClick={(e) => {
      onClick?.(e);
      if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); go(href); }
    }}>{children}</a>
  );
}
export function usePageTitle(title) {
  useEffect(() => { document.title = title ? `${title} · FindIt HTX` : "FindIt HTX · Houston apartments and locators"; }, [title]);
}
// Small wrapper so private browsing or blocked storage never breaks a page.
export const session = {
  get: (k) => { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { window.sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};

/* ------------------------------------------------------------- Layout */
const NAV = [["Apartments", "/apartments"], ["Locators", "/locators"], ["How it works", "/how-it-works"], ["For owners", "/for-owners"], ["Pricing", "/pricing"], ["Contact", "/contact"]];

function Header({ user, count, signOut, route }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link className="brand" href="/" aria-label="FindIt HTX home"><span className="brand-mark"><House size={21} strokeWidth={3} /></span><span>FINDIT<span className="brand-period">.</span></span><span className="brand-city">HTX</span></Link>
        <nav className={`main-nav ${open ? "is-open" : ""}`} aria-label="Main navigation">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className={route === href || route.startsWith(`${href}/`) ? "nav-active" : undefined} aria-current={route === href ? "page" : undefined}>{label}</Link>
          ))}
          {user && <button type="button" className="nav-mobile-only" onClick={signOut}>Log out</button>}
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              <Link className="nav-login" href={user.role === "staff" ? "/staff" : "/account"}>{user.role === "staff" ? "Staff console" : `Saved (${count})`}</Link>
              <button className="button button-dark nav-join nav-logout" onClick={signOut}>Log out</button>
            </>
          ) : (
            <>
              <Link className="nav-login" href="/signin">Log in</Link>
              <Link className="button button-dark nav-join" href="/signup">Join FindIt <ArrowRight size={15} /></Link>
            </>
          )}
        </div>
        <button className="mobile-menu-button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
    </header>
  );
}

function Footer({ user }) {
  return (
    <footer className="site-footer">
      <div className="page-shell footer-main">
        <div className="footer-brand-col">
          <Link className="brand brand-light" href="/"><span className="brand-mark"><House size={21} /></span><span>FINDIT<span className="brand-period">.</span></span><span className="brand-city">HTX</span></Link>
          <p>Houston apartments and the local experts who know them. Private beta.</p>
          <span className="footer-location"><MapPin size={14} /> Houston, Texas</span>
        </div>
        <div className="footer-column"><strong>EXPLORE</strong><Link href="/apartments">Apartments</Link><Link href="/locators">Locators</Link><Link href="/how-it-works">How it works</Link><Link href="/pricing">Pricing</Link></div>
        <div className="footer-column"><strong>PARTNERS</strong><Link href="/for-owners">Owners &amp; managers</Link><Link href="/for-locators">Locators &amp; realtors</Link><Link href="/contact">Contact</Link></div>
        <div className="footer-column"><strong>ACCOUNT</strong>{user ? <>{user.role === "staff" && <Link href="/staff">Staff console</Link>}<Link href="/account">My account</Link></> : <><Link href="/signin">Log in</Link><Link href="/signup">Join FindIt</Link></>}<Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
      </div>
      <div className="page-shell footer-bottom"><span>© 2026 FindIt HTX</span><span>Listing details come from properties and partners. Always confirm with the property before you sign.</span></div>
    </footer>
  );
}

export function Shell({ children, user, count, signOut, route, notice = "" }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Header user={user} count={count} signOut={signOut} route={route} />
      <div id="main" tabIndex={-1}>{children}</div>
      <Footer user={user} />
      {notice && <p className="app-toast" role="alert">{notice}</p>}
    </>
  );
}

// Catches an unexpected error while drawing a page, so the visitor gets a message and a way back
// instead of a blank screen.
export class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page-shell route-page">
        <div className="empty-state">
          <h2>Something went wrong on this page</h2>
          <p>Reloading usually fixes it. If it keeps happening, please tell us through the contact page.</p>
          <button className="button button-dark" onClick={() => window.location.reload()}>Reload the page</button>{" "}
          <a className="button" href="/">Go to the home page</a>
        </div>
      </main>
    );
  }
}

/* --------------------------------------------------------- Components */
export function Photo({ src, alt, className = "", label = "Photo not provided" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className={`${className} photo-unknown`} role="img" aria-label={src ? "Photo unavailable" : label}>{src ? "Photo unavailable" : label}</div>;
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function AvailabilityBadge({ value, className = "" }) {
  return <span className={`avail avail-${value} ${className}`}>{AVAILABILITY[value] || AVAILABILITY.unknown}</span>;
}

export function SaveButton({ saved, onClick, label, className = "save-button" }) {
  return (
    <button type="button" className={`${className} ${saved ? "is-saved" : ""}`} onClick={onClick} aria-pressed={saved} aria-label={saved ? `Remove ${label} from saved` : `Save ${label}`}>
      <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
      {className !== "save-button" && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}

export function ReportForm({ reasons, onSubmit, label = "Report a problem with this listing" }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (done) return <div className="report-box"><p className="form-ok" role="status">{done}</p></div>;
  if (!open) return <div className="report-box"><button className="link-button" onClick={() => setOpen(true)}>{label}</button></div>;
  return (
    <div className="report-box">
      <form className="report-form" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError("");
        const f = new FormData(e.currentTarget);
        try { const r = await onSubmit({ reason: f.get("reason"), details: f.get("details") }); setDone(r.message); }
        catch (x) { setError(x.message); }
        finally { setBusy(false); }
      }}>
        <label>What’s wrong?<select name="reason" required>{reasons.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Details (optional)<textarea name="details" rows="3" maxLength="1000" placeholder="For example: the rent shown is $100 lower than the property quoted me." /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="report-actions">
          <button type="button" className="link-button" onClick={() => setOpen(false)}>Cancel</button>
          <button className="button button-dark" disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
        </div>
      </form>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return <div className="empty-state"><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}

/* ------------------------------------------------------- Text helpers */
const range = (r, fmt, sep = " – ") => (!r ? "" : r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])}${sep}${fmt(r[1])}`);
export const priceText = (p) => {
  if (p.match?.rentFrom != null) return `From ${money(p.match.rentFrom)}`;
  return p.summary.rent ? range(p.summary.rent, money) : "Price not provided";
};
export const bedsText = (s) => (s.beds ? (s.beds[0] === s.beds[1] ? bedsLabel(s.beds[0]) : `${bedsLabel(s.beds[0])} – ${s.beds[1]} bd`) : "Beds not provided");
export const bathsText = (s) => (s.baths ? `${range(s.baths, String, "–")} ba` : "Baths not provided");
export const sqftText = (s) => (s.sqft ? `${range(s.sqft, (n) => n.toLocaleString("en-US"), "–")} sq ft` : "Size not provided");
