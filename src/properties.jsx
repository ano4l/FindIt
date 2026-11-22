import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BedDouble, Bath, Car, Check, ChevronLeft, ChevronRight, CloudOff, ExternalLink, Gift, Mail,
  MapPin, PawPrint, Phone, Ruler, Search, SlidersHorizontal, X, CalendarDays, Globe,
} from "lucide-react";
import { AMENITIES, AVAILABILITY, PETS, PROPERTY_REPORT_REASONS, NEIGHBORHOODS, bedsLabel, money } from "../shared/catalog.js";
import { api, formatDate, formatDay, daysAgo, withQuery } from "./api.js";
import {
  AvailabilityBadge, EmptyState, Freshness, Link, Photo, ReportForm, SaveButton, breakableEmail, go, session, usePageTitle,
  bathsText, bedsText, priceText, sqftText,
} from "./ui.jsx";

const LAST_SEARCH = "findit:lastSearch";
const BEDS = [["", "Any"], ["0", "Studio"], ["1", "1"], ["2", "2"], ["3", "3+"]];
const MIN_RENT = [800, 1000, 1250, 1500, 2000, 2500, 3000];
const MAX_RENT = [1000, 1250, 1500, 1750, 2000, 2500, 3000, 4000, 5000];
const SORTS = [["recommended", "Recommended"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["updated", "Recently confirmed"], ["size", "Largest first"]];
const FILTER_KEYS = ["q", "beds", "baths", "minRent", "maxRent", "moveIn", "availability", "pets", "amenities"];
const todayIso = () => new Date().toISOString().slice(0, 10);

/* --------------------------------------------------------------- Card */
export function PropertyCard({ property: p, saved, onSave }) {
  const href = `/apartments/${encodeURIComponent(p.id)}`;
  return (
    <article className="prop-card">
      <div className="prop-card-photo">
        <Link href={href} tabIndex={-1} aria-hidden="true"><Photo src={p.photos[0]} alt="" className="card-photo" /></Link>
        <AvailabilityBadge value={p.availability} className="prop-card-badge" />
        <SaveButton saved={saved} onClick={() => onSave(p)} label={p.name} />
      </div>
      <div className="prop-card-body">
        {p.source === "Sample data" && <span className="sample-note">Sample listing</span>}
        <div className="prop-card-price">{priceText(p)}{(p.match?.rentFrom != null || p.summary.rent) && <small>/mo</small>}</div>
        <h3><Link href={href}>{p.name}</Link></h3>
        <p className="prop-card-loc"><MapPin size={13} /> {[p.neighborhood, p.zip].filter(Boolean).join(" · ") || "Location not provided"}</p>
        <p className="prop-card-facts"><span>{bedsText(p.summary)}</span><span>{bathsText(p.summary)}</span>{p.summary.sqft && <span>{sqftText(p.summary)}</span>}</p>
        {p.match && <p className="prop-card-match">{p.match.plans} matching floor plan{p.match.plans === 1 ? "" : "s"}</p>}
        {p.incentives && <p className="prop-card-deal"><Gift size={13} /> {p.incentives}</p>}
        <div className="tag-row">{p.amenities.slice(0, 3).map((a) => <span className="tag" key={a}>{a}</span>)}</div>
        <p className="prop-card-updated"><Freshness checkedAt={p.availabilityCheckedAt} stale={p.availabilityStale} /></p>
      </div>
    </article>
  );
}

/* ------------------------------------------------------- Hero search */
export function HomeSearch() {
  const [q, setQ] = useState(""); const [beds, setBeds] = useState(""); const [maxRent, setMaxRent] = useState("");
  return (
    <form className="search-panel prop-search-panel" role="search" onSubmit={(e) => {
      e.preventDefault();
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim()); if (beds) p.set("beds", beds); if (maxRent) p.set("maxRent", maxRent);
      go(withQuery("/apartments", p));
    }}>
      <label className="search-field location-field"><span className="field-label">Neighborhood, city or ZIP</span>
        <span className="input-wrap"><MapPin size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Montrose, Houston or 77008" list="neighborhood-list" /></span>
      </label>
      <datalist id="neighborhood-list">{NEIGHBORHOODS.map((n) => <option key={n} value={n} />)}</datalist>
      <label className="search-field"><span className="field-label">Bedrooms</span>
        <span className="select-wrap"><select value={beds} onChange={(e) => setBeds(e.target.value)}>{BEDS.map(([v, l]) => <option key={v} value={v}>{v === "" ? "Any bedrooms" : v === "0" ? "Studio" : `${l} bedroom${v === "1" ? "" : "s"}`}</option>)}</select></span>
      </label>
      <label className="search-field"><span className="field-label">Max rent</span>
        <span className="select-wrap"><select value={maxRent} onChange={(e) => setMaxRent(e.target.value)}><option value="">No max</option>{MAX_RENT.map((n) => <option key={n} value={n}>{money(n)}</option>)}</select></span>
      </label>
      <button className="button button-dark search-button" type="submit"><Search size={17} /> Search apartments</button>
    </form>
  );
}

