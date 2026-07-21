import { getAnonymousKey } from "@apps-in-toss/web-framework";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portfolio`;
const RPC_URL = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc`;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ANON_KEY_STORAGE = "_anon_key";
const HEADERS = { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` };
// PostgREST(REST/RPC)는 apikey 헤더가 필요 — 엣지 함수와 달리 표준 CORS(Allow-Methods 포함)를 내려줌
const REST_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

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

// 삭제는 RPC(POST)로 호출 — 엣지 함수 DELETE는 CORS preflight(Allow-Methods 누락)에 막혀
// 토스 WebView 브라우저에서 서버에 도달하지 못함. RPC는 POST라 preflight 문제가 없고
// SECURITY DEFINER 함수라 RLS도 우회함. (SQL: supabase/fix_portfolio_delete.sql)
export async function removePortfolioItem(anonKey, ticker) {
  const res = await fetch(`${RPC_URL}/delete_portfolio_item`, {
    method: "POST",
    headers: REST_HEADERS,
    body: JSON.stringify({ p_anon: anonKey, p_ticker: ticker }),
  });
  return res.ok;
}
