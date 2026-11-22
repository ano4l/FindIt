// Thin client for the FindIt API. Same-origin; the session lives in an httpOnly cookie.
async function call(method, path, body, { raw } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": raw ? raw.type : "application/json", "X-Requested-With": "findit" },
      body: raw ? raw : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    const e = new Error("Can't reach FindIt right now. Check your connection and try again.");
    e.offline = true;
    throw e;
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const e = new Error(data.error || "Something went wrong. Please try again.");
    e.status = res.status;
    e.code = data.code;
    throw e;
  }
  return data;
}
// Adds a query string when there is one. (URLSearchParams.size is missing in Safari before 17, so this
// checks the text instead; otherwise filters would silently be dropped on older iPhones.)
export const withQuery = (path, params) => { const s = params.toString(); return s ? `${path}?${s}` : path; };
const q = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== "") p.set(k, v);
  return withQuery("", p);
};
const id = encodeURIComponent;

export const api = {
  me: () => call("GET", "/auth/me"),
  signup: (b) => call("POST", "/auth/signup", b),
  login: (b) => call("POST", "/auth/login", b),
  changePassword: (b) => call("POST", "/auth/password", b),
  contact: (b) => call("POST", "/contact", b),
  logout: () => call("POST", "/auth/logout", {}),
  verify: (token) => call("POST", "/auth/verify", { token }),
  resend: (email) => call("POST", "/auth/resend", { email }),
  forgot: (email) => call("POST", "/auth/forgot", { email }),
  reset: (token, password) => call("POST", "/auth/reset", { token, password }),

  properties: (params) => call("GET", `/properties${q(params)}`),
  property: (pid) => call("GET", `/properties/${id(pid)}`),
  reportProperty: (pid, b) => call("POST", `/properties/${id(pid)}/report`, b),
  locators: (params) => call("GET", `/locators${q(params)}`),
  locator: (lid) => call("GET", `/locators/${id(lid)}`),
  report: (lid, b) => call("POST", `/locators/${id(lid)}/report`, b),

  favourites: () => call("GET", "/favourites"),
  save: (kind, fid) => call("PUT", `/favourites/${kind}/${id(fid)}`, {}),
  unsave: (kind, fid) => call("DELETE", `/favourites/${kind}/${id(fid)}`),

  admin: {
    summary: () => call("GET", "/admin/summary"),
    activity: () => call("GET", "/admin/activity"),
    locators: () => call("GET", "/admin/locators"),
    create: (b) => call("POST", "/admin/locators", b),
    update: (lid, b) => call("PUT", `/admin/locators/${id(lid)}`, b),
    setStatus: (lid, status) => call("POST", `/admin/locators/${id(lid)}/status`, { status }),
    properties: () => call("GET", "/admin/properties"),
    property: (pid) => call("GET", `/admin/properties/${id(pid)}`),
    createProperty: (b) => call("POST", "/admin/properties", b),
    updateProperty: (pid, b) => call("PUT", `/admin/properties/${id(pid)}`, b),
    setPropertyStatus: (pid, status) => call("POST", `/admin/properties/${id(pid)}/status`, { status }),
    setAvailability: (pid, availability, note) => call("POST", `/admin/properties/${id(pid)}/availability`, { availability, note }),
    upload: (file) => call("POST", "/admin/uploads", undefined, { raw: file }),
    reports: (status = "open") => call("GET", `/admin/reports?status=${status}`),
    setReport: (rid, status) => call("POST", `/admin/reports/${rid}`, { status }),
    messages: (status = "open") => call("GET", `/admin/messages?status=${status}`),
    setMessage: (mid, handled) => call("POST", `/admin/messages/${mid}`, { handled }),
  },
};

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown";
// Floor plan dates are calendar days (YYYY-MM-DD), so format them without a timezone shift.
export const formatDay = (day) =>
  day ? new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
export const daysAgo = (iso) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
