import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, MapPin, Search } from "lucide-react";
import { LOCATOR_REPORT_REASONS } from "../shared/catalog.js";
import { api, formatDate } from "./api.js";
import { EmptyState, Link, Photo, ReportForm, SaveButton, go, usePageTitle } from "./ui.jsx";
import { PropertyCard } from "./properties.jsx";

const SPECIALTIES = ["Luxury", "High-rises", "Relocation", "Student housing", "Corporate", "Pet friendly", "First-time renters", "New construction", "Medical professionals", "Families", "Short-term"];

export function LocatorSearchForm({ initial = "", initialSpecialty = "" }) {
  const [q, setQ] = useState(initial); const [specialty, setSpecialty] = useState(initialSpecialty);
  useEffect(() => { setQ(initial); setSpecialty(initialSpecialty); }, [initial, initialSpecialty]);
  return (
    <form className="search-panel locator-search-panel" role="search" onSubmit={(e) => {
      e.preventDefault();
      const p = new URLSearchParams(window.location.pathname === "/locators" ? window.location.search : "");
      q.trim() ? p.set("q", q.trim()) : p.delete("q");
      specialty ? p.set("specialty", specialty) : p.delete("specialty");
      go(`/locators${p.size ? `?${p}` : ""}`);
    }}>
      <label className="search-field location-field"><span className="field-label">Neighborhood, city or ZIP</span>
        <span className="input-wrap"><MapPin size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="The Heights, Houston or 77380" /></span>
      </label>
      <label className="search-field"><span className="field-label">Specialty</span>
        <span className="select-wrap"><select value={specialty} onChange={(e) => setSpecialty(e.target.value)}><option value="">All specialties</option>{SPECIALTIES.map((s) => <option key={s}>{s}</option>)}</select></span>
      </label>
      <button className="button button-dark search-button" type="submit"><Search size={17} /> Search locators</button>
    </form>
  );
}

export function LocatorCard({ locator, saved, onSave }) {
  const href = `/locators/${encodeURIComponent(locator.id)}`;
  return (
    <article className="locator-card">
      <div className="card-photo-wrap">
        <Photo src={locator.image} alt={locator.name ? `${locator.name}` : "Locator"} className="card-photo" />
        <SaveButton saved={saved} onClick={() => onSave(locator)} label={locator.name} />
      </div>
      <div className="card-body">
        {locator.source === "Sample data" && <span className="sample-note">Sample profile</span>}
        <h3>{locator.name || "Name not provided"}</h3>
        <p className="company-name">{locator.company || "Company not provided"}</p>
        <div className="card-location"><MapPin size={14} /><span>{locator.serviceAreas?.slice(0, 3).join(", ") || locator.area || "Area not provided"}</span></div>
        <div className="tag-row">{(locator.tags || []).slice(0, 3).map((t) => <span className="tag" key={t}>{t}</span>)}</div>
        <p className="card-bio">{locator.about || "About information not provided."}</p>
        <Link className="button card-cta" href={href}>View profile <ArrowRight size={15} /></Link>
      </div>
    </article>
  );
}

export function LocatorsPage({ search, isSaved, onSave }) {
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const q = params.get("q") || "", specialty = params.get("specialty") || "", sort = params.get("sort") || "name";
  const [state, setState] = useState({ status: "loading", items: [], error: "" });
  usePageTitle("Houston apartment locators");
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, status: "loading" }));
    api.locators({ q, specialty, sort }).then((r) => live && setState({ status: "ready", items: r.locators, error: "" }))
      .catch((e) => live && setState({ status: "error", items: [], error: e.message }));
    return () => { live = false; };
  }, [q, specialty, sort]);
  return (
    <main className="directory page-shell route-page">
      <div className="section-heading"><div><div className="eyebrow">MEET YOUR LOCAL EXPERTS</div><h1>Houston apartment locators</h1>
        <p className="lede">Locators know which buildings have openings, current specials and the trade-offs between neighborhoods. Their help is usually free to renters.</p></div></div>
      <LocatorSearchForm initial={q} initialSpecialty={specialty} />
      <div className="results-bar">
        <p className="results-count">{state.status === "ready" ? `${state.items.length} locator${state.items.length === 1 ? "" : "s"}` : ""}</p>
        <label className="sort-inline"><span>Sort by</span>
          <select value={sort} onChange={(e) => { const p = new URLSearchParams(search); e.target.value === "name" ? p.delete("sort") : p.set("sort", e.target.value); go(`/locators${p.size ? `?${p}` : ""}`, { keepScroll: true }); }}>
            <option value="name">Name</option><option value="experience">Most experienced</option>
          </select>
        </label>
      </div>
      {state.status === "loading" ? <p role="status">Loading locators…</p>
        : state.status === "error" ? <EmptyState title="Directory unavailable" action={<button className="button" onClick={() => window.location.reload()}>Try again</button>}>{state.error}</EmptyState>
        : state.items.length ? <div className="locator-grid">{state.items.map((l) => <LocatorCard key={l.id} locator={l} saved={isSaved(l.id)} onSave={onSave} />)}</div>
        : <EmptyState title="No locators found" action={<Link className="button button-dark" href="/locators">Clear search</Link>}>Try a different neighborhood, ZIP code or specialty.</EmptyState>}
    </main>
  );
}