/* ----------------------------------------------------------- Results */
function Filters({ params, set, onClose }) {
  const [q, setQ] = useState(params.get("q") || "");
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setQ(params.get("q") || ""), [params]);
  const amenities = (params.get("amenities") || "").split(",").filter(Boolean);
  const toggleAmenity = (a) => set({ amenities: (amenities.includes(a) ? amenities.filter((x) => x !== a) : [...amenities, a]).join(",") });
  const shown = showAll ? AMENITIES : AMENITIES.slice(0, 8);
  return (
    <form className="filters" onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() }); onClose?.(); }} aria-label="Search filters">
      <div className="filters-head"><h2>Filters</h2>{onClose && <button type="button" className="icon-button" onClick={onClose} aria-label="Close filters"><X size={18} /></button>}</div>
      <label className="filter-field"><span>Location</span>
        <span className="input-wrap"><MapPin size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (params.get("q") || "") && set({ q: q.trim() })} placeholder="Neighborhood, city or ZIP" list="neighborhood-list" /></span>
      </label>
      <datalist id="neighborhood-list">{NEIGHBORHOODS.map((n) => <option key={n} value={n} />)}</datalist>
      <fieldset className="filter-field"><legend>Bedrooms</legend>
        <div className="segmented">{BEDS.map(([v, l]) => <button type="button" key={v} className={(params.get("beds") || "") === v ? "on" : ""} aria-pressed={(params.get("beds") || "") === v} onClick={() => set({ beds: v })}>{l}</button>)}</div>
      </fieldset>
      <label className="filter-field"><span>Bathrooms</span>
        <select value={params.get("baths") || ""} onChange={(e) => set({ baths: e.target.value })}><option value="">Any</option>{["1", "1.5", "2", "3"].map((b) => <option key={b} value={b}>{b}+</option>)}</select>
      </label>
      <div className="filter-row">
        <label className="filter-field"><span>Min rent</span>
          <select value={params.get("minRent") || ""} onChange={(e) => set({ minRent: e.target.value })}><option value="">No min</option>{MIN_RENT.map((n) => <option key={n} value={n}>{money(n)}</option>)}</select>
        </label>
        <label className="filter-field"><span>Max rent</span>
          <select value={params.get("maxRent") || ""} onChange={(e) => set({ maxRent: e.target.value })}><option value="">No max</option>{MAX_RENT.map((n) => <option key={n} value={n}>{money(n)}</option>)}</select>
        </label>
      </div>
      <label className="filter-field"><span>Move in by</span>
        <input type="date" min={todayIso()} value={params.get("moveIn") || ""} onChange={(e) => set({ moveIn: e.target.value })} />
      </label>
      <label className="filter-field"><span>Availability</span>
        <select value={params.get("availability") || ""} onChange={(e) => set({ availability: e.target.value })}>
          <option value="">Any status</option><option value="available">Available now</option><option value="upcoming">Available now or coming soon</option>
        </select>
      </label>
      <label className="filter-field"><span>Pets</span>
        <select value={params.get("pets") || ""} onChange={(e) => set({ pets: e.target.value })}><option value="">Any</option><option value="dogs">Dogs allowed</option><option value="cats">Cats allowed</option></select>
      </label>
      <fieldset className="filter-field"><legend>Amenities</legend>
        <div className="check-list">{shown.map((a) => <label key={a} className="check"><input type="checkbox" checked={amenities.includes(a)} onChange={() => toggleAmenity(a)} /> {a}</label>)}</div>
        <button type="button" className="link-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${AMENITIES.length} amenities`}</button>
      </fieldset>
      {onClose && <button className="button button-dark filters-done" type="submit">Show results</button>}
    </form>
  );
}

