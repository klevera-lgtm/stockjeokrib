import { getAnonymousKey } from "@apps-in-toss/web-framework";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portfolio`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ANON_KEY_STORAGE = "_anon_key";
const HEADERS = { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` };

export async function getAnonKey() {
  try {
    const result = await getAnonymousKey();
    if (result && result !== "ERROR" && result.type === "HASH") {
      return result.hash;
    }
  } catch {
    // not in Toss app — fall through to browser fallback
  }
  let key = localStorage.getItem(ANON_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(ANON_KEY_STORAGE, key);
  }
  return key;
}

export async function fetchPortfolio(anonKey) {
  const res = await fetch(`${EDGE_URL}?anonymous_key=${anonKey}`, { headers: HEADERS });
  if (!res.ok) return null;
  return res.json();
}

export async function addPortfolioItem(anonKey, { ticker, strategy }) {
  const res = await fetch(`${EDGE_URL}?anonymous_key=${anonKey}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ ticker, strategy }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function removePortfolioItem(anonKey, ticker) {
  const res = await fetch(
    `${EDGE_URL}?anonymous_key=${anonKey}&ticker=${encodeURIComponent(ticker)}`,
    { method: "DELETE", headers: HEADERS }
  );
  return res.ok;
}
