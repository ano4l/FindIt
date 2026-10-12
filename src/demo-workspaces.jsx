import React, { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, ChevronDown, CircleHelp,
  ClipboardCheck, Clock3, FileText, House, LayoutDashboard, LogOut, MapPin,
  Search, Shield, ShieldCheck, Users, X,
} from "lucide-react";
import "./workspace.css";

const demoNote = "Front-end demo only. No credentials are sent or saved. Session and changes reset when this page reloads.";

function WorkspaceBrand({ onHome, inverse = false }) {
  return <button className={`workspace-brand ${inverse ? "inverse" : ""}`} onClick={onHome} aria-label="Return to Findit marketplace">
    <span className="workspace-brand-mark"><House size={20} strokeWidth={2.7} /></span>
    <span>FINDIT<span>.</span></span><small>HTX</small>
  </button>;
}

export function DemoAuth({ mode, onMode, onHome, onAdmin, onComplete }) {
  const [role, setRole] = useState("locator");
  const isSignup = mode === "signup";
  const handleSubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "");
    const displayName = isSignup ? fullName : (email.split("@")[0] || "Houston").replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    // Only a display name and selected role cross into the in-memory demo portal.
    onComplete({ name: displayName, role });
  };
  return <main className="auth-page">
    <header className="workspace-header"><WorkspaceBrand onHome={onHome} /><button className="workspace-back" onClick={onHome}><ArrowLeft size={15} /> Back to marketplace</button></header>
    <div className="auth-layout">
      <aside className="auth-story">
        <span className="auth-kicker"><span /> HOUSTON, WITH A HUMAN TOUCH</span>
        <h1>{isSignup ? <>Good moves<br /><em>start with good people.</em></> : <>A little closer<br /><em>to your next move.</em></>}</h1>
        <p>{isSignup ? "Create a preview profile to explore the Findit experience for Houston locators and apartment communities." : "Step into a private product preview built around the people who make a move easier."}</p>
        <div className="auth-story-photo" role="img" aria-label="Houston skyline at golden hour" />
        <div className="auth-photo-caption"><MapPin size={15} /> Houston, Texas <span>·</span> Local knowledge, made visible</div>
      </aside>
      <section className="auth-card" aria-labelledby="auth-title">
        <WorkspaceBrand onHome={onHome} />
        <div className="auth-eyebrow">{isSignup ? "YOUR FINDIT PREVIEW" : "WELCOME BACK"}</div>
        <h2 id="auth-title">{isSignup ? "Create your demo profile" : "Sign in to Findit"}</h2>
        <p className="auth-intro">{isSignup ? "Choose how you would use Findit. You can explore the matching demo portal right away." : "Use any valid email and a password of 8 or more characters to enter the demo."}</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup && <label>Full name<input name="name" autoComplete="name" placeholder="e.g. Jordan Brooks" required minLength={2} /></label>}
          <label>Email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required /></label>
          <label>Password<input type="password" name="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder="At least 8 characters" minLength={8} required /></label>
          <label>I'm here as<select value={role} onChange={(event) => setRole(event.target.value)}><option value="locator">Apartment locator</option><option value="community">Apartment community</option></select></label>
          <button className="button button-dark auth-submit" type="submit">{isSignup ? "Create demo profile" : "Enter demo portal"}<ArrowRight size={16} /></button>
        </form>
        <p className="auth-switch">{isSignup ? "Already have a demo profile?" : "New to Findit?"} <button onClick={() => onMode(isSignup ? "signin" : "signup")}>{isSignup ? "Sign in" : "Create a preview profile"}</button></p>
        <div className="demo-boundary"><Shield size={16} /><p><strong>Demo boundary</strong>{demoNote}</p></div>
        <button className="admin-entry" onClick={onAdmin}><span><ShieldCheck size={18} /></span><span><strong>Admin demo access</strong><small>Open the shared fixture console</small></span><ArrowRight size={16} /></button>
      </section>
    </div>
  </main>;
}

const initialLocators = [
  { name: "Alexis Ramirez", company: "Houston Home Finders", area: "The Heights · Midtown · Galleria", status: "Pending review", submitted: "Today, 9:42 AM", type: "Locator" },
  { name: "Marcus Lee", company: "The Apartment Guys", area: "Downtown · Midtown · Galleria", status: "Published", submitted: "Yesterday", type: "Locator" },
  { name: "Brianna Taylor", company: "Key2HTX", area: "The Woodlands · Spring · Katy", status: "Changes requested", submitted: "Oct 08", type: "Locator" },
  { name: "Kyle Anderson", company: "HTX Apartment Advisors", area: "Galleria · Katy · Sugar Land", status: "Pending review", submitted: "Oct 07", type: "Locator" },
  { name: "Sarah Mitchell", company: "Houston Living Co.", area: "The Woodlands · Spring", status: "Published", submitted: "Oct 05", type: "Locator" },
];
const initialCommunities = [
  { name: "The Laurel at River Oaks", company: "Northline Residential", area: "River Oaks", status: "Pending review", submitted: "Today, 8:15 AM", type: "Community" },
  { name: "Bayou Park Landing", company: "Common Ground Living", area: "Museum District", status: "Published", submitted: "Oct 09", type: "Community" },
  { name: "Juniper Heights", company: "Juniper Residential", area: "The Heights", status: "Pending review", submitted: "Oct 08", type: "Community" },
];

