// Shared by the API (validation, search) and the React app (labels, filters).

export const AVAILABILITY = {
  available: "Available now",
  coming_soon: "Coming soon",
  waitlist: "Waitlist only",
  unavailable: "No current availability",
  unknown: "Availability not confirmed",
};
// Lower is better when ranking results.
export const AVAILABILITY_RANK = { available: 0, coming_soon: 1, waitlist: 2, unknown: 3, unavailable: 4 };

export const PETS = {
  "dogs-and-cats": "Dogs and cats allowed",
  "cats-only": "Cats only",
  none: "No pets allowed",
  unknown: "Pet policy not provided",
};

export const AMENITIES = [
  "In-unit washer/dryer",
  "Pool",
  "Fitness center",
  "Covered parking",
  "Garage parking",
  "EV charging",
  "Dog park",
  "Rooftop deck",
  "Controlled access",
  "Package lockers",
  "Balcony or patio",
  "Elevator",
  "Wheelchair accessible",
  "Furnished options",
  "Short-term leases",
  "Near METRORail",
  "Utilities included",
  "Coworking space",
];

export const NEIGHBORHOODS = [
  "The Heights", "Montrose", "Midtown", "Downtown", "EaDo", "Museum District",
  "Galleria", "Rice Village", "Medical Center", "Memorial", "Energy Corridor", "The Woodlands",
];

export const PROPERTY_REPORT_REASONS = [
  "Wrong price or availability",
  "This listing is no longer available",
  "Incorrect details or photos",
  "Contact or tour link doesn't work",
  "Suspicious or misleading listing",
  "Other",
];
export const LOCATOR_REPORT_REASONS = [
  "Wrong or outdated information",
  "Broken listings link",
  "Not a real locator",
  "Inappropriate content",
  "Other",
];

export const CONTACT_TOPICS = [
  "General question",
  "Account help",
  "List or update a property",
  "Locator profile",
  "Report a correction",
  "Something else",
];

// Availability older than this is flagged to staff and labelled for visitors.
export const STALE_DAYS = 14;
export const PAGE_SIZE = 12;

export const isStale = (checkedAt, now = Date.now()) =>
  !checkedAt || now - new Date(checkedAt).getTime() > STALE_DAYS * 86400000;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const money = (n) => (n == null ? "" : usd.format(n));
export const bedsLabel = (b) => (b === 0 ? "Studio" : `${b} bd`);

// Summary numbers for a list of floor plans: price, bed, bath and size ranges.
export function planSummary(plans = []) {
  const nums = (key) => plans.map((p) => p[key]).filter((n) => n != null);
  const rents = plans.flatMap((p) => [p.rentMin, p.rentMax]).filter((n) => n != null);
  const beds = nums("beds"), baths = nums("baths"), sqft = nums("sqft");
  const range = (xs) => (xs.length ? [Math.min(...xs), Math.max(...xs)] : null);
  return { rent: range(rents), beds: range(beds), baths: range(baths), sqft: range(sqft) };
}
