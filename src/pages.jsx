import React, { useEffect, useState } from "react";
import { ArrowRight, Bookmark, Building2, CalendarCheck, Check, ChevronDown, ClipboardList, Compass, Flag, Handshake, MapPin, Search, ShieldCheck, Users } from "lucide-react";
import { CONTACT_TOPICS, NEIGHBORHOODS } from "../shared/catalog.js";
import { api } from "./api.js";
import { Link, usePageTitle } from "./ui.jsx";
import { FeaturedApartments, HomeSearch } from "./properties.jsx";
import { LocatorCard } from "./locators.jsx";

/* --------------------------------------------------------------- Home */
export function HomePage({ isSaved, onSave, isLocatorSaved, onSaveLocator }) {
  usePageTitle("");
  const [locators, setLocators] = useState({ status: "loading", items: [] });
  useEffect(() => { api.locators({}).then((r) => setLocators({ status: "ready", items: r.locators.slice(0, 3) })).catch(() => setLocators({ status: "error", items: [] })); }, []);
  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-image" /><div className="hero-overlay" />
        <div className="hero-content page-shell"><div className="hero-copy">
          <div className="eyebrow eyebrow-light">HOUSTON RENTAL APARTMENTS · PRIVATE BETA</div>
          <h1 id="hero-title">Find your next Houston apartment.<br /><em>Know it’s still there.</em></h1>
          <p>Search apartments by neighborhood, ZIP, budget and move-in date. Every listing shows where its details came from and when availability was last checked.</p>
        </div></div>
      </section>
      <section className="search-wrap page-shell" aria-label="Search apartments"><HomeSearch /></section>
      <section className="trust-band"><div className="page-shell trust-inner"><div className="trust-points">
        <div><ShieldCheck /><span><strong>Honest availability</strong><small>See when every listing was last checked</small></span></div>
        <div><MapPin /><span><strong>Houston, block by block</strong><small>Search neighborhoods and ZIP codes</small></span></div>
        <div><Bookmark /><span><strong>Save your favourites</strong><small>Free account, synced to you</small></span></div>
      </div></div></section>

      <section className="directory page-shell">
        <div className="section-heading"><div><div className="eyebrow">FEATURED APARTMENTS</div><h2>Places worth a <em>closer look.</em></h2></div>
          <Link className="text-link" href="/apartments">Browse all apartments <ArrowRight size={14} /></Link></div>
        <FeaturedApartments isSaved={isSaved} onSave={onSave} />
        <div className="neighborhood-links" aria-label="Browse by neighborhood">
          <span>Browse by neighborhood:</span>
          {NEIGHBORHOODS.map((n) => <Link key={n} className="chip" href={`/apartments?q=${encodeURIComponent(n)}`}>{n}</Link>)}
        </div>
      </section>

      <section className="how-strip"><div className="page-shell">
        <div className="eyebrow">HOW FINDIT WORKS</div>
        <div className="how-grid">
          <div><Search /><h3>Search</h3><p>Filter by area, budget, bedrooms, bathrooms, move-in date, pets and amenities.</p></div>
          <div><CalendarCheck /><h3>Check the details</h3><p>Compare floor plans, prices, parking and pet rules — with clear labels when something isn’t known.</p></div>
          <div><Bookmark /><h3>Save favourites</h3><p>Create a free account to keep a list of places you like.</p></div>
          <div><Handshake /><h3>Contact directly</h3><p>Call, email or book a tour with the property, or ask a local locator for help.</p></div>
        </div>
      </div></section>

      <section className="directory page-shell">
        <div className="section-heading"><div><div className="eyebrow">PREFER EXPERT HELP?</div><h2>Meet locators who know <em>Houston.</em></h2></div>
          <Link className="text-link" href="/locators">All locators <ArrowRight size={14} /></Link></div>
        {locators.status === "error" ? <p className="empty-state" role="alert">The locator directory is unavailable right now.</p>
          : locators.items.length ? <div className="locator-grid">{locators.items.map((l) => <LocatorCard key={l.id} locator={l} saved={isLocatorSaved(l.id)} onSave={onSaveLocator} />)}</div>
          : <p className="empty-state">{locators.status === "loading" ? "Loading locators…" : "No locators are listed yet."}</p>}
        <div className="partner-band">
          <div><Building2 /><div><strong>Own or manage apartments?</strong><p>Get your availability in front of Houston renters.</p></div><Link className="button" href="/for-owners">For owners &amp; managers</Link></div>
          <div><Users /><div><strong>Apartment locator or realtor?</strong><p>Be found by renters in the areas you know.</p></div><Link className="button" href="/for-locators">For locators</Link></div>
        </div>
      </section>
    </main>
  );
}