const chipLabel = (k, v) => ({
  q: `“${v}”`, beds: v === "0" ? "Studio" : v === "3" ? "3+ bd" : `${v} bd`, baths: `${v}+ ba`, minRent: `Min ${money(Number(v))}`,
  maxRent: `Max ${money(Number(v))}`, moveIn: `Move in by ${formatDay(v)}`, availability: v === "available" ? "Available now" : "Now or soon",
  pets: v === "dogs" ? "Dogs allowed" : "Cats allowed",
}[k] || v);

export function ApartmentsPage({ search, isSaved, onSave }) {
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [state, setState] = useState({ status: "loading", items: [], total: 0, page: 1, error: "" });
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" to repeat the same search
  const [filtersOpen, setFiltersOpen] = useState(false);
  const rawQ = params.get("q");
  // "montrose" reads better as "Montrose"; anything the user capitalised is left alone.
  const q = rawQ && rawQ === rawQ.toLowerCase() ? rawQ.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : rawQ;
  usePageTitle(q ? `Apartments in ${q}` : "Houston apartments");

  useEffect(() => {
    session.set(LAST_SEARCH, search);
    let live = true;
    setMoreError("");
    setState((s) => ({ ...s, status: "loading", error: "" }));
    api.properties(Object.fromEntries(params)).then((r) => live && setState({ status: "ready", items: r.properties, total: r.total, page: 1, error: "" }))
      .catch((e) => live && setState({ status: "error", items: [], total: 0, page: 1, error: e.message }));
    return () => { live = false; };
  }, [search, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    next.delete("page");
    go(withQuery("/apartments", next), { keepScroll: true });
  };
  const loadMore = async () => {
    setMoreBusy(true); setMoreError("");
    try {
      const r = await api.properties({ ...Object.fromEntries(params), page: state.page + 1 });
      setState((s) => ({ ...s, items: [...s.items, ...r.properties], page: r.page }));
    } catch (e) { setMoreError(e.message); }
    finally { setMoreBusy(false); }
  };
  const chips = FILTER_KEYS.flatMap((k) => {
    const v = params.get(k);
    if (!v) return [];
    if (k === "amenities") return v.split(",").filter(Boolean).map((a) => ({ key: `a-${a}`, label: a, clear: () => set({ amenities: v.split(",").filter((x) => x !== a).join(",") }) }));
    return [{ key: k, label: chipLabel(k, v), clear: () => set({ [k]: "" }) }];
  });
  const clearAll = () => go(`/apartments${params.get("sort") ? `?sort=${params.get("sort")}` : ""}`, { keepScroll: true });

  return (
    <main className="page-shell route-page apartments-page">
      <div className="results-head">
        <div>
          <div className="eyebrow">HOUSTON RENTAL APARTMENTS</div>
          <h1>{q ? <>Apartments in <em>{q}</em></> : "Find your next apartment"}</h1>
        </div>
        <button className="button filters-toggle" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={15} /> Filters{chips.length ? ` (${chips.length})` : ""}</button>
      </div>
      <div className="results-layout">
        <aside className={`filters-wrap ${filtersOpen ? "is-open" : ""}`}>
          <Filters params={params} set={set} onClose={filtersOpen ? () => setFiltersOpen(false) : undefined} />
        </aside>
        <section className="results" aria-live="polite" aria-busy={state.status === "loading"}>
          <div className="results-bar">
            <p className="results-count">{state.status === "loading" ? "Searching…" : state.status === "error" ? "" : `${state.total} apartment${state.total === 1 ? "" : "s"} found`}</p>
            <label className="sort-inline"><span>Sort by</span>
              <select value={params.get("sort") || "recommended"} onChange={(e) => set({ sort: e.target.value === "recommended" ? "" : e.target.value })}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
          </div>
          {chips.length > 0 && (
            <div className="chip-row">
              {chips.map((c) => <button key={c.key} className="chip" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>{c.label} <X size={12} /></button>)}
              <button className="link-button" onClick={clearAll}>Clear all</button>
            </div>
          )}
          {state.status === "error" ? (
            <EmptyState icon={<CloudOff size={22} />} title="We couldn’t load apartments" action={<button className="button button-dark" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}>{state.error}</EmptyState>
          ) : state.status === "loading" && !state.items.length ? (
            <div className="prop-grid" aria-hidden="true">{[0, 1, 2].map((i) => <div className="prop-card skeleton" key={i} />)}</div>
          ) : state.items.length === 0 ? (
            <EmptyState title="No apartments match these filters" action={chips.length ? <button className="button button-dark" onClick={clearAll}>Clear all filters</button> : null}>
              {params.get("moveIn") ? "Try a later move-in date, or remove it to see places that may open up. " : ""}
              {params.get("maxRent") || params.get("minRent") ? "Widening your budget may help. " : ""}
              {q ? `We search names, neighborhoods, cities and ZIP codes — check the spelling of “${q}”.` : "Try removing a filter or two."}
            </EmptyState>
          ) : (
            <>
              <div className={`prop-grid ${state.status === "loading" ? "is-refreshing" : ""}`}>{state.items.map((p) => <PropertyCard key={p.id} property={p} saved={isSaved(p.id)} onSave={onSave} />)}</div>
              {state.items.length < state.total && (
                <div className="load-more">
                  {moreError && <p className="form-error" role="alert">We couldn’t load more apartments. {moreError}</p>}
                  <button className="button" onClick={loadMore} disabled={moreBusy} aria-busy={moreBusy}>{moreBusy ? "Loading…" : moreError ? "Try again" : `Show more (${state.total - state.items.length} more)`}</button>
                </div>
              )}
              <p className="results-note">Availability and prices come from properties and partners and can change quickly. Each listing shows when it was last checked.</p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------ Detail */
function planAvailability(plan, availability) {
  if (plan.units === 0) return "None available";
  if (availability === "unavailable" || availability === "waitlist") return "Not available";
  if (plan.availableFrom && plan.availableFrom > todayIso()) return `From ${formatDay(plan.availableFrom)}`;
  // "Now" is only claimed for a plan when staff entered a date or a number of homes for that plan.
  if (availability === "available" && plan.units) return `Now · ${plan.units} home${plan.units === 1 ? "" : "s"}`;
  if (availability === "available" && plan.availableFrom) return "Now";
  return "Ask the property";
}
const planRent = (p) => (p.rentMin == null && p.rentMax == null ? "Not provided" : p.rentMin === p.rentMax || p.rentMax == null ? money(p.rentMin) : p.rentMin == null ? money(p.rentMax) : `${money(p.rentMin)} – ${money(p.rentMax)}`);

function Gallery({ photos, name }) {
  const [i, setI] = useState(0);
  const strip = useRef(null);
  const count = photos.length;
  // Keeps the selected thumbnail in view by scrolling the strip itself, never the page.
  useEffect(() => {
    const row = strip.current, thumb = row?.children[i];
    if (thumb) row.scrollTo({ left: thumb.offsetLeft - (row.clientWidth - thumb.offsetWidth) / 2 });
  }, [i]);
  if (!count) return <div className="gallery"><Photo className="gallery-main" src="" alt="" label="Photos not provided" /></div>;
  const many = count > 1;
  const step = (d) => setI((n) => (n + d + count) % count);
  // Left and right arrow keys change the photo while focus is anywhere in the gallery.
  const onKeyDown = (e) => {
    if (!many || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  };
  return (
    <div className="gallery" role="group" aria-roledescription="carousel" aria-label={`Photos of ${name}`} tabIndex={many ? 0 : undefined} onKeyDown={onKeyDown}>
      <div className="gallery-stage">
        <Photo key={i} className="gallery-main" src={photos[i]} alt={`${name}, photo ${i + 1} of ${count}`} />
        {many && (
          <>
            <button type="button" className="gallery-nav gallery-prev" onClick={() => step(-1)} aria-label="Previous photo"><ChevronLeft size={22} /></button>
            <button type="button" className="gallery-nav gallery-next" onClick={() => step(1)} aria-label="Next photo"><ChevronRight size={22} /></button>
            <span className="gallery-count" aria-hidden="true">{i + 1} / {count}</span>
            <span className="visually-hidden" role="status">Photo {i + 1} of {count}</span>
          </>
        )}
      </div>
      {many && (
        <div className="gallery-thumbs" role="list" ref={strip}>
          {photos.map((src, n) => (
            <button key={src + n} role="listitem" className={n === i ? "on" : ""} onClick={() => setI(n)} aria-label={`Show photo ${n + 1}`} aria-current={n === i}>
              <Photo src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const Fact = ({ icon, label, children }) => <div className="fact">{icon}<div><span>{label}</span><strong>{children}</strong></div></div>;

export function PropertyPage({ id, isSaved, onSave, user }) {
  const [state, setState] = useState({ status: "loading" });
  const isStaff = user?.role === "staff";
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    api.property(id).then((r) => live && setState({ status: "ready", ...r }))
      .catch(async (e) => {
        // Staff can preview a listing that isn't published yet, to check it before renters see it.
        if (e.status === 404 && isStaff) {
          try {
            const r = await api.admin.property(id);
            if (live) setState({ status: "ready", property: r.property, locator: null, preview: true });
            return;
          } catch { /* not a listing staff can see either: show "not available" */ }
        }
        if (live) setState({ status: e.status === 404 ? "missing" : "error", error: e.message });
      });
    return () => { live = false; };
  }, [id, isStaff]);
  usePageTitle(state.property?.name || "Apartment");
  const back = `/apartments${session.get(LAST_SEARCH) || ""}`;

  if (state.status === "loading") return <main className="page-shell route-page"><p role="status">Loading listing…</p></main>;
  if (state.status !== "ready") return (
    <main className="page-shell route-page">
      <EmptyState icon={state.status === "missing" ? undefined : <CloudOff size={22} />} title={state.status === "missing" ? "This listing isn’t available" : "We couldn’t load this listing"} action={<Link className="button button-dark" href={back}>Back to apartments</Link>}>
        {state.status === "missing" ? "It may have been leased, removed or the link may be wrong." : state.error}
      </EmptyState>
    </main>
  );

  const { property: p, locator } = state;
  const s = p.summary;
  const hasContact = p.contactPhone || p.contactEmail || p.websiteUrl || p.tourUrl;
  return (
    <main className={`page-shell route-page property-page ${p.contactPhone || p.tourUrl ? "has-contact-bar" : ""}`}>
      <Link href={back} className="text-link back-link"><ArrowLeft size={14} /> Back to results</Link>
      {state.preview && <p className="sample-banner" role="status">Staff preview. This listing is {p.status}, so renters can’t see it. Publish it from the staff console when it’s ready.</p>}
      {p.source === "Sample data" && <p className="sample-banner">Sample listing for the FindIt beta. This is not a real property — details and photos are illustrative.</p>}
      <div className="property-head">
        <div>
          <AvailabilityBadge value={p.availability} />
          <h1>{p.name}</h1>
          <p className="property-address"><MapPin size={15} /> {[p.address, p.neighborhood, `${p.city || "Houston"}, TX ${p.zip}`.trim()].filter(Boolean).join(" · ")}</p>
        </div>
        {!state.preview && <SaveButton saved={isSaved(p.id)} onClick={() => onSave(p)} label={p.name} className="button save-wide" />}
      </div>
      {(p.contactPhone || p.tourUrl) && (
        <div className="mobile-contact">
          {p.contactPhone && <a className="button" href={`tel:${p.contactPhone.replace(/[^\d+]/g, "")}`}><Phone size={15} /> Call</a>}
          {p.tourUrl && <a className="button button-dark" href={p.tourUrl} target="_blank" rel="noopener noreferrer">Schedule a tour <ExternalLink size={14} /></a>}
        </div>
      )}

      <div className="property-layout">
        <div className="property-main">
          <Gallery photos={p.photos} name={p.name} />

          <section className={`availability-panel ${p.availabilityStale ? "is-stale" : ""}`} aria-labelledby="availability-heading">
            <div className="availability-head">
              <h2 id="availability-heading">Availability</h2>
              <Freshness checkedAt={p.availabilityCheckedAt} stale={p.availabilityStale} lead="Checked" none="Not yet checked" />
            </div>
            <p><AvailabilityBadge value={p.availability} /> {p.availabilityNote}</p>
            <p className="provenance">
              {p.availabilityCheckedAt ? <>Last checked <strong>{formatDate(p.availabilityCheckedAt)}</strong> ({daysAgo(p.availabilityCheckedAt)})</> : "Availability has not been checked yet"}
              {" · "}Source: <strong>{p.source || "Not stated"}</strong>{" · "}Listing updated {formatDate(p.lastUpdated)}
            </p>
            {p.availabilityStale && <p className="stale-warning"><AlertTriangle size={14} /> This hasn’t been checked recently. Confirm availability and price with the property before you visit or apply.</p>}
          </section>

          <div className="facts">
            <Fact icon={<CalendarDays size={18} />} label="Rent">{s.rent ? `${money(s.rent[0])}${s.rent[1] !== s.rent[0] ? ` – ${money(s.rent[1])}` : ""}` : "Not provided"}</Fact>
            <Fact icon={<BedDouble size={18} />} label="Bedrooms">{bedsText(s)}</Fact>
            <Fact icon={<Bath size={18} />} label="Bathrooms">{bathsText(s)}</Fact>
            <Fact icon={<Ruler size={18} />} label="Size">{sqftText(s)}</Fact>
          </div>

          {p.incentives && <p className="deal-callout"><Gift size={16} /> <span><strong>Current incentive:</strong> {p.incentives}</span></p>}

          <section className="property-section" aria-labelledby="plans-heading">
            <h2 id="plans-heading">Floor plans</h2>
            {p.floorPlans.length ? (
              <div className="table-scroll">
                <table className="plans-table">
                  <thead><tr><th>Plan</th><th>Beds</th><th>Baths</th><th>Size</th><th>Rent / month</th><th>Available</th></tr></thead>
                  <tbody>{p.floorPlans.map((plan, n) => (
                    <tr key={n}>
                      <td data-label="Plan"><strong>{plan.name}</strong></td>
                      <td data-label="Beds">{bedsLabel(plan.beds)}</td>
                      <td data-label="Baths">{plan.baths ?? "Not provided"}</td>
                      <td data-label="Size">{plan.sqft ? `${plan.sqft.toLocaleString("en-US")} sq ft` : "Not provided"}</td>
                      <td data-label="Rent">{planRent(plan)}</td>
                      <td data-label="Available">{planAvailability(plan, p.availability)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="muted">Floor plans haven’t been provided for this property.</p>}
          </section>

          {p.description && <section className="property-section"><h2>About this property</h2><p>{p.description}</p></section>}

          <section className="property-section" aria-labelledby="amenities-heading">
            <h2 id="amenities-heading">Amenities</h2>
            {p.amenities.length ? <ul className="amenity-list">{p.amenities.map((a) => <li key={a}><Check size={14} /> {a}</li>)}</ul> : <p className="muted">Amenities haven’t been provided.</p>}
          </section>

          <section className="property-section details-grid" aria-label="Policies">
            <div><h3><PawPrint size={16} /> Pets</h3><p>{PETS[p.pets] || PETS.unknown}{p.petDetails ? `. ${p.petDetails}` : ""}</p></div>
            <div><h3><Car size={16} /> Parking</h3><p>{p.parking || "Not provided"}</p></div>
            <div><h3><CalendarDays size={16} /> Lease terms</h3><p>{p.leaseTerms || "Not provided"}</p></div>
          </section>

          {!state.preview && <ReportForm reasons={PROPERTY_REPORT_REASONS} onSubmit={(b) => api.reportProperty(p.id, b)} />}
        </div>

        <aside className="property-side">
          <div className="contact-card">
            <h2>Contact &amp; tours</h2>
            {p.contactName && <p className="contact-name">{p.contactName}</p>}
            {hasContact ? (
              <ul className="contact-list">
                {p.contactPhone && <li><Phone size={15} /><a href={`tel:${p.contactPhone.replace(/[^\d+]/g, "")}`}>{p.contactPhone}</a></li>}
                {p.contactEmail && <li><Mail size={15} /><a href={`mailto:${p.contactEmail}?subject=${encodeURIComponent(`Enquiry about ${p.name} (via FindIt)`)}`}>{breakableEmail(p.contactEmail)}</a></li>}
                {p.websiteUrl && <li><Globe size={15} /><a href={p.websiteUrl} target="_blank" rel="noopener noreferrer">Property website <ExternalLink size={12} /></a></li>}
              </ul>
            ) : <p className="muted">Contact details haven’t been provided.</p>}
            {p.tourUrl && <a className="button button-dark tour-button" href={p.tourUrl} target="_blank" rel="noopener noreferrer">Schedule a tour <ExternalLink size={14} /></a>}
            <p className="contact-note">FindIt helps you discover apartments. Applications, leases and payments are handled by the property.</p>
          </div>
          {locator && (
            <div className="locator-mini">
              <span className="eyebrow">PREFER EXPERT HELP?</span>
              <div className="locator-mini-row">
                <Photo src={locator.image} alt="" className="locator-mini-photo" label="" />
                <div><strong>{locator.name}</strong><small>{locator.company}</small></div>
              </div>
              <p>Works with renters in {locator.serviceAreas.slice(0, 3).join(", ") || "Houston"}. Locators can help you compare options at no cost to you.</p>
              <Link className="text-link" href={`/locators/${encodeURIComponent(locator.id)}`}>View locator profile <ArrowRight size={13} /></Link>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

/* --------------------------------------------- Featured strip (home) */
export function FeaturedApartments({ isSaved, onSave }) {
  const [state, setState] = useState({ status: "loading", items: [] });
  useEffect(() => {
    api.properties({ pageSize: 3 }).then((r) => setState({ status: "ready", items: r.properties })).catch((e) => setState({ status: "error", items: [], error: e.message }));
  }, []);
  if (state.status === "loading") return <div className="prop-grid" aria-hidden="true">{[0, 1, 2].map((i) => <div className="prop-card skeleton" key={i} />)}</div>;
  if (state.status === "error") return <p className="empty-state" role="alert">Apartments are unavailable right now. {state.error}</p>;
  if (!state.items.length) return <p className="empty-state">No apartments are listed yet. Check back soon.</p>;
  return <div className="prop-grid">{state.items.map((p) => <PropertyCard key={p.id} property={p} saved={isSaved(p.id)} onSave={onSave} />)}</div>;
}