export function DemoPortal({ user, onHome, onSignOut }) {
  const [tab, setTab] = useState("Overview");
  const locator = user.role === "locator";
  const tabs = ["Overview", locator ? "My profile" : "Community profile", locator ? "Inquiries" : "Locator network", "Settings"];
  return <main className="portal-page">
    <header className="workspace-header portal-header"><WorkspaceBrand onHome={onHome} /><div className="portal-header-right"><span className="portal-preview-pill"><span /> DEMO SESSION</span><button className="workspace-back" onClick={onSignOut}><LogOut size={15} /> Sign out</button></div></header>
    <div className="portal-frame">
      <aside className="portal-rail"><div className="portal-role"><span className="portal-role-icon">{locator ? <MapPin size={20} /> : <Building2 size={20} />}</span><span><small>DEMO WORKSPACE</small><strong>{locator ? "Locator" : "Community"}</strong></span></div><nav aria-label="Demo portal navigation">{tabs.map((item, index) => <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{index === 0 ? <LayoutDashboard size={17} /> : index === 1 ? <FileText size={17} /> : index === 2 ? <Users size={17} /> : <CircleHelp size={17} />}{item}</button>)}</nav><div className="rail-help"><ShieldCheck size={17} /><p>Preview state only. Edits and actions reset on reload.</p></div></aside>
      <section className="portal-main">
        <div className="workspace-breadcrumb"><button onClick={onHome}>Findit</button><span>/</span><span>{locator ? "Locator portal" : "Community portal"}</span></div>
        <div className="workspace-title-row"><div><span className="auth-kicker"><span /> {locator ? "YOUR LOCAL PRESENCE" : "YOUR HOUSTON COMMUNITY"}</span><h1>{tab === "Overview" ? `Welcome, ${user.name.split(" ")[0]}.` : tab}</h1><p>{tab === "Overview" ? (locator ? "Your profile is ready to take shape. Here's your preview workspace." : "See how your team could discover and connect with Houston locators.") : `Explore the ${tab.toLowerCase()} experience in this local demo.`}</p></div><div className="demo-state-badge"><span className="status-dot" /> Preview account</div></div>
        {tab === "Overview" ? <>
          <div className="portal-demo-alert"><Shield size={17} /><span><strong>Front-end demo session</strong>{demoNote}</span></div>
          <div className="portal-metrics"><article><span>{locator ? "Profile completeness" : "Service locations"}</span><strong>{locator ? "72%" : "3"}</strong><small>{locator ? "Sample profile progress" : "Fictional community coverage"}</small></article><article><span>{locator ? "Profile views" : "Locator introductions"}</span><strong>{locator ? "28" : "12"}</strong><small>Illustrative preview metric</small></article><article><span>{locator ? "Inquiries" : "Active outreach"}</span><strong>{locator ? "4" : "6"}</strong><small>No messages are sent</small></article></div>
          <div className="portal-content-grid"><article className="portal-panel portal-profile-preview"><div className="panel-heading"><div><span className="panel-overline">{locator ? "LOCATOR PROFILE" : "COMMUNITY PROFILE"}</span><h2>{locator ? "Your profile snapshot" : "Your community snapshot"}</h2></div><span className="draft-chip">DRAFT PREVIEW</span></div><div className="profile-snapshot"><span className="snapshot-avatar">{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{user.name}</strong><p>{locator ? "Houston apartment locator" : "Houston apartment community"}</p></div></div><p className="snapshot-copy">{locator ? "Help renters understand the areas you know and the way you work." : "Introduce your community to local professionals and the renters they support."}</p><button className="text-link" onClick={() => setTab(tabs[1])}>Review profile details <ArrowRight size={15} /></button></article><article className="portal-panel portal-next"><span className="panel-overline">NEXT IN YOUR PREVIEW</span><div className="next-item"><span><Check size={16} /></span><div><strong>{locator ? "Choose your service areas" : "Add your leasing contacts"}</strong><small>Example setup step · no data is saved</small></div></div><div className="next-item"><span><Clock3 size={16} /></span><div><strong>{locator ? "Complete your specialties" : "Explore locator profiles"}</strong><small>Try the navigation to see each screen</small></div></div><button className="button button-dark" onClick={() => setTab(tabs[1])}>Continue preview <ArrowRight size={15} /></button></article></div>
        </> : <article className="portal-panel portal-tab-panel"><span className="panel-overline">{tab.toUpperCase()} · DEMO</span><h2>{tab === "Settings" ? "Workspace preferences" : tab.includes("profile") ? "Profile details" : locator ? "Recent renter inquiries" : "Locator network"}</h2><p>{tab === "Settings" ? "Settings here are visual examples. No account data or preferences are stored." : tab.includes("profile") ? "Name, service areas, specialties, and description would be managed here in a live product." : locator ? "Example inquiry activity for the product preview. No messages are available." : "Example local locator directory context for apartment communities."}</p><div className="portal-list-row"><span>{tab.includes("profile") ? user.name : locator ? "Houston renter inquiry" : "Featured locator preview"}</span><span className="draft-chip">SAMPLE DATA</span></div><div className="portal-list-row"><span>{locator ? "Neighborhood discovery request" : "Service area match"}</span><span className="draft-chip">PREVIEW ONLY</span></div></article>}
        <p className="workspace-footnote"><Shield size={14} /> {demoNote}</p>
      </section>
    </div>
  </main>;
}

export function DemoAdmin({ onHome, onExit }) {
  const [section, setSection] = useState("Overview");
  const [locators, setLocators] = useState(initialLocators);
  const [communities, setCommunities] = useState(initialCommunities);
  const [subscriptionPaused, setSubscriptionPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All records");
  const sections = ["Overview", "Locators", "Communities", "Subscriptions", "Review queue"];
  const pending = [...locators, ...communities].filter((item) => item.status === "Pending review").length;
  const visibleRows = useMemo(() => {
    const records = section === "Communities" ? communities : section === "Review queue" ? [...locators, ...communities] : locators;
    return records.filter((record) => (filter === "All records" || record.status === filter) && `${record.name} ${record.company} ${record.area}`.toLowerCase().includes(search.toLowerCase()));
  }, [communities, locators, section, filter, search]);
  const moderate = (kind, name, status) => {
    const setter = kind === "Community" ? setCommunities : setLocators;
    setter((items) => items.map((item) => item.name === name ? { ...item, status } : item));
  };
  const isTable = section === "Locators" || section === "Communities" || section === "Review queue";
  return <main className="admin-page">
    <aside className="admin-sidebar"><WorkspaceBrand onHome={onHome} inverse /><div className="admin-workspace-tag"><ShieldCheck size={15} /><span>OPERATIONS PREVIEW</span></div><nav aria-label="Admin demo navigation">{sections.map((item, index) => <button key={item} className={section === item ? "selected" : ""} onClick={() => { setSection(item); setFilter(item === "Review queue" ? "Pending review" : "All records"); setSearch(""); }}>{index === 0 ? <LayoutDashboard size={17} /> : index === 1 ? <MapPin size={17} /> : index === 2 ? <Building2 size={17} /> : index === 3 ? <FileText size={17} /> : <ClipboardCheck size={17} />}{item}{item === "Review queue" && <span className="admin-nav-count">{pending}</span>}</button>)}</nav><div className="admin-sidebar-bottom"><div className="admin-avatar">FD</div><div><strong>Findit demo</strong><small>Shared sample console</small></div><button onClick={onExit} aria-label="Exit admin demo"><LogOut size={16} /></button></div></aside>
    <section className="admin-main"><header className="admin-topbar"><div className="workspace-breadcrumb"><button onClick={onHome}>Public marketplace</button><span>/</span><strong>Admin demo</strong></div><div className="portal-preview-pill"><span /> FRONT-END DEMO</div></header><div className="admin-content"><div className="admin-title-row"><div><span className="auth-kicker"><span /> FINDIT OPERATIONS</span><h1>{section === "Overview" ? "Good morning, Findit." : section}</h1><p>{section === "Overview" ? "A clear view of the sample marketplace activity." : section === "Review queue" ? "Review fictional profile submissions and try local moderation controls." : `Manage the ${section.toLowerCase()} preview using local-only controls.`}</p></div><button className="workspace-back" onClick={onHome}><ArrowLeft size={15} /> Public site</button></div><div className="admin-demo-alert"><Shield size={17} /><span><strong>Unsecured demo console</strong>{demoNote} Moderation controls only change this browser's temporary sample state.</span></div>
      {section === "Overview" && <><div className="admin-metrics"><article><span>Locator profiles</span><strong>{locators.length}</strong><small><Users size={13} /> fictional profiles in this demo</small></article><article><span>Apartment communities</span><strong>{communities.length}</strong><small><Building2 size={13} /> sample organizations</small></article><article><span>Awaiting review</span><strong>{pending}</strong><small><Clock3 size={13} /> local review queue</small></article><article><span>Active subscriptions</span><strong>{subscriptionPaused ? "0" : "4"}</strong><small><FileText size={13} /> illustrative memberships</small></article></div><div className="admin-overview-grid"><article className="admin-panel"><div className="admin-panel-heading"><div><span className="panel-overline">NEEDS ATTENTION</span><h2>Review queue</h2></div><button className="text-link" onClick={() => setSection("Review queue")}>Open queue <ArrowRight size={15} /></button></div>{[...locators, ...communities].filter((row) => row.status === "Pending review").slice(0, 3).map((row) => <div className="admin-queue-row" key={row.name}><span className="queue-avatar">{row.type === "Community" ? <Building2 size={16} /> : row.name.split(" ").map((v) => v[0]).join("")}</span><span className="queue-name"><strong>{row.name}</strong><small>{row.type} · {row.submitted}</small></span><span className="status-pill pending">Pending review</span></div>)}</article><article className="admin-panel admin-shortcuts"><span className="panel-overline">QUICK ACCESS</span><h2>Go to a workspace</h2>{sections.slice(1).map((item) => <button key={item} onClick={() => { setSection(item); setFilter(item === "Review queue" ? "Pending review" : "All records"); }}><span>{item === "Locators" ? <MapPin size={16} /> : item === "Communities" ? <Building2 size={16} /> : item === "Subscriptions" ? <FileText size={16} /> : <ClipboardCheck size={16} />}</span>{item}<ArrowRight size={15} /></button>)}</article></div></>}
      {isTable && <section className="admin-panel admin-table-panel"><div className="admin-panel-heading"><div><span className="panel-overline">{section === "Review queue" ? "LOCAL MODERATION" : "SAMPLE DIRECTORY"}</span><h2>{section === "Review queue" ? "Pending submissions" : section === "Communities" ? "Community accounts" : "Locator profiles"}</h2></div><span className="sample-table-count">{visibleRows.length} shown</span></div><div className="admin-table-controls"><label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search names, organizations, areas" /></label><label className="admin-filter"><span>Status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All records</option><option>Pending review</option><option>Published</option><option>Changes requested</option></select><ChevronDown size={14} /></label></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>{section === "Communities" ? "COMMUNITY" : "LOCATOR"}</th><th>SERVICE AREAS</th><th>STATUS</th><th>SUBMITTED</th><th>ACTIONS</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.name}><td><strong>{row.name}</strong><small>{row.company}</small></td><td>{row.area}</td><td><span className={`status-pill ${row.status === "Published" ? "published" : row.status === "Pending review" ? "pending" : "changes"}`}>{row.status}</span></td><td>{row.submitted}</td><td><div className="row-actions"><button onClick={() => moderate(row.type, row.name, "Published")} disabled={row.status === "Published"} aria-label={`Approve ${row.name}`} title="Approve in demo">Approve</button><button onClick={() => moderate(row.type, row.name, "Changes requested")} disabled={row.status === "Changes requested"} aria-label={`Request changes for ${row.name}`} title="Request changes in demo">Request edits</button></div></td></tr>)}{!visibleRows.length && <tr><td colSpan="5" className="admin-empty">No sample records match this view. Try another filter.</td></tr>}</tbody></table></div><p className="table-footnote"><Shield size={14} /> These actions only update fictional rows in temporary front-end state.</p></section>}
      {section === "Subscriptions" && <div className="admin-panel subscription-panel"><div className="admin-panel-heading"><div><span className="panel-overline">ILLUSTRATIVE MEMBERSHIPS</span><h2>Subscription overview</h2></div><span className="status-pill changes">No billing connected</span></div><p className="subscription-intro">Sample membership rows to demonstrate the admin view. There is no payment provider or billing data.</p><div className="subscription-summary"><strong>$199 <small>/ year</small></strong><span>Reference price only</span><button className="row-action-main" onClick={() => setSubscriptionPaused((value) => !value)}>{subscriptionPaused ? "Resume demo status" : "Pause demo status"}</button></div>{["Houston Home Finders", "The Apartment Guys", "Key2HTX", "HTX Apartment Advisors"].map((name) => <div className="subscription-row" key={name}><span className="subscription-initial">{name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{name}</strong><small>Locator membership · illustrative</small></span><span className={`status-pill ${subscriptionPaused ? "changes" : "published"}`}>{subscriptionPaused ? "Paused (demo)" : "Active (sample)"}</span><span>Renews · —</span></div>)}</div>}
      <p className="workspace-footnote"><Shield size={14} /> {demoNote}</p></div></section>
  </main>;
}