/* --------------------------------------------------------- Info pages */
function InfoPage({ eyebrow = "FINDIT HTX", title, intro, children }) {
  usePageTitle(title);
  return (
    <main className="page-shell route-page info-page">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {intro && <p className="lede">{intro}</p>}
      {children}
    </main>
  );
}
// Each question opens and closes on its own; <details> gives keyboard and screen-reader support for free.
const Faq = ({ items }) => <div className="faq-list info-faq">{items.map(([q, a]) => <details key={q}><summary>{q}<ChevronDown className="faq-chevron" size={18} aria-hidden="true" /></summary><p>{a}</p></details>)}</div>;

export function HowItWorksPage() {
  return (
    <InfoPage eyebrow="HOW IT WORKS" title="How FindIt works" intro="FindIt is a Houston apartment search built around one idea: you should know how current the information is before you rely on it.">
      <ol className="steps-list">
        <li><Search /><div><h2>1. Search apartments</h2><p>Search by neighborhood, city or ZIP code, then narrow results by rent, bedrooms, bathrooms, move-in date, availability, pets and amenities. Sort by price, size or how recently a listing was checked.</p></div></li>
        <li><ClipboardList /><div><h2>2. Read the full listing</h2><p>Each listing shows floor plans, prices, amenities, parking, pet rules, current incentives and how to contact or tour. If a detail hasn’t been provided, we say so instead of guessing.</p></div></li>
        <li><CalendarCheck /><div><h2>3. Check how fresh it is</h2><p>Every listing shows its availability status, where the information came from and when our team last checked it. Listings that haven’t been checked in {14} days are flagged.</p></div></li>
        <li><Bookmark /><div><h2>4. Save your favourites</h2><p>Create a free account to bookmark apartments and locators and come back to them on any device.</p></div></li>
        <li><Handshake /><div><h2>5. Contact the property — or a locator</h2><p>Call, email or book a tour directly. If you’d like help, a local apartment locator can compare options for you, usually at no cost to renters.</p></div></li>
        <li><Flag /><div><h2>Spot something wrong?</h2><p>Use “Report a problem” on any listing or profile. Our team reviews every report and corrects or hides inaccurate information.</p></div></li>
      </ol>
      <h2 className="info-subhead">Questions</h2>
      <Faq items={[
        ["Is FindIt free?", "Yes. Searching, viewing listings and saving favourites are free during the beta. Paid memberships with extra tools are planned for a later release."],
        ["Does FindIt guarantee an apartment is available?", "No. Availability changes quickly. We show the status we were given and when it was last checked, and we flag listings that may be out of date. Always confirm with the property."],
        ["Can I apply, sign a lease or pay rent on FindIt?", "No. FindIt helps you discover apartments and contact the right people. Applications, leases and payments are handled directly by the property."],
        ["Which areas do you cover?", "The beta focuses on rental apartments in the Houston area, including The Heights, Montrose, Midtown, Downtown, the Galleria, the Medical Center and The Woodlands."],
        ["What’s an apartment locator?", "A licensed professional who helps renters find apartments. Locators are typically paid by the property, so their help is usually free to you."],
      ]} />
      <p><Link className="button button-dark" href="/apartments">Search apartments <ArrowRight size={15} /></Link></p>
    </InfoPage>
  );
}

