// Thin client for the FindIt API. Same-origin; the session lives in an httpOnly cookie.
async function call(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "findit" },
      body: body === undefined ? undefined : JSON.stringify(body),
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
  locators: (params) => call("GET", `/locators?${new URLSearchParams(params)}`),
  locator: (id) => call("GET", `/locators/${encodeURIComponent(id)}`),
  favourites: () => call("GET", "/favourites"),
  save: (id) => call("PUT", `/favourites/${encodeURIComponent(id)}`, {}),
  unsave: (id) => call("DELETE", `/favourites/${encodeURIComponent(id)}`),
  reasons: () => call("GET", "/report-reasons"),
  report: (id, b) => call("POST", `/locators/${encodeURIComponent(id)}/report`, b),
  admin: {
    summary: () => call("GET", "/admin/summary"),
    locators: () => call("GET", "/admin/locators"),
    create: (b) => call("POST", "/admin/locators", b),
    update: (id, b) => call("PUT", `/admin/locators/${encodeURIComponent(id)}`, b),
    setStatus: (id, status) => call("POST", `/admin/locators/${encodeURIComponent(id)}/status`, { status }),
    reports: (status = "open") => call("GET", `/admin/reports?status=${status}`),
    setReport: (id, status) => call("POST", `/admin/reports/${id}`, { status }),
  },
};

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown";
