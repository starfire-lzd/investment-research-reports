import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const targetDate = args.targetDate ?? formatDate(new Date());
const outputDir = path.join(root, "data", targetDate);
const inputPath = args.inputPath ?? path.join(outputDir, "signal-targets.json");
const outputPath = path.join(outputDir, "signal-evaluation.json");

const indexesToTrack = [
  { code: "000001", name: "上证指数", secid: "1.000001" },
  { code: "399001", name: "深证成指", secid: "0.399001" },
  { code: "399006", name: "创业板指", secid: "0.399006" }
];

function parseArgs(argv) {
  const parsed = { targetDate: null, inputPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input") {
      parsed.inputPath = argv[index + 1];
      index += 1;
    } else if (!value.startsWith("--") && !parsed.targetDate) {
      parsed.targetDate = value;
    }
  }
  return parsed;
}

function formatDate(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function compactDate(date) {
  return date.replaceAll("-", "");
}

function previousWeekday(date) {
  const next = new Date(`${date}T00:00:00+08:00`);
  do {
    next.setDate(next.getDate() - 1);
  } while (next.getDay() === 0 || next.getDay() === 6);
  return formatDate(next);
}

function thirdPreviousTradingDate(date) {
  let cursor = date;
  for (let index = 0; index < 3; index += 1) {
    cursor = previousWeekday(cursor);
  }
  return cursor;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(filePath) {
  if (!(await exists(filePath))) return null;
  return fs.readFile(filePath, "utf8");
}

function normalizeCode(code) {
  const normalized = code.replace(/^(SH|SZ|BJ)/i, "").replace(/\.(SH|SZ|BJ)$/i, "");
  return /^\d{6}$/.test(normalized) ? normalized : null;
}

function defaultSecid(code) {
  if (code.startsWith("6") || code.startsWith("9")) return `1.${code}`;
  return `0.${code}`;
}

function requestText(url, encoding = "utf8") {
  const client = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString(encoding));
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error(`timeout: ${url}`));
    });
    req.on("error", reject);
  });
}

async function currentQuotes(items) {
  if (items.length === 0) return {};
  const secids = items.map((item) => item.secid ?? defaultSecid(item.code)).join(",");
  const url = new URL("https://push2.eastmoney.com/api/qt/ulist.np/get");
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fields", "f12,f14,f2,f3,f4,f5,f6,f8,f15,f16,f17,f18");
  url.searchParams.set("secids", secids);
  const text = await requestText(url.toString());
  const json = JSON.parse(text);
  const result = {};

  for (const row of json.data?.diff ?? []) {
    result[row.f12] = {
      code: row.f12,
      name: row.f14,
      price: numberOrNull(row.f2),
      previousClose: numberOrNull(row.f18),
      open: numberOrNull(row.f17),
      changePct: numberOrNull(row.f3),
      high: numberOrNull(row.f15),
      low: numberOrNull(row.f16),
      amount: numberOrNull(row.f6),
      turnoverPct: numberOrNull(row.f8)
    };
  }

  return result;
}

async function historicalDaily(item, date) {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.searchParams.set("secid", item.secid ?? defaultSecid(item.code));
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58");
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("beg", compactDate(date));
  url.searchParams.set("end", compactDate(date));
  const text = await requestText(url.toString());
  const json = JSON.parse(text);
  const line = json.data?.klines?.[0];
  if (!line) return null;
  const [day, open, close, high, low, volume, amount, amplitude] = line.split(",");
  return {
    date: day,
    open: numberOrNull(open),
    close: numberOrNull(close),
    high: numberOrNull(high),
    low: numberOrNull(low),
    volume: numberOrNull(volume),
    amount: numberOrNull(amount),
    amplitudePct: numberOrNull(amplitude)
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pctChange(current, base) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return Number(((current - base) / base * 100).toFixed(2));
}

async function evaluateCode(item, current, t3Date) {
  const historical = await historicalDaily(item, t3Date);
  const code = item.code;
  const quote = current[code] ?? null;
  return {
    code,
    name: quote?.name ?? item.name ?? null,
    reason: item.reason ?? null,
    source: item.source ?? null,
    conditionIds: Array.isArray(item.conditionIds) ? item.conditionIds : [],
    t3: historical,
    current: quote,
    returnPctFromT3Close: pctChange(quote?.price, historical?.close),
    status: historical && quote?.price ? "priced" : "missing_price"
  };
}

async function loadTargets() {
  const raw = await readIfExists(inputPath);
  if (!raw) {
    throw new Error(`missing target file: ${inputPath}. Create data/YYYY-MM-DD/signal-targets.json before running this script.`);
  }
  const parsed = JSON.parse(raw);
  const rawSecurities = Array.isArray(parsed.securities) ? parsed.securities : [];
  const securities = rawSecurities
    .map((item) => ({
      ...item,
      code: normalizeCode(String(item.code ?? ""))
    }))
    .filter((item) => item.code && /^[03689]/.test(item.code));

  return {
    targetDate: parsed.targetDate ?? targetDate,
    t3Date: parsed.t3Date ?? thirdPreviousTradingDate(targetDate),
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    securities,
    indexes: Array.isArray(parsed.indexes) ? parsed.indexes : indexesToTrack
  };
}

async function main() {
  const targets = await loadTargets();
  const indexItems = targets.indexes.map((item) => ({
    ...item,
    code: normalizeCode(String(item.code ?? "")) ?? item.code,
    secid: item.secid
  }));
  const current = await currentQuotes([...targets.securities, ...indexItems]);
  const indexes = [];
  for (const item of indexItems) {
    try {
      indexes.push(await evaluateCode(item, current, targets.t3Date));
    } catch (error) {
      indexes.push({ code: item.code, name: item.name, status: "error", error: error.message });
    }
  }

  const securities = [];
  for (const item of targets.securities) {
    try {
      securities.push(await evaluateCode(item, current, targets.t3Date));
    } catch (error) {
      securities.push({
        code: item.code,
        name: item.name ?? null,
        reason: item.reason ?? null,
        source: item.source ?? null,
        conditionIds: Array.isArray(item.conditionIds) ? item.conditionIds : [],
        status: "error",
        error: error.message
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    targetDate: targets.targetDate,
    t3Date: targets.t3Date,
    inputPath,
    method: "Targets are model-selected in signal-targets.json. Prices use Eastmoney daily kline for T-3 close and Eastmoney quote for current price.",
    sources: targets.sources,
    indexes,
    securities,
    notes: [
      "This file provides price evidence only. Target selection, condition mapping, and final attribution remain model responsibilities in the evening review.",
      "If T-3 was a holiday not covered by the weekday fallback, rerun with an explicit target date after correcting the source date in the review."
    ]
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(`T-3 date: ${targets.t3Date}; securities: ${securities.length}`);
}

main().catch(async (error) => {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    targetDate,
    status: "error",
    error: error.message
  }, null, 2)}\n`);
  console.error(error);
  process.exit(1);
});