export function ForOwnersPage() {
  return (
    <InfoPage eyebrow="FOR OWNERS & MANAGERS" title="Put your availability in front of Houston renters" intro="FindIt lists rental apartments with clear, current information. During the beta our team adds and updates listings for property owners and managers.">
      <div className="info-columns">
        <section><h2>What we list</h2><ul className="check-points">
          <li><Check size={15} /> Floor plans with beds, baths, size and rent ranges</li>
          <li><Check size={15} /> Availability status and move-in dates</li>
          <li><Check size={15} /> Photos, amenities, parking and pet policy</li>
          <li><Check size={15} /> Current incentives and lease terms</li>
          <li><Check size={15} /> Your leasing contact details and tour link</li>
        </ul></section>
        <section><h2>How to get listed</h2><ol className="numbered">
          <li>Send us your property details using the contact form below.</li>
          <li>Confirm you have permission for us to publish the details and photos.</li>
          <li>We prepare the listing, check it with you and publish it.</li>
          <li>Send updates whenever availability or pricing changes — we record when each change was made and by whom.</li>
        </ol></section>
      </div>
      <section className="info-callout"><h2>Accuracy matters</h2><p>Every listing shows when its availability was last checked and where the information came from. Listings that go unchecked for two weeks are flagged to renters and to our team. Renters can report problems, and we follow up on every report.</p></section>
      <p className="muted">Self-service accounts — so you can update your own listings and submit changes for review — are planned for the next release.</p>
      <p><Link className="button button-dark" href="/contact?topic=List%20or%20update%20a%20property">Contact us about a listing <ArrowRight size={15} /></Link></p>
    </InfoPage>
  );
}

export function ForLocatorsPage() {
  return (
    <InfoPage eyebrow="FOR LOCATORS & REALTORS" title="Be found by renters in the areas you know" intro="FindIt connects Houston renters with apartment locators and realtors. Your profile appears in the locator directory and on apartment listings in the areas you cover.">
      <div className="info-columns">
        <section><h2>Your profile includes</h2><ul className="check-points">
          <li><Check size={15} /> Service areas, ZIP codes and specialties</li>
          <li><Check size={15} /> Languages, experience and typical response time</li>
          <li><Check size={15} /> Contact details and a link to your own listings</li>
          <li><Check size={15} /> A “Prefer expert help?” link on apartments you work with</li>
        </ul></section>
        <section><h2>How it works in the beta</h2><p>Our team creates and maintains locator profiles from information you provide and approve. Renters can save your profile and report anything that looks wrong; every profile shows its source and last-updated date.</p>
          <p className="muted">Self-service profile editing is planned for a later release.</p></section>
      </div>
      <p><Link className="button button-dark" href="/contact?topic=Locator%20profile">Ask about a locator profile <ArrowRight size={15} /></Link></p>
    </InfoPage>
  );
}

export function PricingPage() {
  return (
    <InfoPage eyebrow="EARLY PRICING" title="Free while we’re in beta" intro="FindIt is in private beta. Everything available today is free. No payment details are collected.">
      <div className="pricing-grid">
        <section className="price-card is-current">
          <span className="price-tag">Available now</span>
          <h2>Beta access</h2><p className="price">$0</p>
          <ul className="check-points">
            <li><Check size={15} /> Search Houston apartments with every filter</li>
            <li><Check size={15} /> Full listing details, floor plans and availability</li>
            <li><Check size={15} /> Save favourite apartments and locators</li>
            <li><Check size={15} /> Browse the locator directory</li>
            <li><Check size={15} /> Report problems with listings</li>
          </ul>
          <Link className="button button-dark" href="/signup">Create a free account <ArrowRight size={15} /></Link>
        </section>
        <section className="price-card">
          <span className="price-tag muted-tag">Coming later</span>
          <h2>Memberships</h2><p className="price">To be announced</p>
          <ul className="check-points">
            <li><Check size={15} /> Saved searches and email alerts for new matches</li>
            <li><Check size={15} /> Named shortlists with notes, shareable with clients</li>
            <li><Check size={15} /> An assistant that searches in everyday language</li>
            <li><Check size={15} /> Map view of results</li>
            <li><Check size={15} /> Plans for professional locators and teams</li>
          </ul>
          <p className="muted">Plan names, prices and limits will be confirmed before launch.</p>
        </section>
      </div>
      <p><Link className="text-link" href="/contact">Questions about pricing? Contact us <ArrowRight size={14} /></Link></p>
    </InfoPage>
  );
}

