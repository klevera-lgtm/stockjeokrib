// 크립토 ETF 자금 흐름 슬림 사전계산 → etfFlows.json
// node scripts/computeEtfFlows.mjs
//
// BTC·ETH·SOL 현물 ETF 일별 순유입(US$M)을 kittycapital/btc-etf-dashboard(bitbo 출처)에서 받아
// 모바일용으로 슬림: 최근 90일 시리즈 + 누적 + 최신일 + 발행사별 누적.
// ⚠️ 정보 제공용 · 기관 자금 흐름(과거 사실) · 유입≠가격상승 · 매매 권유 아님.

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR || join(__dirname, "..", "public");
const OUTPUT = join(OUT_DIR, "etfFlows.json");
const RAW = "https://raw.githubusercontent.com/kittycapital/btc-etf-dashboard/main/data/";
const RECENT = 90;

const ASSETS = [
  { key: "btc", label: "비트코인", file: "etf_flows.json", priceFile: "btc_price.json" },
  { key: "eth", label: "이더리움", file: "eth_etf_flows.json", priceFile: "eth_price.json" },
  { key: "sol", label: "솔라나", file: "sol_etf_flows.json", priceFile: "sol_price.json" },
];

async function fetchJson(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (stockjeokrib-ci)" } });
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}

const out = { updated: null, unit: "US$M", assets: {} };

for (const a of ASSETS) {
  try {
    const j = await fetchJson(RAW + a.file);
    const info = j.metadata?.etf_info || {};
    const df = (j.daily_flows || []).filter((r) => r && r.date && r.flows);
    if (!df.length) { console.warn(`${a.key}: 0행 스킵`); continue; }

    // 누적 총합 + 발행사별 누적
    let cumulative = 0;
    const byIssuer = {};
    for (const row of df) {
      cumulative += Number(row.total) || 0;
      for (const [k, v] of Object.entries(row.flows)) byIssuer[k] = (byIssuer[k] || 0) + (Number(v) || 0);
    }
    const issuers = Object.entries(byIssuer)
      .map(([k, cum]) => ({ k, name: info[k]?.issuer || info[k]?.name || k, cum: +cum.toFixed(1) }))
      .sort((x, y) => y.cum - x.cum).slice(0, 8);

    // 가격 맵 (자금 흐름 위에 가격 선 오버레이용)
    let prices = {};
    try { const pj = await fetchJson(RAW + a.priceFile); prices = pj.prices || pj || {}; } catch (e) { console.warn(`${a.key} 가격 실패:`, e.message); }

    // 최근 90일 시리즈 (바 차트 + 가격 선)
    const series = df.slice(-RECENT).map((r) => {
      const p = prices[r.date];
      return { d: r.date, t: +(Number(r.total) || 0).toFixed(1), p: p != null ? +Number(p).toFixed(p >= 100 ? 0 : 2) : null };
    });

    // 최신일 + 그날 상위 유입 발행사
    const lastRow = df[df.length - 1];
    const top = Object.entries(lastRow.flows)
      .map(([k, v]) => ({ k, v: +(Number(v) || 0).toFixed(1), name: info[k]?.issuer || k }))
      .filter((x) => x.v !== 0).sort((x, y) => Math.abs(y.v) - Math.abs(x.v)).slice(0, 4);

    out.assets[a.key] = {
      label: a.label,
      latest: { date: lastRow.date, total: +(Number(lastRow.total) || 0).toFixed(1), top },
      cumulative: Math.round(cumulative),
      series, issuers,
    };
    if (!out.updated || lastRow.date > out.updated) out.updated = lastRow.date;
    console.log(`${a.key}: ${df.length}일 · 누적 $${Math.round(cumulative).toLocaleString()}M · 최신 ${lastRow.date} $${out.assets[a.key].latest.total}M`);
  } catch (e) {
    console.warn(`${a.key} 실패 — 스킵:`, e.message);
  }
}

if (Object.keys(out.assets).length === 0) { console.warn("전체 실패 — 스킵(기존 JSON 유지)"); process.exit(0); }
writeFileSync(OUTPUT, JSON.stringify(out));
console.log(`\n✅ etfFlows.json 저장 (updated ${out.updated})`);
