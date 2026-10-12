import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  House,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import "./styles.css";
import { DemoAdmin, DemoAuth, DemoPortal } from "./demo-workspaces.jsx";

const locators = [
  {
    id: "alexis-ramirez",
    name: "Alexis Ramirez",
    zipCodes: ["77002", "77007", "77019"],
    serviceAreas: ["The Heights", "Midtown", "Galleria"],
    company: "Houston Home Finders",
    rating: "5.0",
    reviews: 98,
    area: "Houston, TX",
    radius: "15 mi",
    years: 8,
    response: "Usually replies in 1 hour",
    tags: ["Luxury", "High-rises", "Relocation"],
    about:
      "Helping you find the perfect home at no cost. I specialize in luxury high-rises and new construction across Houston.",
    image: "/assets/portraits/alexis-ramirez.webp",
    verified: false,
    featured: true,
    languages: ["English", "Spanish"],
    fastResponse: true,
  },
  {
    id: "marcus-lee",
    name: "Marcus Lee",
    zipCodes: ["77002", "77006", "77019"],
    serviceAreas: ["Downtown", "Midtown", "Galleria"],
    company: "The Apartment Guys",
    rating: "4.9",
    reviews: 127,
    area: "Houston, TX",
    radius: "25 mi",
    years: 11,
    response: "Usually replies in 2 hours",
    tags: ["Mid-range", "Pet friendly", "Corporate"],
    about:
      "I make apartment hunting simple. Access to exclusive specials and personalized service, always free for you.",
    image: "/assets/portraits/marcus-lee.webp",
    verified: false,
    languages: ["English"],
    fastResponse: false,
  },
  {
    id: "brianna-taylor",
    name: "Brianna Taylor",
    zipCodes: ["77380", "77381", "77389"],
    serviceAreas: ["The Woodlands", "Spring", "Katy"],
    company: "Key2HTX",
    rating: "5.0",
    reviews: 86,
    area: "Houston, TX",
    radius: "20 mi",
    years: 6,
    response: "Usually replies in 30 minutes",
    tags: ["First-time renters", "Student housing", "Relocation"],
    about:
      "I am passionate about helping you find a place that fits your lifestyle and budget. Local expertise. Real relationships.",
    image: "/assets/portraits/brianna-taylor.webp",
    verified: false,
    languages: ["English", "Spanish"],
    fastResponse: true,
  },
  {
    id: "kyle-anderson",
    name: "Kyle Anderson",
    zipCodes: ["77056", "77057", "77494"],
    serviceAreas: ["Galleria", "Katy", "Sugar Land"],
    company: "HTX Apartment Advisors",
    rating: "4.8",
    reviews: 73,
    area: "Houston, TX",
    radius: "30 mi",
    years: 9,
    response: "Usually replies in 3 hours",
    tags: ["Luxury", "New construction", "Relocation"],
    about:
      "From downtown to the suburbs, I will help you find the right fit and negotiate the best deal, at no cost to you.",
    image: "/assets/portraits/kyle-anderson.webp",
    verified: false,
    languages: ["English"],
    fastResponse: false,
  },
  {
    id: "sarah-mitchell",
    name: "Sarah Mitchell",
    zipCodes: ["77380", "77389", "77373"],
    serviceAreas: ["The Woodlands", "Spring", "Katy"],
    company: "Houston Living Co.",
    rating: "4.9",
    reviews: 64,
    area: "The Woodlands, TX",
    radius: "22 mi",
    years: 7,
    response: "Usually replies in 1 hour",
    tags: ["Families", "Relocation", "Short-term"],
    about:
      "I help families settle into Houston neighborhoods with thoughtful recommendations and a personal touch.",
    image: "/assets/portraits/sarah-mitchell.webp",
    verified: false,
    languages: ["English"],
    fastResponse: true,
  },
  {
    id: "jamal-carter",
    name: "Jamal Carter",
    zipCodes: ["77478", "77584", "77030"],
    serviceAreas: ["Sugar Land", "Pearland", "Medical Center"],
    company: "Carter Apartment Search",
    rating: "4.9",
    reviews: 52,
    area: "Sugar Land, TX",
    radius: "18 mi",
    years: 5,
    response: "Usually replies in 2 hours",
    tags: ["Corporate", "Medical professionals", "Pet friendly"],
    about:
      "A straightforward search for your next place, with neighborhood knowledge from someone who calls Houston home.",
    image: "/assets/portraits/jamal-carter.webp",
    verified: false,
    languages: ["English"],
    fastResponse: false,
  },
];

