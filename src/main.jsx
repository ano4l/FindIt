import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthScreen, MemberAccount } from "./account.jsx";
import { StaffConsole } from "./staff.jsx";
import { api } from "./api.js";
import { ErrorBoundary, Link, Shell, go, pathNow, usePageTitle } from "./ui.jsx";
import { ApartmentsPage, PropertyPage } from "./properties.jsx";
import { LocatorProfilePage, LocatorsPage } from "./locators.jsx";
import {
  ContactPage, ForLocatorsPage, ForOwnersPage, HomePage, HowItWorksPage, NotFoundPage, PricingPage, PrivacyPage, TermsPage,
} from "./pages.jsx";
import "./styles.css";
import "./account.css";
import "./findit.css";

const INFO_PAGES = {
  "/how-it-works": HowItWorksPage, "/for-owners": ForOwnersPage, "/for-locators": ForLocatorsPage,
  "/pricing": PricingPage, "/privacy": PrivacyPage, "/terms": TermsPage,
};
const AUTH_ROUTES = { "/signin": "signin", "/signup": "signup", "/forgot-password": "forgot", "/reset-password": "reset", "/verify-email": "verify", "/resend-confirmation": "resend" };
const AUTH_PATHS = { forgot: "/forgot-password", resend: "/resend-confirmation" };
const EMPTY_SAVED = { locators: [], properties: [] };

function App() {
  const [route, setRoute] = useState(pathNow());
  const [search, setSearch] = useState(window.location.search);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [saved, setSaved] = useState(EMPTY_SAVED);
  const [savedError, setSavedError] = useState("");
  const [savedLoading, setSavedLoading] = useState(false);
  const [notice, setNotice] = useState("");
  // A short message at the bottom of the screen that clears itself.
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(t); }, [notice]);

  useEffect(() => {
    const pop = () => { setRoute(pathNow()); setSearch(window.location.search); };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => { api.me().then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setAuthReady(true)); }, []);
  useEffect(() => {
    if (!user) { setSaved(EMPTY_SAVED); setSavedError(""); setSavedLoading(false); return; }
    setSavedError(""); setSavedLoading(true);
    api.favourites().then((r) => setSaved({ locators: r.locators || [], properties: r.properties || [] })).catch((e) => setSavedError(e.message)).finally(() => setSavedLoading(false));
  }, [user]);

  // Optimistic save/unsave with rollback if the request fails.
  const toggleSave = useCallback(async (kind, item) => {
    if (!user) { go(`/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    const found = saved[kind].some((x) => x.id === item.id);
    const apply = (remove) => setSaved((s) => ({ ...s, [kind]: remove ? s[kind].filter((x) => x.id !== item.id) : [item, ...s[kind].filter((x) => x.id !== item.id)] }));
    apply(found);
    try { await (found ? api.unsave(kind, item.id) : api.save(kind, item.id)); }
    catch (e) {
      // Put the bookmark back the way it was and say why, rather than silently flipping it.
      apply(!found);
      if (e.status === 401) { setUser(null); setNotice("Your session has ended. Please sign in again to save places."); }
      else setNotice(`We couldn’t ${found ? "remove that from" : "add that to"} your saved list. ${e.message}`);
    }
  }, [user, saved]);
  const isSaved = (kind) => (id) => saved[kind].some((x) => x.id === id);
  const saveProperty = (p) => toggleSave("properties", p);
  const saveLocator = (l) => toggleSave("locators", l);
  const signOut = async () => { try { await api.logout(); } catch { /* already signed out */ } setUser(null); go("/"); };

  const params = new URLSearchParams(search);
  const privateRoute = route === "/account" || route === "/staff";
  useEffect(() => { if (authReady && privateRoute && !user) go(`/signin?next=${encodeURIComponent(route)}`, { replace: true }); }, [route, authReady, user, privateRoute]);
  if (privateRoute && !authReady) return <main className="page-shell route-page"><p role="status">Checking your account…</p></main>;
  if (privateRoute && !user) return null;

  const legacyAuth = route === "/" && (params.has("verify") || params.has("reset"));
  if (AUTH_ROUTES[route] || legacyAuth) {
    const mode = AUTH_ROUTES[route] || (params.has("reset") ? "reset" : "verify");
    const token = params.get("token") || params.get("reset") || params.get("verify");
    const next = params.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    return <AuthScreen key={`${mode}-${token || ""}`} mode={mode} token={token}
      onMode={(m) => go(AUTH_PATHS[m] || `/${m}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`)}
      onHome={() => go("/")}
      onSignedIn={(u) => { setUser(u); go(safeNext || (u.role === "staff" ? "/staff" : "/account")); }} />;
  }
  if (route === "/account") return <MemberAccount user={user} saved={saved} savedError={savedError} savedLoading={savedLoading}
    onUnsave={(kind, item) => toggleSave(kind, item)} onOpen={go} onHome={() => go("/")} onSignOut={signOut} />;
  if (route === "/staff" && user.role === "staff") return <StaffConsole user={user} onHome={() => go("/")} onSignOut={signOut} />;

  const shell = (page) => <Shell user={user} count={saved.locators.length + saved.properties.length} signOut={signOut} route={route} notice={notice}>{page}</Shell>;
  const propertyMatch = route.match(/^\/apartments\/([^/]+)\/?$/);
  const locatorMatch = route.match(/^\/locators\/([^/]+)\/?$/);

  if (route === "/staff") return shell(<StaffOnly />);
  if (route === "/") return shell(<HomePage isSaved={isSaved("properties")} onSave={saveProperty} isLocatorSaved={isSaved("locators")} onSaveLocator={saveLocator} />);
  if (route === "/apartments" || route === "/apartments/") return shell(<ApartmentsPage search={search} isSaved={isSaved("properties")} onSave={saveProperty} />);
  if (propertyMatch) return shell(<PropertyPage id={decodeURIComponent(propertyMatch[1])} isSaved={isSaved("properties")} onSave={saveProperty} user={user} />);
  if (route === "/locators" || route === "/locators/") return shell(<LocatorsPage search={search} isSaved={isSaved("locators")} onSave={saveLocator} />);
  if (locatorMatch) return shell(<LocatorProfilePage id={decodeURIComponent(locatorMatch[1])} isSaved={isSaved("locators")} onSave={saveLocator} isPropertySaved={isSaved("properties")} onSaveProperty={saveProperty} />);
  if (route === "/contact") return shell(<ContactPage search={search} />);
  const Info = INFO_PAGES[route];
  if (Info) return shell(<Info />);
  return shell(<NotFoundPage />);
}

function StaffOnly() {
  usePageTitle("Staff only");
  return <main className="page-shell route-page empty-state"><h1>Staff only</h1><p>This area is for FindIt staff.</p><Link className="button button-dark" href="/">Return home</Link></main>;
}

// Reuse the root if this module is re-run (e.g. by hot reload in development).
const container = document.getElementById("root");
container.__finditRoot ??= createRoot(container);
container.__finditRoot.render(<ErrorBoundary><App /></ErrorBoundary>);
