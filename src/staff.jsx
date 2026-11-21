import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ExternalLink, LogOut, Plus, Trash2, Upload } from "lucide-react";
import { AMENITIES, AVAILABILITY, PETS, isStale, money } from "../shared/catalog.js";
import { api, formatDate, daysAgo } from "./api.js";
import { Brand } from "./account.jsx";
import { Link } from "./ui.jsx";
import "./workspace.css";
import "./account.css";

const TABS = ["Listings", "Locators", "Reports", "Activity"];
const ACTION_LABEL = { created: "Created", edited: "Edited", published: "Published", hid: "Hid", removed: "Removed", availability: "Updated availability", uploaded: "Uploaded", resolved: "Resolved", dismissed: "Dismissed", reopened: "Reopened", admin: "Became admin" };

export function StaffConsole({ user, onHome, onSignOut }) {
  const [tab, setTab] = useState("Listings");
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [reportCount, setReportCount] = useState(0);
  const toastTimer = useRef();
  useEffect(() => { document.title = "Staff console · FindIt HTX"; }, []);
  const refreshSummary = () => api.admin.summary().then((s) => { setSummary(s); setReportCount(s.openReports); }).catch((e) => setError(e.message));
  useEffect(() => { refreshSummary(); }, []);
  const flash = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 3500); };
  // Runs a staff action, then refreshes the counts and shows a confirmation or the error.
  const run = async (fn, message) => {
    setError("");
    try { const r = await fn(); refreshSummary(); if (message) flash(message); return r ?? true; }
    catch (e) { setError(e.message); return null; }
  };
  const ctx = { run, flash, setError };

  return (
    <main className="staff-page">
      <header className="workspace-header">
        <Brand onHome={onHome} />
        <div className="staff-head-right"><span>{user.email}</span><Link className="workspace-back" href="/account">My account</Link><button className="workspace-back" onClick={onSignOut}><LogOut size={15} /> Sign out</button></div>
      </header>
      <section className="staff-main">
        <h1>Staff console</h1>
        {summary && (
          <div className="staff-metrics">
            <button onClick={() => setTab("Listings")}><strong>{summary.listingsPublished}</strong><span>Published listings</span></button>
            <button onClick={() => setTab("Listings")} className={summary.staleListings ? "metric-warn" : ""}><strong>{summary.staleListings}</strong><span>Need availability check</span></button>
            <button onClick={() => setTab("Listings")}><strong>{summary.listingsHidden}</strong><span>Hidden listings</span></button>
            <button onClick={() => setTab("Locators")}><strong>{summary.published}</strong><span>Published locators</span></button>
            <button onClick={() => setTab("Reports")} className={summary.openReports ? "metric-warn" : ""}><strong>{summary.openReports}</strong><span>Open reports</span></button>
            <div><strong>{summary.members}</strong><span>Members</span></div>
          </div>
        )}
        <div className="staff-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setError(""); }}>
              {t}{t === "Reports" && reportCount ? ` (${reportCount})` : ""}
            </button>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {toast && <p className="form-ok staff-toast" role="status">{toast}</p>}
        {tab === "Listings" && <ListingsTab {...ctx} />}
        {tab === "Locators" && <LocatorsTab {...ctx} />}
        {tab === "Reports" && <ReportsTab {...ctx} />}
        {tab === "Activity" && <ActivityTab setError={setError} />}
      </section>
    </main>
  );
}

// Shown when a list can't be loaded, instead of leaving "Loading…" on screen forever.
function LoadFailed({ what, onRetry }) {
  return <p className="account-empty" role="alert">We couldn’t load {what}. <button type="button" className="link-button" onClick={onRetry}>Try again</button></p>;
}

/* ------------------------------------------------------------ Listings */
const staleDays = (p) => (p.availabilityCheckedAt ? Math.floor((Date.now() - new Date(p.availabilityCheckedAt).getTime()) / 86400000) : null);
const needsAttention = (p) => isStale(p.availabilityCheckedAt) || !p.photos.length || !p.summary.rent || !p.floorPlans.length;

