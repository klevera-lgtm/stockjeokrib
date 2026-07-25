import { loadRawPrices, loadDividends } from "./dividendData.js";

const TX_FEE = 0.0035;
const KRW_USD = 1380;

export async function runDividendSim(ticker, monthlyKRW, startDate, endDate, drip = true) {
  const [prices, divs] = await Promise.all([
    loadRawPrices(ticker),
    loadDividends(ticker),
  ]);

  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const filteredPrices = prices.filter((p) => p.date >= start && p.date <= end);
  if (filteredPrices.length < 2) return null;

  const divMap = {};
  divs.forEach((d) => { divMap[d.date] = d.amount; });

  const monthlyUSD = monthlyKRW / KRW_USD;

  let totalShares = 0;
  let totalInvested = 0;
  let totalDividends = 0;
  let cashDividends = 0;
  let lastBuyMonth = "";

  const portfolioValues = [];
  const dividendEvents = [];

  for (const p of filteredPrices) {
    const ym = p.date.slice(0, 7);

    if (ym !== lastBuyMonth && p.close > 0) {
      const net = monthlyUSD * (1 - TX_FEE);
      const bought = net / p.close;
      totalShares += bought;
      totalInvested += monthlyKRW;
      lastBuyMonth = ym;
    }

    const divAmt = divMap[p.date];
    if (divAmt && divAmt > 0 && totalShares > 0) {
      const divTotal = divAmt * totalShares;
      totalDividends += divTotal;

      if (drip && p.close > 0) {
        const reinvestNet = divTotal * (1 - TX_FEE);
        totalShares += reinvestNet / p.close;
      } else {
        cashDividends += divTotal;
      }

      dividendEvents.push({
        date: p.date,
        perShare: divAmt,
        total: divTotal,
        shares: totalShares,
      });
    }

    const stockValue = totalShares * p.close * KRW_USD;
    const cashValue = cashDividends * KRW_USD;

    portfolioValues.push({
      date: p.date,
      value: stockValue + cashValue,
      invested: totalInvested,
      stockValue,
      cashValue,
      shares: totalShares,
    });
  }

  if (portfolioValues.length === 0) return null;

  const last = portfolioValues.at(-1);
  const finalValue = last.value;
  const totalReturn = totalInvested > 0 ? finalValue / totalInvested - 1 : 0;

  const meta = await import("./dividendData.js").then((m) => m.loadDividendMeta());
  const tickerMeta = meta[ticker];
  const currentYield = tickerMeta?.currentYield ?? 0;
  const ttmDividend = tickerMeta?.ttmDividend ?? 0;

  const monthlyDivUSD = (ttmDividend * totalShares) / 12;
  const monthlyDivKRW = monthlyDivUSD * KRW_USD;
  const annualDivKRW = monthlyDivKRW * 12;

  const years = filteredPrices.length > 1
    ? (new Date(filteredPrices.at(-1).date) - new Date(filteredPrices[0].date)) / (365.25 * 86400000)
    : 0;
  const cagr = years > 0 ? Math.pow(finalValue / totalInvested, 1 / years) - 1 : 0;

  return {
    ticker,
    drip,
    totalInvested,
    finalValue,
    totalReturn,
    cagr,
    years,
    totalShares,
    totalDividendsUSD: totalDividends,
    totalDividendsKRW: totalDividends * KRW_USD,
    monthlyDivKRW,
    annualDivKRW,
    currentYield,
    portfolioValues,
    dividendEvents,
  };
}