export function ContactPage({ search }) {
  const initialTopic = new URLSearchParams(search).get("topic");
  const [state, setState] = useState({ busy: false, error: "", message: "" });
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setState({ busy: true, error: "", message: "" });
    try { const r = await api.contact(data); form.reset(); setState({ busy: false, error: "", message: r.message }); }
    catch (error) { setState({ busy: false, error: error.message, message: "" }); }
  }
  return (
    <InfoPage eyebrow="CONTACT" title="Contact FindIt" intro="Questions about your account, a listing, or getting your property or locator profile on FindIt? Send our team a message. To correct a specific listing, you can also use “Report a problem” on that page.">
      <form className="contact-form" onSubmit={submit}>
        <label>Your name<input name="name" autoComplete="name" minLength="2" maxLength="80" required /></label>
        <label>Email address<input name="email" type="email" autoComplete="email" maxLength="320" required /></label>
        <label>Topic<select name="topic" defaultValue={CONTACT_TOPICS.includes(initialTopic) ? initialTopic : CONTACT_TOPICS[0]}>{CONTACT_TOPICS.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>How can we help?<textarea name="message" rows="5" minLength="10" maxLength="2000" required /></label>
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
        {state.message && <p className="form-ok" role="status">{state.message}</p>}
        <button className="button button-dark" disabled={state.busy} aria-busy={state.busy}>{state.busy ? "Sending…" : "Send message"} <ArrowRight size={15} /></button>
      </form>
    </InfoPage>
  );
}

export function PrivacyPage() {
  return (
    <InfoPage eyebrow="PRIVACY" title="Privacy" intro="This beta collects as little as it can. This summary will be replaced by a full privacy policy approved before public launch.">
      <div className="prose">
        <h2>What we store</h2>
        <p>Your name, email address and a secure hash of your password (never the password itself). The apartments and locators you save. Reports you send — with your account email if you were signed in. Messages you send through the contact form.</p>
        <h2>Sign-in security</h2>
        <p>Sessions use a secure, http-only cookie. Session, email-confirmation and password-reset tokens are stored only as hashes and expire automatically. Resetting your password signs you out everywhere.</p>
        <h2>What we don’t do</h2>
        <p>We don’t collect payment details, sell your information or use advertising trackers. When you contact a property or locator, you do so directly — we don’t pass your details to them.</p>
        <h2>Questions or requests</h2>
        <p>To ask what we hold about you or to delete your account, <Link className="text-link" href="/contact?topic=Account%20help">contact us</Link>.</p>
      </div>
    </InfoPage>
  );
}

export function TermsPage() {
  return (
    <InfoPage eyebrow="TERMS" title="Terms of use" intro="These beta terms will be replaced by final terms of use approved before public launch.">
      <div className="prose">
        <h2>What FindIt is</h2>
        <p>FindIt helps people discover rental apartments and apartment locators in the Houston area. FindIt does not take applications, sign leases, collect rent or handle any payments.</p>
        <h2>Listing information</h2>
        <p>Listing details are supplied or approved by properties and partners. Prices, availability and incentives change often and may be incomplete or out of date. Each listing shows its source and when it was last checked. Always confirm details directly with the property before you visit, apply or pay anything.</p>
        <h2>Sample content</h2>
        <p>During the beta some listings and profiles are samples, clearly labelled as such. They do not describe real properties or people.</p>
        <h2>Third-party sites</h2>
        <p>Links to property websites, tour booking pages and locators’ own listings open sites we don’t control.</p>
        <h2>Reporting problems</h2>
        <p>If something looks wrong, use “Report a problem”. Our staff review reports and may correct, hide or remove information.</p>
      </div>
    </InfoPage>
  );
}

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <main className="page-shell route-page empty-state">
      <span className="empty-icon" aria-hidden="true"><Compass size={22} /></span>
      <h1>We couldn’t find that page</h1>
      <p>Check the address, or start a new apartment search.</p>
      <Link className="button button-dark" href="/apartments">Search apartments</Link>
    </main>
  );
}