function ListingsTab({ run, setError }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); return api.admin.properties().then((r) => setRows(r.properties)).catch((e) => { setFailed(true); setError(e.message); }); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (editing) return <PropertyEditor id={editing === "new" ? null : editing} run={run} onDone={() => { setEditing(null); load(); }} />;
  if (!rows) return failed ? <LoadFailed what="the listings" onRetry={() => { setError(""); load(); }} /> : <p role="status">Loading listings…</p>;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === "all" || (filter === "attention" ? r.status === "published" && needsAttention(r) : r.status === filter))
    && (!needle || `${r.name} ${r.neighborhood} ${r.zip} ${r.address}`.toLowerCase().includes(needle)));
  const act = async (fn, msg) => { if (await run(fn, msg)) load(); };

  return (
    <>
      <div className="staff-toolbar">
        <div className="staff-toolbar-left">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter listings">
            <option value="all">All listings ({rows.length})</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
            <option value="attention">Needs attention</option>
          </select>
          <input type="search" placeholder="Search name, area or ZIP" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search listings" />
        </div>
        <button className="button button-dark" onClick={() => setEditing("new")}><Plus size={15} /> Add listing</button>
      </div>
      {shown.length === 0 ? <p className="account-empty">No listings match.</p> : (
        <div className="table-wrap">
          <table className="staff-table">
            <thead><tr><th>Listing</th><th>Availability</th><th>Status</th><th>Source</th><th>Last updated</th><th>Actions</th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const stale = isStale(r.availabilityCheckedAt);
                const days = staleDays(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong><br /><small>{[r.neighborhood, r.zip].filter(Boolean).join(" · ") || "No location"}</small>
                      <div className="row-flags">
                        {!r.photos.length && <span className="flag">No photos</span>}
                        {!r.floorPlans.length ? <span className="flag">No floor plans</span> : !r.summary.rent && <span className="flag">No prices</span>}
                        {r.summary.rent && <small>{money(r.summary.rent[0])}–{money(r.summary.rent[1])}</small>}
                      </div>
                    </td>
                    <td>
                      <select className="inline-select" value={r.availability} aria-label={`Availability for ${r.name}`}
                        onChange={(e) => act(() => api.admin.setAvailability(r.id, e.target.value), `${r.name}: availability updated.`)}>
                        {Object.entries(AVAILABILITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <small className={`checked ${stale ? "is-stale" : ""}`}>{stale && <AlertTriangle size={12} />} {days == null ? "Never checked" : `Checked ${daysAgo(r.availabilityCheckedAt)}`}</small>
                    </td>
                    <td><span className={`pill pill-${r.status}`}>{r.status}</span></td>
                    <td>{r.source}</td>
                    <td>{formatDate(r.lastUpdated)}{r.updatedBy && <><br /><small>by {r.updatedBy}</small></>}</td>
                    <td className="row-actions">
                      <button onClick={() => setEditing(r.id)}>Edit</button>
                      <button onClick={() => act(() => api.admin.setAvailability(r.id, r.availability), `${r.name}: availability confirmed.`)} title="Record that you've checked availability today">Mark checked</button>
                      {r.status === "published"
                        ? <><a className="row-link" href={`/apartments/${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer">View <ExternalLink size={11} /></a><button onClick={() => act(() => api.admin.setPropertyStatus(r.id, "hidden"), "Listing hidden.")}>Hide</button></>
                        : <><a className="row-link" href={`/apartments/${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer">Preview <ExternalLink size={11} /></a><button onClick={() => act(() => api.admin.setPropertyStatus(r.id, "published"), "Listing published.")}>Publish</button></>}
                      <button className="danger" onClick={() => window.confirm(`Remove ${r.name}? It will disappear from search and this list.`) && act(() => api.admin.setPropertyStatus(r.id, "removed"), "Listing removed.")}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Resizes to at most 2,000 px and re-encodes as JPEG, so uploads stay under the server's 4 MB limit
// (Vercel caps request bodies at 4.5 MB) and location metadata embedded by phones is dropped.
async function preparePhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("choose an image file.");
  if (file.size > 30 * 1024 * 1024) throw new Error("the original is larger than 30 MB.");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("this image format can't be read in this browser. Use a JPEG, PNG or WebP."); }
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // transparent PNGs get a white background
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 3.8 * 1024 * 1024) return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  }
  throw new Error("the photo is still too large after resizing.");
}

const EMPTY_PLAN = { name: "", beds: "1", baths: "1", sqft: "", rentMin: "", rentMax: "", availableFrom: "", units: "" };
const EMPTY_PROPERTY = {
  name: "", address: "", neighborhood: "", city: "Houston", zip: "", description: "", floorPlans: [{ ...EMPTY_PLAN }], amenities: [], photos: [],
  parking: "", pets: "unknown", petDetails: "", incentives: "", leaseTerms: "", contactName: "", contactPhone: "", contactEmail: "",
  websiteUrl: "", tourUrl: "", locatorId: "", availability: "unknown", availabilityNote: "", source: "", featured: false,
};
const untouchedPlan = (p) => p.beds === EMPTY_PLAN.beds && p.baths === EMPTY_PLAN.baths
  && ["name", "sqft", "rentMin", "rentMax", "availableFrom", "units"].every((k) => !String(p[k] ?? "").trim());
const str = (v) => (v == null ? "" : String(v));
const toForm = (p) => ({ ...EMPTY_PROPERTY, ...p, floorPlans: p.floorPlans.map((x) => Object.fromEntries(Object.entries({ ...EMPTY_PLAN, ...x }).map(([k, v]) => [k, str(v)]))) });

function PropertyEditor({ id, run, onDone }) {
  const [form, setForm] = useState(id ? null : EMPTY_PROPERTY);
  const [history, setHistory] = useState([]);
  const [locators, setLocators] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [localError, setLocalError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [confirmAvailability, setConfirmAvailability] = useState(false);
  const publishRef = useRef(false);
  useEffect(() => {
    api.admin.locators().then((r) => setLocators(r.locators)).catch(() => {});
    if (id) api.admin.property(id).then((r) => { setForm(toForm(r.property)); setHistory(r.history); }).catch((e) => setLocalError(e.message));
  }, [id]);
  if (!form) return localError ? <p className="form-error" role="alert">{localError}</p> : <p role="status">Loading listing…</p>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const input = (k, label, props = {}) => <label>{label}<input value={form[k]} onChange={(e) => set(k, e.target.value)} {...props} /></label>;
  const setPlan = (i, k, v) => set("floorPlans", form.floorPlans.map((p, n) => (n === i ? { ...p, [k]: v } : p)));
  const movePhoto = (i, d) => { const ps = [...form.photos]; [ps[i], ps[i + d]] = [ps[i + d], ps[i]]; set("photos", ps); };

  async function upload(files) {
    setLocalError(""); setUploading(true);
    const urls = [];
    for (const file of files) {
      if (form.photos.length + urls.length >= 12) { setLocalError("A listing can have up to 12 photos."); break; }
      try { urls.push((await api.admin.upload(await preparePhoto(file))).url); } catch (e) { setLocalError(`${file.name}: ${e.message}`); }
    }
    setForm((f) => ({ ...f, photos: [...f.photos, ...urls] }));
    setUploading(false);
  }

  async function save(e) {
    e.preventDefault();
    setLocalError(""); setSaveError(""); setBusy(true);
    // The starter row of the floor-plan table is dropped if nothing was typed into it, so a listing never
    // shows "1 bd · 1 ba" that nobody entered.
    const body = { ...form, floorPlans: form.floorPlans.filter((p) => !untouchedPlan(p)), confirmAvailability };
    try {
      await (id ? api.admin.updateProperty(id, body) : api.admin.createProperty({ ...body, publish: publishRef.current }));
    } catch (err) {
      // Shown beside the Save buttons: the form is long, and an error at the top of the page would be off screen.
      setSaveError(err.message); setBusy(false);
      return;
    }
    await run(async () => true, id ? "Listing saved." : publishRef.current ? "Listing published." : "Listing saved as hidden.");
    setBusy(false);
    onDone();
  }
  const addPhotoLink = () => {
    const url = photoUrl.trim();
    if (!url.startsWith("https://")) return;
    if (form.photos.length >= 12) { setLocalError("A listing can have up to 12 photos."); return; }
    set("photos", [...form.photos, url]); setPhotoUrl("");
  };

  return (
    <form className="staff-form property-form" onSubmit={save}>
      <div className="form-title-row"><h2>{id ? `Edit ${form.name || "listing"}` : "Add an apartment listing"}</h2>{id && form.status && <span className={`pill pill-${form.status}`}>{form.status}</span>}</div>
      {localError && <p className="form-error" role="alert">{localError}</p>}

      <fieldset><legend>Property</legend>
        <div className="form-grid">
          {input("name", "Property name *", { required: true, maxLength: 120 })}
          {input("address", "Street address", { maxLength: 160, placeholder: "e.g. 1800 Yale St" })}
          {input("neighborhood", "Neighborhood", { maxLength: 80, list: "staff-neighborhoods" })}
          {input("city", "City", { maxLength: 80 })}
          {input("zip", "ZIP code", { maxLength: 5, pattern: "\\d{5}", title: "5 digits" })}
          <label>Linked locator<select value={form.locatorId} onChange={(e) => set("locatorId", e.target.value)}><option value="">None</option>{locators.map((l) => <option key={l.id} value={l.id}>{l.name}{l.status !== "published" ? ` (${l.status})` : ""}</option>)}</select></label>
        </div>
        <label>Description<textarea rows={3} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
      </fieldset>

      <fieldset><legend>Availability</legend>
        <div className="form-grid">
          <label>Status<select value={form.availability} onChange={(e) => set("availability", e.target.value)}>{Object.entries(AVAILABILITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {input("availabilityNote", "Note shown to renters", { maxLength: 300, placeholder: "e.g. Two homes left; more from March" })}
          {input("source", "Where this information came from", { maxLength: 120, placeholder: "e.g. Leasing office call" })}
        </div>
        {id && <label className="check"><input type="checkbox" checked={confirmAvailability} onChange={(e) => setConfirmAvailability(e.target.checked)} /> I checked availability today (records today as the last check even if nothing changed)</label>}
        {id && form.availabilityCheckedAt && <p className="muted small">Last checked {formatDate(form.availabilityCheckedAt)} ({daysAgo(form.availabilityCheckedAt)}). Changing the status or note records a new check automatically.</p>}
      </fieldset>

      <fieldset><legend>Floor plans</legend>
        <div className="plan-rows">
          <div className="plan-row plan-head" aria-hidden="true"><span>Name</span><span>Beds</span><span>Baths</span><span>Sq ft</span><span>Rent from</span><span>Rent to</span><span>Available from</span><span>Units</span><span /></div>
          {form.floorPlans.map((p, i) => (
            <div className="plan-row" key={i}>
              <input aria-label={`Plan ${i + 1} name`} value={p.name} onChange={(e) => setPlan(i, "name", e.target.value)} placeholder="A1" maxLength={60} />
              <select aria-label={`Plan ${i + 1} bedrooms`} value={p.beds} onChange={(e) => setPlan(i, "beds", e.target.value)}>{[0, 1, 2, 3, 4, 5].map((b) => <option key={b} value={b}>{b === 0 ? "Studio" : b}</option>)}</select>
              <input aria-label={`Plan ${i + 1} bathrooms`} type="number" min="0.5" max="10" step="0.5" value={p.baths} onChange={(e) => setPlan(i, "baths", e.target.value)} />
              <input aria-label={`Plan ${i + 1} square feet`} type="number" min="100" max="20000" value={p.sqft} onChange={(e) => setPlan(i, "sqft", e.target.value)} />
              <input aria-label={`Plan ${i + 1} lowest rent`} type="number" min="100" max="50000" step="1" value={p.rentMin} onChange={(e) => setPlan(i, "rentMin", e.target.value)} placeholder="$" />
              <input aria-label={`Plan ${i + 1} highest rent`} type="number" min="100" max="50000" step="1" value={p.rentMax} onChange={(e) => setPlan(i, "rentMax", e.target.value)} placeholder="$" />
              <input aria-label={`Plan ${i + 1} available from`} type="date" value={p.availableFrom} onChange={(e) => setPlan(i, "availableFrom", e.target.value)} />
              <input aria-label={`Plan ${i + 1} available units`} type="number" min="0" max="2000" value={p.units} onChange={(e) => setPlan(i, "units", e.target.value)} />
              <button type="button" className="icon-button" aria-label={`Remove plan ${i + 1}`} onClick={() => set("floorPlans", form.floorPlans.filter((_, n) => n !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="button" onClick={() => set("floorPlans", [...form.floorPlans, { ...EMPTY_PLAN }])}><Plus size={14} /> Add floor plan</button>
        <p className="muted small">Leave rent, size, date or units blank if unknown — renters will see “Not provided”, or “Ask the property” for availability. Units “0” means none available in that plan. A row left completely empty isn’t saved.</p>
      </fieldset>

      <fieldset><legend>Photos ({form.photos.length}/12)</legend>
        {form.photos.length > 0 && (
          <ul className="photo-manager">
            {form.photos.map((src, i) => (
              <li key={src + i}>
                <img src={src} alt={`Photo ${i + 1}`} />
                {i === 0 && <span className="cover-tag">Cover</span>}
                <div className="photo-tools">
                  <button type="button" disabled={i === 0} onClick={() => movePhoto(i, -1)} aria-label="Move photo earlier"><ArrowUp size={13} /></button>
                  <button type="button" disabled={i === form.photos.length - 1} onClick={() => movePhoto(i, 1)} aria-label="Move photo later"><ArrowDown size={13} /></button>
                  <button type="button" onClick={() => set("photos", form.photos.filter((_, n) => n !== i))} aria-label="Remove photo"><Trash2 size={13} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="photo-add">
          <label className="button upload-button"><Upload size={14} /> {uploading ? "Uploading…" : "Upload photos"}
            <input type="file" accept="image/*" multiple disabled={uploading} onChange={(e) => { upload([...e.target.files]); e.target.value = ""; }} />
          </label>
          <span className="muted small">or add a link:</span>
          {/* Enter adds the link instead of submitting (and closing) the whole listing form. */}
          <input type="url" placeholder="https://…" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} aria-label="Photo link"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhotoLink(); } }} />
          <button type="button" className="button" disabled={!photoUrl.trim().startsWith("https://")} onClick={addPhotoLink}>Add link</button>
        </div>
        <p className="muted small">Only use photos you have permission to publish. Photos are resized to 2,000 px and saved as JPEG, which also removes location data from phone photos.</p>
      </fieldset>

      <fieldset><legend>Amenities</legend>
        <div className="amenity-checks">{AMENITIES.map((a) => (
          <label key={a} className="check"><input type="checkbox" checked={form.amenities.includes(a)} onChange={(e) => set("amenities", e.target.checked ? [...form.amenities, a] : form.amenities.filter((x) => x !== a))} /> {a}</label>
        ))}</div>
      </fieldset>

      <fieldset><legend>Policies &amp; incentives</legend>
        <div className="form-grid">
          <label>Pet policy<select value={form.pets} onChange={(e) => set("pets", e.target.value)}>{Object.entries(PETS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {input("petDetails", "Pet details (fees, limits)", { maxLength: 300 })}
          {input("parking", "Parking", { maxLength: 300, placeholder: "e.g. Garage, one space included" })}
          {input("leaseTerms", "Lease terms", { maxLength: 120, placeholder: "e.g. 6–15 months" })}
          {input("incentives", "Current incentive", { maxLength: 300, placeholder: "e.g. 6 weeks free on 13-month leases" })}
        </div>
      </fieldset>

      <fieldset><legend>Contact &amp; tours</legend>
        <div className="form-grid">
          {input("contactName", "Contact name", { maxLength: 120 })}
          {input("contactPhone", "Phone", { type: "tel", maxLength: 40 })}
          {input("contactEmail", "Email", { type: "email", maxLength: 320 })}
          {input("websiteUrl", "Website (https)", { type: "url", maxLength: 500, pattern: "https://.+", title: "A link starting with https://", placeholder: "https://…" })}
          {input("tourUrl", "Tour booking link (https)", { type: "url", maxLength: 500, pattern: "https://.+", title: "A link starting with https://", placeholder: "https://…" })}
        </div>
        <label className="check"><input type="checkbox" checked={!!form.featured} onChange={(e) => set("featured", e.target.checked)} /> Featured (shown first in recommended results)</label>
      </fieldset>
      <datalist id="staff-neighborhoods">{["The Heights", "Montrose", "Midtown", "Downtown", "EaDo", "Museum District", "Galleria", "Rice Village", "Medical Center", "Memorial", "Energy Corridor", "The Woodlands"].map((n) => <option key={n} value={n} />)}</datalist>

      {saveError && <p className="form-error" role="alert">This listing wasn’t saved. {saveError}</p>}
      <div className="form-actions">
        <button type="button" className="button" onClick={onDone}>Cancel</button>
        {id ? <button className="button button-dark" type="submit" disabled={busy || uploading}>{busy ? "Saving…" : "Save changes"}</button> : (
          <>
            <button className="button" type="submit" disabled={busy || uploading} onClick={() => { publishRef.current = false; }}>Save as hidden</button>
            <button className="button button-dark" type="submit" disabled={busy || uploading} onClick={() => { publishRef.current = true; }}>Save and publish</button>
          </>
        )}
      </div>

      {history.length > 0 && (
        <section className="history"><h3>Change history</h3>
          <ul>{history.map((h, i) => <li key={i}><strong>{ACTION_LABEL[h.action] || h.action}</strong>{h.detail ? ` — ${h.detail}` : ""}<small>{formatDate(h.at)} · {h.by || "Unknown"}</small></li>)}</ul>
        </section>
      )}
    </form>
  );
}

/* ------------------------------------------------------------ Locators */
const EMPTY_LOCATOR = { name: "", company: "", area: "", radius: "", years: "", response: "", tags: "", serviceAreas: "", zipCodes: "", languages: "", contactEmail: "", contactPhone: "", about: "", image: "", listingsUrl: "", source: "", featured: false };
const toLocatorForm = (l) => ({ ...EMPTY_LOCATOR, ...l, years: l.years ?? "", tags: l.tags.join(", "), serviceAreas: l.serviceAreas.join(", "), zipCodes: l.zipCodes.join(", "), languages: l.languages.join(", ") });

function LocatorsTab({ run, setError }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null); // null | {id?, form}
  const publishRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); return api.admin.locators().then((r) => setRows(r.locators)).catch((e) => { setFailed(true); setError(e.message); }); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn, msg) => { if (await run(fn, msg)) load(); };

  async function save(event) {
    event.preventDefault();
    const { id, form } = editing;
    const ok = await run(() => (id ? api.admin.update(id, form) : api.admin.create({ ...form, publish: publishRef.current })),
      id ? "Profile saved." : publishRef.current ? "Profile published." : "Profile saved as hidden.");
    if (ok) { setEditing(null); load(); }
  }
  const field = (name, label, props = {}) => (
    <label key={name}>{label}
      {props.area ? <textarea rows={3} value={editing.form[name]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [name]: e.target.value } })} />
        : <input value={editing.form[name]} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [name]: e.target.value } })} {...props} />}
    </label>
  );

  if (editing) return (
    <form className="staff-form" onSubmit={save}>
      <h2>{editing.id ? "Edit locator profile" : "Add a locator profile"}</h2>
      <div className="form-grid">
        {field("name", "Name *", { required: true, maxLength: 120 })}
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
        {field("image", "Photo link (https, /assets or /uploads path)")}
        {field("listingsUrl", "Link to their listings (https)")}
        {field("source", "Where this information came from", { maxLength: 120 })}
      </div>
      {field("about", "About", { area: true })}
      <label className="check"><input type="checkbox" checked={!!editing.form.featured} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, featured: e.target.checked } })} /> Featured</label>
      <div className="form-actions">
        <button type="button" className="button" onClick={() => { setEditing(null); setError(""); }}>Cancel</button>
        {editing.id ? <button className="button button-dark" type="submit">Save changes</button> : (
          <>
            <button className="button" type="submit" onClick={() => { publishRef.current = false; }}>Save as hidden</button>
            <button className="button button-dark" type="submit" onClick={() => { publishRef.current = true; }}>Save and publish</button>
          </>
        )}
      </div>
    </form>
  );
  if (!rows) return failed ? <LoadFailed what="the locator profiles" onRetry={() => { setError(""); load(); }} /> : <p role="status">Loading profiles…</p>;
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  return (
    <>
      <div className="staff-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
          <option value="all">All profiles ({rows.length})</option><option value="published">Published</option><option value="hidden">Hidden</option>
        </select>
        <button className="button button-dark" onClick={() => setEditing({ form: EMPTY_LOCATOR })}><Plus size={15} /> Add profile</button>
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
                  <td>{formatDate(r.lastUpdated)}{r.updatedBy && <><br /><small>by {r.updatedBy}</small></>}</td>
                  <td className="row-actions">
                    <button onClick={() => setEditing({ id: r.id, form: toLocatorForm(r) })}>Edit</button>
                    {r.status === "published"
                      ? <button onClick={() => act(() => api.admin.setStatus(r.id, "hidden"), "Profile hidden.")}>Hide</button>
                      : <button onClick={() => act(() => api.admin.setStatus(r.id, "published"), "Profile published.")}>Publish</button>}
                    <button className="danger" onClick={() => window.confirm(`Remove ${r.name}? They will disappear from the directory and this list.`) && act(() => api.admin.setStatus(r.id, "removed"), "Profile removed.")}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------- Reports */
function ReportsTab({ run, setError }) {
  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); return api.admin.reports(status).then((r) => setReports(r.reports)).catch((e) => { setFailed(true); setError(e.message); }); };
  useEffect(() => { setReports(null); load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn, msg) => { if (await run(fn, msg)) load(); };
  return (
    <>
      <div className="staff-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Report status"><option value="open">Open</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select>
      </div>
      {!reports ? (failed ? <LoadFailed what="the reports" onRetry={() => { setError(""); load(); }} /> : <p role="status">Loading reports…</p>) : reports.length === 0 ? <p className="account-empty">{status === "open" ? "No open reports. Nice work." : `No ${status} reports.`}</p> : (
        <ul className="report-list">
          {reports.map((r) => {
            const isProperty = r.targetType === "property";
            const hide = () => (isProperty ? api.admin.setPropertyStatus(r.targetId, "hidden") : api.admin.setStatus(r.targetId, "hidden"));
            return (
              <li key={r.id}>
                <div>
                  <span className="report-kind">{isProperty ? "Listing" : "Locator"}</span>{" "}
                  <strong>{r.targetName}</strong> <span className={`pill pill-${r.targetStatus}`}>{r.targetStatus}</span>
                  <p>{r.reason}{r.details ? ` — ${r.details}` : ""}</p>
                  <small>{formatDate(r.createdAt)} · {r.reporter || "Visitor"}{r.resolvedAt ? ` · closed ${formatDate(r.resolvedAt)}` : ""}</small>
                </div>
                <div className="row-actions">
                  {r.targetStatus === "published" && <a className="row-link" href={`/${isProperty ? "apartments" : "locators"}/${encodeURIComponent(r.targetId)}`} target="_blank" rel="noopener noreferrer">View <ExternalLink size={11} /></a>}
                  {r.targetStatus === "published" && <button onClick={() => act(hide, `${isProperty ? "Listing" : "Profile"} hidden.`)}>Hide {isProperty ? "listing" : "profile"}</button>}
                  {status === "open" ? <>
                    <button onClick={() => act(() => api.admin.setReport(r.id, "resolved"), "Report resolved.")}><Check size={12} /> Resolve</button>
                    <button onClick={() => act(() => api.admin.setReport(r.id, "dismissed"), "Report dismissed.")}>Dismiss</button>
                  </> : <button onClick={() => act(() => api.admin.setReport(r.id, "open"), "Report reopened.")}>Reopen</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ------------------------------------------------------------ Activity */
function ActivityTab({ setError }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = () => { setFailed(false); return api.admin.activity().then((r) => setRows(r.activity)).catch((e) => { setFailed(true); setError(e.message); }); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return failed ? <LoadFailed what="the activity log" onRetry={() => { setError(""); load(); }} /> : <p role="status">Loading activity…</p>;
  if (!rows.length) return <p className="account-empty">No staff activity yet.</p>;
  return (
    <div className="table-wrap">
      <table className="staff-table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
        <tbody>{rows.map((a) => (
          <tr key={a.id}>
            <td>{formatDate(a.at)}<br /><small>{new Date(a.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</small></td>
            <td>{a.by || "Unknown"}</td>
            <td>{ACTION_LABEL[a.action] || a.action}</td>
            <td><small>{{ property: "Listing", locator: "Locator", report: "Report", photo: "Photo", account: "Account" }[a.targetType] || a.targetType}</small><br />{a.targetName}</td>
            <td><small>{a.detail}</small></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