const filters = [
  "All locators",
  "Top rated",
  "Fast response",
  "No fee to you",
  "Speaks Spanish",
  "Luxury",
  "Student housing",
  "Corporate",
];
const specialties = [
  "All specialties",
  "Luxury",
  "High-rises",
  "Relocation",
  "Student housing",
  "Corporate",
  "Pet friendly",
  "First-time renters",
  "New construction",
];
const imageUrl = (path) => path;
const annualMembershipPrice = Number(
  import.meta.env.VITE_ANNUAL_MEMBERSHIP_PRICE || 199,
);

function Brand({ light = false }) {
  return (
    <a
      className={`brand ${light ? "brand-light" : ""}`}
      href="#top"
      aria-label="Findit home"
    >
      <span className="brand-mark">
        <House size={21} strokeWidth={3} />
      </span>
      <span>
        FINDIT<span className="brand-period">.</span>
      </span>
      <span className="brand-city">HTX</span>
    </a>
  );
}

function App() {
  const [query, setQuery] = useState("Houston, TX");
  const [specialty, setSpecialty] = useState("All specialties");
  const [serviceArea, setServiceArea] = useState("All Houston areas");
  const [activeFilter, setActiveFilter] = useState("All locators");
  const [sort, setSort] = useState("Best match");
  const [saved, setSaved] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchNote, setSearchNote] = useState("");
  const [workspace, setWorkspace] = useState("marketplace");
  const [demoUser, setDemoUser] = useState(null);

  const visible = useMemo(() => {
    let result = locators.filter((l) => {
      const normalizedQuery = query
        .toLowerCase()
        .replace(/,?\s*tx$/, "")
        .trim();
      const queryMatch =
        !normalizedQuery ||
        normalizedQuery === "houston" ||
        `${l.name} ${l.area} ${l.company} ${l.zipCodes.join(" ")} ${l.serviceAreas.join(" ")} ${l.tags.join(" ")}`
          .toLowerCase()
          .includes(normalizedQuery);
      const areaMatch =
        serviceArea === "All Houston areas" ||
        l.serviceAreas.includes(serviceArea);
      const specialtyMatch =
        specialty === "All specialties" ||
        l.tags.some((tag) => tag.toLowerCase() === specialty.toLowerCase());
      const filterMatch =
        activeFilter === "All locators" ||
        activeFilter === "No fee to you" ||
        (activeFilter === "Fast response" && l.fastResponse) ||
        (activeFilter === "Speaks Spanish" &&
          l.languages?.includes("Spanish")) ||
        (activeFilter === "Top rated" && Number(l.rating) >= 4.9) ||
        l.tags.some((tag) => tag.toLowerCase() === activeFilter.toLowerCase());
      return queryMatch && areaMatch && specialtyMatch && filterMatch;
    });
    if (activeFilter === "Top rated" || sort === "Highest rated")
      result = [...result].sort((a, b) => Number(b.rating) - Number(a.rating));
    if (sort === "Most experienced")
      result = [...result].sort((a, b) => b.years - a.years);
    return result;
  }, [query, serviceArea, specialty, activeFilter, sort]);

  const toggleSave = (id) =>
    setSaved((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  const handleSearch = (event) => {
    event.preventDefault();
    setSearchNote(
      `Showing ${visible.length} locator${visible.length === 1 ? "" : "s"} for ${query || "all Houston areas"}.`,
    );
    document
      .getElementById("directory")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const openWorkspace = (nextWorkspace) => {
    setSelected(null);
    setWorkspace(nextWorkspace);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (workspace === "signin" || workspace === "signup") {
    return <DemoAuth
      mode={workspace}
      onMode={setWorkspace}
      onHome={() => openWorkspace("marketplace")}
      onAdmin={() => openWorkspace("admin")}
      onComplete={(user) => { setDemoUser(user); openWorkspace("portal"); }}
    />;
  }
  if (workspace === "portal") return <DemoPortal
    user={demoUser || { name: "Demo member", role: "locator" }}
    onHome={() => openWorkspace("marketplace")}
    onSignOut={() => { setDemoUser(null); openWorkspace("marketplace"); }}
  />;
  if (workspace === "admin") return <DemoAdmin
    onHome={() => openWorkspace("marketplace")}
    onExit={() => openWorkspace("signin")}
  />;

  return (
    <>
      <header className="site-header" id="top">
        <div className="nav-shell">
          <Brand />
          <nav
            className={`main-nav ${mobileMenu ? "is-open" : ""}`}
            aria-label="Main navigation"
          >
            <a
              className="nav-active"
              href="#directory"
              onClick={() => setMobileMenu(false)}
            >
              Find locators
            </a>
            <a href="#how-it-works" onClick={() => setMobileMenu(false)}>
              How it works
            </a>
            <a href="#for-locators" onClick={() => setMobileMenu(false)}>
              For locators
            </a>
            <a href="#resources" onClick={() => setMobileMenu(false)}>
              Resources
            </a>
          </nav>
          <div className="nav-actions">
            <button
              className="nav-login"
              onClick={() => openWorkspace("signin")}
            >
              Log in
            </button>
            <button
              className="button button-dark nav-join"
              onClick={() => openWorkspace("signup")}
            >
              Join Findit <ArrowRight size={15} />
            </button>
          </div>
          <button
            className="mobile-menu-button"
            aria-label={mobileMenu ? "Close menu" : "Open menu"}
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-image" />
          <div className="hero-overlay" />
          <div className="hero-content page-shell">
            <div className="hero-copy">
              <div className="eyebrow eyebrow-light">
                <span className="eyebrow-line" />
                HOUSTON'S APARTMENT LOCATOR MARKETPLACE
              </div>
              <h1 id="hero-title">
                Find apartment locators.
                <br />
                <em>Know where to start.</em>
              </h1>
              <p>
                Browse sample profiles for experienced Houston apartment
                locators, with neighborhood specialties for renters and
                apartment communities.
              </p>
              <div className="hero-proof">
                <span className="proof-avatars">
                  <img src={imageUrl(locators[0].image, 90)} />
                  <img src={imageUrl(locators[2].image, 90)} />
                  <img src={imageUrl(locators[1].image, 90)} />
                </span>
                <span>
                  <strong>Local insight. Personal guidance.</strong>
                  <small>Get to know Houston neighborhoods</small>
                </span>
                <ArrowDown className="hero-down" size={18} />
              </div>
            </div>
            <div className="hero-stamp">
              <span className="stamp-icon">
                <MapPin size={18} />
              </span>
              <span>
                <strong>Houston, TX</strong>
                <small>One city. A better way home.</small>
              </span>
            </div>
          </div>
        </section>

        <section className="search-wrap page-shell" aria-label="Find a locator">
          <form className="search-panel" onSubmit={handleSearch}>
            <label className="search-field location-field">
              <span className="field-label">Search by city or ZIP</span>
              <span className="input-wrap">
                <MapPin size={17} />
                <input
                  aria-label="Search by city or ZIP"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="City, neighborhood or ZIP"
                />
                <button
                  className="clear-input"
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear location"
                >
                  <X size={14} />
                </button>
              </span>
            </label>
            <label className="search-field">
              <span className="field-label">Service area</span>
              <span className="select-wrap">
                <select
                  aria-label="Service area"
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                >
                  <option>All Houston areas</option>
                  <option>The Heights</option>
                  <option>Midtown</option>
                  <option>Galleria</option>
                  <option>Downtown</option>
                  <option>The Woodlands</option>
                  <option>Spring</option>
                  <option>Sugar Land</option>
                  <option>Katy</option>
                  <option>Pearland</option>
                  <option>Medical Center</option>
                </select>
                <ChevronDown size={15} />
              </span>
            </label>
            <label className="search-field">
              <span className="field-label">Specialty</span>
              <span className="select-wrap">
                <select
                  aria-label="Specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                >
                  {specialties.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </span>
            </label>
            <button className="button button-dark search-button" type="submit">
              <Search size={17} />
              Search locators
            </button>
          </form>
        </section>

        <section className="directory page-shell" id="directory">
          <div className="section-heading directory-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                MEET YOUR LOCAL EXPERTS
              </div>
              <h2>
                People who know
                <br className="mobile-break" /> <em>this city</em> by heart.
              </h2>
              <span className="sample-note">
                Preview directory - fictional profiles, ratings, and reviews
              </span>
            </div>
            <div className="heading-aside">
              <span className="live-count">
                <span className="live-dot" />
                Houston preview - {locators.length} sample profiles
              </span>
              <p>
                Find a locator who listens first, knows the neighborhoods, and
                makes the details easier.
              </p>
            </div>
          </div>
          <div className="directory-tools">
            <div
              className="filter-list"
              role="group"
              aria-label="Filter locators"
            >
              {filters.map((item, index) => (
                <button
                  key={item}
                  className={`filter-chip ${activeFilter === item ? "filter-active" : ""} ${index > 4 ? "filter-optional" : ""}`}
                  onClick={() => {
                    setActiveFilter(item);
                    setSearchNote("");
                  }}
                >
                  {index === 1 && <Star size={13} fill="currentColor" />}
                  {index === 2 && <Clock3 size={13} />}
                  {item}
                </button>
              ))}
            </div>
            <label className="sort-control">
              <span>Sort by</span>
              <span className="sort-select">
                <select
                  aria-label="Sort locators"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option>Best match</option>
                  <option>Highest rated</option>
                  <option>Most experienced</option>
                </select>
                <ChevronDown size={14} />
              </span>
            </label>
          </div>
          {searchNote && (
            <div className="search-note" role="status">
              <Check size={15} />
              {searchNote}
            </div>
          )}
          {visible.length ? (
            <div className="locator-grid">
              {visible.map((locator, index) => (
                <article
                  className={`locator-card ${index === 0 && locator.featured ? "card-featured" : ""}`}
                  key={locator.id}
                >
                  <div className="card-photo-wrap">
                    <img
                      className="card-photo"
                      src={imageUrl(locator.image, 760)}
                      alt={`Portrait of ${locator.name}`}
                      loading="lazy"
                    />
                    {locator.featured && (
                      <span className="featured-label">
                        <Sparkles size={12} />
                        FEATURED
                      </span>
                    )}
                    <button
                      className={`save-button ${saved.includes(locator.id) ? "is-saved" : ""}`}
                      onClick={() => toggleSave(locator.id)}
                      aria-label={
                        saved.includes(locator.id)
                          ? `Remove ${locator.name} from saved locators`
                          : `Save ${locator.name}`
                      }
                    >
                      <Bookmark
                        size={17}
                        fill={
                          saved.includes(locator.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>
                  <div className="card-body">
                    <div className="card-title-row">
                      <div>
                        <h3>
                          {locator.name}
                          {locator.verified && (
                            <BadgeCheck
                              size={16}
                              fill="#178984"
                              color="white"
                              strokeWidth={2.5}
                              aria-label="Verified profile"
                            />
                          )}
                        </h3>
                        <p className="company-name">{locator.company}</p>
                      </div>
                      <span className="rating">
                        <Star size={14} fill="currentColor" strokeWidth={0} />
                        {locator.rating}
                        <span>({locator.reviews})</span>
                      </span>
                    </div>
                    <div className="card-location">
                      <MapPin size={14} />
                      <span>
                        {locator.area}
                        <small>+ {locator.radius}</small>
                      </span>
                    </div>
                    <div className="tag-row">
                      {locator.tags.slice(0, 3).map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="card-bio">{locator.about}</p>
                    <div className="card-meta">
                      <span>
                        <Clock3 size={13} />
                        {locator.years} years experience
                      </span>
                      <span className="response-label">
                        <span className="response-dot" />
                        {locator.response.replace(
                          "Usually replies in ",
                          "Replies in ",
                        )}
                      </span>
                    </div>
                    <button
                      className="button card-cta"
                      onClick={() => setSelected({ type: "profile", locator })}
                    >
                      View profile <ArrowUpRight size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span>
                <SlidersHorizontal size={20} />
              </span>
              <h3>No locators match those filters</h3>
              <p>
                Try another specialty or clear your filters to see more of
                Houston.
              </p>
              <button
                className="button button-dark"
                onClick={() => {
                  setSpecialty("All specialties");
                  setServiceArea("All Houston areas");
                  setActiveFilter("All locators");
                  setQuery("Houston, TX");
                }}
              >
                Reset search
              </button>
            </div>
          )}
          <div className="directory-bottom">
            <p>
              <ShieldCheck size={16} /> Sample profiles show example service
              areas and specialties.
            </p>
            <button
              className="text-link"
              onClick={() =>
                setSearchNote(
                  "This preview shows all currently included Houston profiles.",
                )
              }
            >
              Explore all locators <ArrowRight size={15} />
            </button>
          </div>
        </section>

        <section className="trust-band">
          <div className="page-shell trust-inner">
            <div className="trust-quote">
              <p>
                Houston is a big place.
                <br />
                <em>Finding your people makes it smaller.</em>
              </p>
            </div>
            <div className="trust-points">
              <div>
                <span className="trust-icon">
                  <ShieldCheck size={18} />
                </span>
                <span>
                  <strong>People, not listings</strong>
                  <small>Sample profiles are labeled clearly</small>
                </span>
              </div>
              <div>
                <span className="trust-icon">
                  <MessageCircle size={18} />
                </span>
                <span>
                  <strong>Direct conversation</strong>
                  <small>Contact tools are preview only</small>
                </span>
              </div>
              <div>
                <span className="trust-icon">
                  <MapPin size={18} />
                </span>
                <span>
                  <strong>Houston, neighborhood by neighborhood</strong>
                  <small>Houston neighborhoods in this preview</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="steps-section page-shell" id="how-it-works">
          <div className="section-heading steps-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />A SEARCH THAT FEELS MORE HUMAN
              </div>
              <h2>
                A good move starts
                <br />
                with <em>a good conversation.</em>
              </h2>
            </div>
            <p className="section-intro">
              No endless tabs. No figuring it all out alone. Start with someone
              who already knows the lay of the land.
            </p>
          </div>
          <div className="steps-grid">
            <article className="step">
              <span className="step-index">01</span>
              <span className="step-icon">
                <Search size={21} />
              </span>
              <h3>Find your fit</h3>
              <p>
                Search by neighborhood, specialty, and the kind of help you
                need.
              </p>
              <ArrowRight size={17} className="step-arrow" />
            </article>
            <article className="step">
              <span className="step-index">02</span>
              <span className="step-icon">
                <MessageCircle size={21} />
              </span>
              <h3>Say hello</h3>
              <p>
                Explore a profile and start a conversation with a local locator.
              </p>
              <ArrowRight size={17} className="step-arrow" />
            </article>
            <article className="step">
              <span className="step-index">03</span>
              <span className="step-icon">
                <House size={21} />
              </span>
              <h3>Feel at home</h3>
              <p>
                Get personal guidance as you find the place that feels right.
              </p>
              <ArrowRight size={17} className="step-arrow" />
            </article>
          </div>
        </section>

        <section className="locator-callout" id="for-locators">
          <div className="callout-photo" />
          <div className="callout-inner page-shell">
            <div className="callout-copy">
              <div className="eyebrow eyebrow-light">
                <span className="eyebrow-line" />
                FOR HOUSTON LOCATORS
              </div>
              <h2>
                Your work is local.
                <br />
                <em>Let more people find you.</em>
              </h2>
              <p>
                Share your experience, show the neighborhoods you know, and meet
                the people who need your help.
              </p>
              <button
                className="button button-teal"
                onClick={() => openWorkspace("signup")}
              >
                Become a Findit locator <ArrowRight size={16} />
              </button>
              <small>
                Annual membership - clear pricing - more meaningful
                introductions
              </small>
            </div>
            <div className="membership-card">
              <div className="membership-top">
                <span>LOCATOR MEMBERSHIP</span>
                <span className="member-icon">
                  <Building2 size={18} />
                </span>
              </div>
              <div className="member-price">
                <strong>
                  ${annualMembershipPrice.toLocaleString("en-US")}
                </strong>
                <span>/ year</span>
              </div>
              <p>One membership. A more discoverable profile.</p>
              <ul>
                <li>
                  <Check size={15} />A professional locator profile
                </li>
                <li>
                  <Check size={15} />
                  Your service areas and specialties
                </li>
                <li>
                  <Check size={15} />
                  Connect with Houston communities
                </li>
                <li>
                  <Check size={15} />
                  Annual profile visibility
                </li>
              </ul>
              <div className="price-note">
                Illustrative annual price. Final pricing is set by Findit.
              </div>
            </div>
          </div>
        </section>

        <section className="faq-section page-shell" id="resources">
          <div className="faq-intro">
            <div className="eyebrow">
              <span className="eyebrow-line" />
              GOOD TO KNOW
            </div>
            <h2>
              Questions,
              <br />
              <em>answered.</em>
            </h2>
            <p>A few things people ask before reaching out.</p>
            <button
              type="button"
              onClick={() => setSelected({ type: "contact" })}
              className="text-link"
            >
              Talk to our team <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="faq-list">
            <details>
              <summary>
                What does an apartment locator do?
                <span>
                  <ChevronDown size={17} />
                </span>
              </summary>
              <p>
                An apartment locator helps you narrow down neighborhoods and
                apartment options based on your needs, then guides you through
                your search. Services are generally free to renters.
              </p>
            </details>
            <details>
              <summary>
                Does it cost anything to contact a locator?
                <span>
                  <ChevronDown size={17} />
                </span>
              </summary>
              <p>
                There is no cost to browse profiles or contact a locator through
                Findit. Ask the locator about their process when you connect.
              </p>
            </details>
            <details>
              <summary>
                How are locator profiles verified?
                <span>
                  <ChevronDown size={17} />
                </span>
              </summary>
              <p>
                Findit profile details reflect information provided by the
                locator. A verification badge should only appear after Findit
                has reviewed and confirmed the relevant details.
              </p>
            </details>
            <details>
              <summary>
                How do locators join Findit?
                <span>
                  <ChevronDown size={17} />
                </span>
              </summary>
              <p>
                Locators can create a professional profile, add the Houston
                neighborhoods they serve, and choose the specialties they want
                to highlight. Membership pricing is being finalized.
              </p>
            </details>
          </div>
        </section>

        <section className="closing-cta">
          <div className="closing-mark">
            <House size={24} strokeWidth={2.6} />
          </div>
          <h2>
            Houston feels closer
            <br />
            when you <em>know where to start.</em>
          </h2>
          <p>
            Meet the local apartment locator who can help you find your next
            place.
          </p>
          <a className="button button-teal" href="#directory">
            Find your locator <ArrowRight size={16} />
          </a>
          <Sparkles className="closing-flower" size={58} aria-hidden="true" />
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-shell footer-main">
          <div className="footer-brand-col">
            <Brand light />
            <p>A more human way to find your next home in Houston.</p>
            <span className="footer-location">
              <MapPin size={14} />
              Houston, Texas
            </span>
          </div>
          <div className="footer-column">
            <strong>EXPLORE</strong>
            <a href="#directory">Find locators</a>
            <a href="#how-it-works">How it works</a>
            <a href="#for-locators">For locators</a>
          </div>
          <div className="footer-column">
            <strong>RESOURCES</strong>
            <a href="#resources">Frequently asked questions</a>
            <button onClick={() => setSelected({ type: "contact" })}>
              Contact us
            </button>
            <button onClick={() => openWorkspace("signin")}>
              Log in
            </button>
          </div>
          <div className="footer-note">
            <span>FIND YOUR WAY HOME</span>
            <p>
              Made with local knowledge
              <br />
              and a little Houston heart.
            </p>
            <Sparkles className="footer-star" size={22} aria-hidden="true" />
          </div>
        </div>
        <div className="page-shell footer-bottom">
          <span>Copyright 2026 Findit HTX</span>
          <span>Built for Houston. Ready to grow.</span>
          <span>
            <button onClick={() => setSelected({ type: "privacy" })}>
              Privacy
            </button>
            <button onClick={() => setSelected({ type: "terms" })}>
              Terms
            </button>
          </span>
        </div>
      </footer>

      {selected && (
        <ProfileDialog
          item={selected}
          close={() => setSelected(null)}
          onJoin={() => openWorkspace("signup")}
        />
      )}
    </>
  );
}

function ProfileDialog({ item, close, onJoin }) {
  const isProfile = item.type === "profile";
  const locator = item.locator;
  const [sent, setSent] = useState(false);
  const previewCopy = {
    signin: [
      "Welcome back.",
      "Locator and community sign-in is coming soon.",
      "Create an account",
    ],
    join: [
      "Good people make a good move.",
      "Findit is getting ready to connect Houston renters, locators, and apartment communities.",
      "Back to Findit",
    ],
    contact: [
      "We are getting ready to meet Houston.",
      "Contact details will be published when Findit opens. This preview does not send email.",
      "Back to Findit",
    ],
    privacy: [
      "Privacy information",
      "Findit privacy details will be published before the service opens.",
      "Back to Findit",
    ],
    terms: [
      "Terms of service",
      "Findit service and subscription terms will be published before the service opens.",
      "Back to Findit",
    ],
  };
  const [dialogTitle, dialogDescription, dialogAction] =
    previewCopy[item.type] || previewCopy.join;
  React.useEffect(() => {
    const onKey = (event) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className={`dialog ${isProfile ? "profile-dialog" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <button
          className="dialog-close"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={19} />
        </button>
        {isProfile ? (
          <>
            <div className="profile-hero">
              <img
                src={imageUrl(locator.image, 1100)}
                alt={`Portrait of ${locator.name}`}
              />
              <span className="profile-hero-shade" />
              <a href="#directory" className="back-search" onClick={close}>
                <ChevronLeft size={15} />
                Back to search
              </a>
            </div>
            <div className="profile-content">
              <p className="profile-sample-note">
                Sample profile - details, ratings, and response times are
                illustrative
              </p>
              <div className="profile-name-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" />
                    HOUSTON APARTMENT LOCATOR
                  </div>
                  <h2 id="dialog-title">
                    {locator.name}{" "}
                    {locator.verified && (
                      <BadgeCheck size={21} fill="#178984" color="white" />
                    )}
                  </h2>
                  <p>{locator.company}</p>
                </div>
                <div className="profile-rating">
                  <Star size={15} fill="currentColor" />
                  {locator.rating} <span>({locator.reviews} reviews)</span>
                </div>
              </div>
              <div className="profile-stats">
                <div>
                  <MapPin size={18} />
                  <strong>{locator.area}</strong>
                  <span>Serves + {locator.radius}</span>
                </div>
                <div>
                  <Clock3 size={18} />
                  <strong>{locator.years} years</strong>
                  <span>Of local experience</span>
                </div>
                <div>
                  <MessageCircle size={18} />
                  <strong>Usually replies</strong>
                  <span>
                    {locator.response.replace("Usually replies in ", "Within ")}
                  </span>
                </div>
              </div>
              <button
                className="button button-dark profile-contact"
                onClick={() => setSent(true)}
              >
                <MessageCircle size={17} />
                {sent ? "Preview only" : "Preview contact option"}
              </button>
              {sent && (
                <p className="contact-notice" role="status">
                  Messaging is not available in this preview. No message was
                  sent.
                </p>
              )}
              <div className="profile-section">
                <h3>About</h3>
                <p>
                  {locator.about} My goal is to make your apartment search
                  simple, fast, and stress-free.
                </p>
              </div>
              <div className="profile-section">
                <h3>Service areas</h3>
                <div className="tag-row">
                  {locator.serviceAreas.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="profile-section">
                <h3>Specialties</h3>
                <div className="tag-row">
                  {locator.tags.map((tag) => (
                    <span className="tag tag-outline" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="join-dialog-content">
            <span className="join-dialog-icon">
              {item.type === "signin" ? (
                <House size={23} />
              ) : (
                <Sparkles size={22} />
              )}
            </span>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              FINDIT HTX
            </div>
            <h2 id="dialog-title">{dialogTitle}</h2>
            <p>{dialogDescription}</p>
            <div className="coming-soon">
              <span className="live-dot" />
              Houston launch preview
            </div>
            <button
              className="button button-dark join-dialog-button"
              onClick={onJoin && item.type === "signin" ? onJoin : close}
            >
              {dialogAction}
              <ArrowRight size={16} />
            </button>
            <small>
              This product preview has no accounts, payments, or live messaging.
            </small>
          </div>
        )}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