export function LocatorProfilePage({ id, isSaved, onSave, isPropertySaved, onSaveProperty }) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    api.locator(id).then((r) => live && setState({ status: "ready", ...r }))
      .catch((e) => live && setState({ status: e.status === 404 ? "missing" : "error", error: e.message }));
    return () => { live = false; };
  }, [id]);
  usePageTitle(state.locator?.name || "Locator profile");
  if (state.status === "loading") return <main className="page-shell route-page"><p role="status">Loading profile…</p></main>;
  if (state.status !== "ready") return (
    <main className="page-shell route-page">
      <EmptyState title="This profile isn’t available" action={<Link className="button button-dark" href="/locators">Back to the directory</Link>}>
        {state.status === "error" ? state.error : "It may have been removed or the link may be incorrect."}
      </EmptyState>
    </main>
  );
  const { locator: profile, properties = [] } = state;
  const row = (label, value) => <p><strong>{label}:</strong> {value || "Not provided"}</p>;
  return (
    <main className="page-shell route-page">
      <article className="profile-page">
        <Link href="/locators" className="text-link back-link"><ArrowLeft size={14} /> Back to locators</Link>
        <div className="profile-page-grid">
          <Photo src={profile.image} alt={profile.name || "Locator profile"} className="profile-page-photo" />
          <div>
            <div className="eyebrow">HOUSTON APARTMENT LOCATOR</div>
            <div className="profile-title-row"><h1>{profile.name || "Name not provided"}</h1><SaveButton saved={isSaved(profile.id)} onClick={() => onSave(profile)} label={profile.name} className="button save-wide" /></div>
            {profile.source === "Sample data" && <p className="sample-banner">Sample profile for the FindIt beta. This is not a real person.</p>}
            <p className="company-name">{profile.company || "Company not provided"}</p>
            <p>{profile.about || "About information not provided."}</p>
            {row("Main area", profile.area)}
            {row("Areas served", profile.serviceAreas?.join(", "))}
            {row("ZIP codes", profile.zipCodes?.join(", "))}
            {row("Specialties", profile.tags?.join(", "))}
            {row("Languages", profile.languages?.join(", "))}
            {row("Experience", profile.years != null ? `${profile.years} year${profile.years === 1 ? "" : "s"}` : "")}
            {row("Typical response", profile.response)}
            <p><strong>Contact:</strong> {profile.contactEmail || profile.contactPhone ? <>{profile.contactEmail && <a href={`mailto:${profile.contactEmail}`}>{profile.contactEmail}</a>}{profile.contactEmail && profile.contactPhone ? " · " : ""}{profile.contactPhone && <a href={`tel:${profile.contactPhone.replace(/[^\d+]/g, "")}`}>{profile.contactPhone}</a>}</> : "Not provided"}</p>
            <p className="provenance">Source: <strong>{profile.source || "Not stated"}</strong> · Last updated {formatDate(profile.lastUpdated)}</p>
            {profile.listingsUrl ? <a className="button button-dark" href={profile.listingsUrl} target="_blank" rel="noopener noreferrer">View their listings <ExternalLink size={15} /></a> : <p>Listings link: Not provided</p>}
            <ReportForm reasons={LOCATOR_REPORT_REASONS} onSubmit={(b) => api.report(profile.id, b)} label="Report a problem with this profile" />
          </div>
        </div>
        {properties.length > 0 && (
          <section className="profile-listings-section">
            <h2>Apartments {profile.name.split(" ")[0]} works with on FindIt</h2>
            <div className="prop-grid">{properties.map((p) => <PropertyCard key={p.id} property={p} saved={isPropertySaved(p.id)} onSave={onSaveProperty} />)}</div>
          </section>
        )}
      </article>
    </main>
  );
}
