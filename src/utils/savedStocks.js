// 내 종목(관심종목) 저장소 — MyStocks와 StrategyResult가 공유.
// 티커 목록 + "담은 날짜" 앵커를 같은 localStorage 키로 관리해요.
import { isBasic } from "./premium.js";

const STORE_KEY = "ait_my_stocks";
const DATES_KEY = "ait_my_stocks_dates";
export const FREE_LIMIT = 10;
export const BASIC_LIMIT = 100;

export function todayStr() { return new Date().toISOString().slice(0, 10); }

export function getSavedStocks() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
export function writeSavedStocks(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch {}
}
export function getSavedDates() {
  try { return JSON.parse(localStorage.getItem(DATES_KEY)) || {}; } catch { return {}; }
}
export function writeSavedDates(map) {
  try { localStorage.setItem(DATES_KEY, JSON.stringify(map)); } catch {}
}

export function savedLimit() { return isBasic() ? BASIC_LIMIT : FREE_LIMIT; }
export function savedCount() { return getSavedStocks().length; }
export function hasSavedStocks() { return getSavedStocks().length > 0; }
export function isSaved(ticker) { return getSavedStocks().includes(ticker); }

// 담기 시도. 반환: "ok" | "exists" | "limit"
export function saveStock(ticker) {
  const list = getSavedStocks();
  if (list.includes(ticker)) return "exists";
  if (list.length >= savedLimit()) return "limit";
  writeSavedStocks([...list, ticker]);
  writeSavedDates({ ...getSavedDates(), [ticker]: todayStr() });
  return "ok";
}

export function removeSavedStock(ticker) {
  writeSavedStocks(getSavedStocks().filter((t) => t !== ticker));
  const dates = getSavedDates();
  delete dates[ticker];
  writeSavedDates(dates);
}
