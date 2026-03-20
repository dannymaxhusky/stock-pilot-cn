import { createServer } from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DB_DIR, "db.json");
const ENV = await loadEnv(path.join(__dirname, ".env"));
const PORT = Number(ENV.PORT || 4173);
const OPENAI_API_KEY = ENV.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = ENV.OPENAI_BASE_URL || "https://api.openai.com";
const OPENAI_MODEL = ENV.OPENAI_MODEL || "gpt-5-mini";
const ANTHROPIC_BASE_URL =
  ENV.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || "";
const ANTHROPIC_AUTH_TOKEN =
  ENV.ANTHROPIC_AUTH_TOKEN ||
  ENV.ANTHROPIC_API_KEY ||
  process.env.ANTHROPIC_AUTH_TOKEN ||
  process.env.ANTHROPIC_API_KEY ||
  "";
const ANTHROPIC_MODEL =
  ENV.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";
const SESSION_SECRET = ENV.SESSION_SECRET || "stock-pilot-local-secret";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const COOKIE_NAME = "stockpilot_session";
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

await ensureDb();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, inferStatusCode(error), { error: error.message || "服务器错误" });
  }
});

server.listen(PORT, () => {
  console.log(`Stock Pilot CN running at http://localhost:${PORT}`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, {
      hasOpenAIKey: Boolean(OPENAI_API_KEY),
      openaiModel: OPENAI_MODEL,
      hasAnthropicKey: Boolean(ANTHROPIC_AUTH_TOKEN),
      anthropicModel: ANTHROPIC_MODEL,
      defaultAiProvider: getDefaultAiProvider()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/quote") {
    const code = url.searchParams.get("code") || "";
    const quote = await fetchMarketQuote(code);
    sendJson(res, 200, quote);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/analyze") {
    const payload = await readJson(req);
    const analysis = await analyzeWithAi(payload);
    sendJson(res, 200, analysis);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const payload = await readJson(req);
    const result = await registerUser(payload.username, payload.password);
    const cookie = await createSession(result.user.id);
    res.setHeader("Set-Cookie", serializeCookie(cookie));
    sendJson(res, 201, { user: sanitizeUser(result.user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const payload = await readJson(req);
    const user = await loginUser(payload.username, payload.password);
    const cookie = await createSession(user.id);
    res.setHeader("Set-Cookie", serializeCookie(cookie));
    sendJson(res, 200, { user: sanitizeUser(user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    await destroySession(readCookie(req, COOKIE_NAME));
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    const user = await requireUser(req);
    sendJson(res, 200, { user: sanitizeUser(user) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/portfolio") {
    const user = await requireUser(req);
    sendJson(res, 200, { portfolio: user.portfolio });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/portfolio") {
    const user = await requireUser(req);
    const payload = await readJson(req);
    const saved = await savePortfolio(user.id, payload.state);
    sendJson(res, 200, { portfolio: saved, savedAt: new Date().toISOString() });
    return;
  }

  sendJson(res, 404, { error: "接口不存在" });
}

async function serveStatic(requestPath, res) {
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const relativePath = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const filePath = path.join(__dirname, relativePath);

  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { error: "禁止访问" });
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "文件不存在" });
  }
}

async function fetchMarketQuote(code) {
  if (!/^\d{6}$/.test(code)) {
    throw new Error("股票代码必须是 6 位数字");
  }

  const secid = `${guessMarket(code)}.${code}`;
  const commonHeaders = {
    "User-Agent": "Mozilla/5.0 StockPilotCN/1.0",
    Referer: "https://quote.eastmoney.com/"
  };

  const quoteUrl = new URL("https://push2.eastmoney.com/api/qt/stock/get");
  quoteUrl.searchParams.set("secid", secid);
  quoteUrl.searchParams.set("fields", "f43,f57,f58,f169,f170,f171");
  quoteUrl.searchParams.set("ut", "fa5fd1943c7b386f172d6893dbfba10b");

  const historyUrl = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  historyUrl.searchParams.set("secid", secid);
  historyUrl.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  historyUrl.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61");
  historyUrl.searchParams.set("klt", "101");
  historyUrl.searchParams.set("fqt", "1");
  historyUrl.searchParams.set("lmt", "10");
  historyUrl.searchParams.set("end", "20500101");
  historyUrl.searchParams.set("ut", "fa5fd1943c7b386f172d6893dbfba10b");

  const [quoteResponse, historyResponse] = await Promise.all([
    fetch(quoteUrl, { headers: commonHeaders }),
    fetch(historyUrl, { headers: commonHeaders })
  ]);

  if (!quoteResponse.ok || !historyResponse.ok) {
    throw new Error(`行情源返回异常：${quoteResponse.status}/${historyResponse.status}`);
  }

  const quotePayload = await quoteResponse.json();
  const historyPayload = await historyResponse.json();
  const quoteData = quotePayload?.data;
  const klineRows = historyPayload?.data?.klines;

  if (!quoteData || !Array.isArray(klineRows) || !klineRows.length) {
    throw new Error("行情源未返回有效数据");
  }

  const closes = klineRows
    .slice(-5)
    .map((row) => Number(String(row).split(",")[2]))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    code,
    name: quoteData.f58 || quoteData.f57 || code,
    currentPrice: normalizeEastMoneyPrice(quoteData.f43),
    changePercent: normalizeEastMoneyPrice(quoteData.f170),
    amplitude: normalizeEastMoneyPrice(quoteData.f171),
    closes
  };
}

async function analyzeWithAi(stock) {
  validateStockPayload(stock);
  const localAnalysis = buildLocalAnalysis(stock);
  const requestedProvider = normalizeProvider(stock.provider);

  if (requestedProvider === "local") {
    return { ...localAnalysis, provider: "local", model: "rule-engine" };
  }

  if (requestedProvider === "anthropic") {
    if (!(ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL)) {
      throw new Error("Anthropic 当前不可用");
    }
    return analyzeWithAnthropic(stock, localAnalysis);
  }

  if (requestedProvider === "openai") {
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI 当前不可用");
    }
    return analyzeWithOpenAI(stock, localAnalysis);
  }

  if (ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL) {
    return analyzeWithAnthropic(stock, localAnalysis);
  }

  if (OPENAI_API_KEY) {
    return analyzeWithOpenAI(stock, localAnalysis);
  }

  return { ...localAnalysis, provider: "local-fallback", model: "rule-engine" };
}

async function analyzeWithOpenAI(stock, localAnalysis) {
  const endpoint = new URL("/v1/responses", ensureTrailingSlash(OPENAI_BASE_URL)).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions:
        "你是谨慎的 A 股模拟盘研究助手。基于输入价格序列给出短线趋势判断，只返回 JSON，不要添加投资承诺或保证。",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `请分析这只 A 股的短线走势：${JSON.stringify(stock)}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "stock_trend_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              direction: {
                type: "string",
                enum: ["看涨", "看跌", "震荡"]
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 100
              },
              action: {
                type: "string"
              },
              rationale: {
                type: "string"
              },
              riskLevel: {
                type: "string",
                enum: ["低", "中", "高"]
              },
              keySignals: {
                type: "array",
                items: { type: "string" }
              },
              cautions: {
                type: "array",
                items: { type: "string" }
              },
              targetPrice: {
                type: "number"
              },
              stopPrice: {
                type: "number"
              },
              score: {
                type: "number"
              }
            },
            required: [
              "direction",
              "confidence",
              "action",
              "rationale",
              "riskLevel",
              "keySignals",
              "cautions",
              "targetPrice",
              "stopPrice",
              "score"
            ]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI 调用失败：HTTP ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const outputText = payload.output_text || extractResponseText(payload);
  let parsed;

  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI 返回内容不是有效 JSON");
  }

  return {
    ...localAnalysis,
    provider: "openai",
    model: OPENAI_MODEL,
    ai: {
      score: round2(parsed.score),
      direction: parsed.direction,
      action: parsed.action,
      confidence: clamp(round2(parsed.confidence), 1, 100),
      rationale: parsed.rationale,
      riskLevel: parsed.riskLevel,
      keySignals: Array.isArray(parsed.keySignals) ? parsed.keySignals : [],
      cautions: Array.isArray(parsed.cautions) ? parsed.cautions : [],
      targetPrice: roundMoney(parsed.targetPrice),
      stopPrice: roundMoney(parsed.stopPrice)
    }
  };
}

async function analyzeWithAnthropic(stock, localAnalysis) {
  const endpoint = new URL("/v1/messages", ensureTrailingSlash(ANTHROPIC_BASE_URL)).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": ANTHROPIC_AUTH_TOKEN,
      Authorization: `Bearer ${ANTHROPIC_AUTH_TOKEN}`
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system:
        "你是谨慎的 A 股模拟盘研究助手。只返回 JSON，不要输出 Markdown，不要承诺收益。",
      messages: [
        {
          role: "user",
          content: `请分析这只 A 股的短线走势，并只返回 JSON：${JSON.stringify(stock)}。JSON 字段必须包含 direction, confidence, action, rationale, riskLevel, keySignals, cautions, targetPrice, stopPrice, score。direction 只能是 看涨/看跌/震荡，riskLevel 只能是 低/中/高。`
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic 调用失败：HTTP ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const text = extractAnthropicText(payload);
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Anthropic 返回内容不是有效 JSON");
  }

  return {
    ...localAnalysis,
    provider: "anthropic",
    model: ANTHROPIC_MODEL,
    ai: {
      score: round2(parsed.score),
      direction: parsed.direction,
      action: parsed.action,
      confidence: clamp(round2(parsed.confidence), 1, 100),
      rationale: parsed.rationale,
      riskLevel: parsed.riskLevel,
      keySignals: Array.isArray(parsed.keySignals) ? parsed.keySignals : [],
      cautions: Array.isArray(parsed.cautions) ? parsed.cautions : [],
      targetPrice: roundMoney(parsed.targetPrice),
      stopPrice: roundMoney(parsed.stopPrice)
    }
  };
}

function extractResponseText(payload) {
  const first = payload.output?.[0];
  const content = first?.content?.find((item) => item.type === "output_text");
  return content?.text || "";
}

function extractAnthropicText(payload) {
  return (
    payload?.content?.find((item) => item.type === "text")?.text ||
    payload?.content?.[0]?.text ||
    ""
  );
}

function buildLocalAnalysis(stock) {
  const closes = stock.recentCloses.slice(-5);
  const average = closes.reduce((sum, value) => sum + value, 0) / closes.length;
  const momentum = ((closes.at(-1) - closes[0]) / closes[0]) * 100;
  const priceVsAverage = ((stock.currentPrice - average) / average) * 100;
  const volatility = calcVolatility(closes);

  let score = momentum * 1.25 + priceVsAverage * 0.9 - volatility * 0.6;
  let direction = "震荡";
  let action = "观察";
  let targetDelta = 0.03;

  if (score >= 4) {
    direction = "看涨";
    action = "尝试买入";
    targetDelta = 0.08;
  } else if (score <= -4) {
    direction = "看跌";
    action = "谨慎减仓";
    targetDelta = -0.07;
  }

  return {
    average: roundMoney(average),
    momentum: round2(momentum),
    volatility: round2(volatility),
    priceVsAverage: round2(priceVsAverage),
    ai: {
      score: round2(score),
      direction,
      action,
      confidence: clamp(round2(55 + Math.abs(score) * 4), 51, 92),
      rationale: summarizeRationale(momentum, volatility, priceVsAverage, direction),
      riskLevel: calcRiskLevel(volatility, Math.abs(priceVsAverage)),
      keySignals: buildKeySignals(momentum, priceVsAverage, volatility, direction),
      cautions: buildCautions(volatility, direction, priceVsAverage),
      targetPrice: roundMoney(stock.currentPrice * (1 + targetDelta)),
      stopPrice: roundMoney(
        stock.currentPrice * (direction === "看涨" ? 0.95 : direction === "看跌" ? 1.04 : 0.97)
      )
    }
  };
}

async function registerUser(username, password) {
  validateCredentials(username, password);
  const db = await readDb();
  if (db.users.some((user) => user.username === username)) {
    throw new Error("用户名已存在");
  }

  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const user = {
    id: randomId(),
    username,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
    portfolio: defaultPortfolioState()
  };

  db.users.push(user);
  await writeDb(db);
  return { user };
}

async function loginUser(username, password) {
  validateCredentials(username, password);
  const db = await readDb();
  const user = db.users.find((entry) => entry.username === username);
  if (!user) throw new Error("用户名或密码错误");

  const actual = Buffer.from(hashPassword(password, user.salt), "hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("用户名或密码错误");
  }

  return user;
}

async function createSession(userId) {
  const db = await readDb();
  const token = randomId();
  db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  db.sessions.push({
    token,
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  });
  await writeDb(db);
  return token;
}

async function destroySession(token) {
  if (!token) return;
  const db = await readDb();
  db.sessions = db.sessions.filter((session) => session.token !== token);
  await writeDb(db);
}

async function requireUser(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) throw new Error("未登录");

  const db = await readDb();
  const session = db.sessions.find(
    (entry) => entry.token === token && new Date(entry.expiresAt).getTime() > Date.now()
  );
  if (!session) throw new Error("登录已过期");

  const user = db.users.find((entry) => entry.id === session.userId);
  if (!user) throw new Error("用户不存在");
  return user;
}

async function savePortfolio(userId, state) {
  const db = await readDb();
  const user = db.users.find((entry) => entry.id === userId);
  if (!user) throw new Error("用户不存在");

  user.portfolio = sanitizePortfolioState(state);
  user.updatedAt = new Date().toISOString();
  await writeDb(db);
  return user.portfolio;
}

function sanitizePortfolioState(state) {
  return {
    cash: Number(state?.cash) || 100000,
    cart: Array.isArray(state?.cart) ? state.cart : [],
    holdings: Array.isArray(state?.holdings) ? state.holdings : [],
    trades: Array.isArray(state?.trades) ? state.trades : [],
    lastAnalysis: state?.lastAnalysis || null,
    analysisHistory: Array.isArray(state?.analysisHistory) ? state.analysisHistory.slice(0, 60) : [],
    settings: state?.settings || {
      marketApiUrl: "",
      aiProvider: "auto",
      aiApiUrl: "",
      apiToken: ""
    }
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null
  };
}

function defaultPortfolioState() {
  return {
    cash: 100000,
    cart: [],
    holdings: [],
    trades: [],
    lastAnalysis: null,
    analysisHistory: [],
    settings: {
      marketApiUrl: "",
      aiProvider: "auto",
      aiApiUrl: "",
      apiToken: ""
    }
  };
}

async function readDb() {
  const raw = await fs.readFile(DB_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

async function ensureDb() {
  await fs.mkdir(DB_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await writeDb({ users: [], sessions: [] });
  }
}

function validateCredentials(username, password) {
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{3,20}$/.test(username || "")) {
    throw new Error("用户名需为 3-20 位，可含中文、字母、数字、下划线");
  }
  if ((password || "").length < 6) {
    throw new Error("密码至少 6 位");
  }
}

function validateStockPayload(stock) {
  if (!stock || !/^\d{6}$/.test(stock.stockCode || stock.code || "")) {
    throw new Error("股票代码无效");
  }
}

function readCookie(req, name) {
  const source = req.headers.cookie || "";
  const cookies = source.split(/;\s*/).filter(Boolean);
  const hit = cookies.find((item) => item.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : "";
}

function serializeCookie(value) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; Max-Age=${
    SESSION_TTL_MS / 1000
  }; SameSite=Lax`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://localhost:" + PORT,
    "Access-Control-Allow-Credentials": "true"
  });
  res.end(JSON.stringify(payload));
}

function inferStatusCode(error) {
  const message = error?.message || "";
  if (/未登录|过期/.test(message)) return 401;
  if (/不存在/.test(message)) return 404;
  if (/无效|至少|必须|已存在|错误/.test(message)) return 400;
  return 500;
}

function getDefaultAiProvider() {
  if (ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL) return "anthropic";
  if (OPENAI_API_KEY) return "openai";
  return "local";
}

function normalizeProvider(value) {
  return ["auto", "anthropic", "openai", "local"].includes(value) ? value : "auto";
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function hashPassword(password, salt) {
  return scryptSync(password, salt + SESSION_SECRET, 64).toString("hex");
}

function randomId() {
  return randomBytes(24).toString("hex");
}

function guessMarket(code) {
  return code.startsWith("6") ? 1 : 0;
}

function normalizeEastMoneyPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return roundMoney(numeric / 100);
}

function calcVolatility(values) {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / average) * 100;
}

function summarizeRationale(momentum, volatility, priceVsAverage, direction) {
  const momentumText =
    momentum > 1.5 ? "短期动量偏强" : momentum < -1.5 ? "短期动量回落" : "短期动量中性";
  const priceText =
    priceVsAverage > 1.2 ? "现价高于均值" : priceVsAverage < -1.2 ? "现价弱于均值" : "现价贴近均值";
  const riskText =
    volatility > 3 ? "波动偏大，适合轻仓试探" : "波动可控，便于做跟踪比较";
  return `${momentumText}，${priceText}，${riskText}，AI 当前给出“${direction}”判断。`;
}

function calcRiskLevel(volatility, priceGap) {
  if (volatility > 3.5 || priceGap > 4) return "高";
  if (volatility > 2 || priceGap > 2) return "中";
  return "低";
}

function buildKeySignals(momentum, priceVsAverage, volatility, direction) {
  return [
    momentum > 1.5 ? "最近收盘序列呈现上行动量" : momentum < -1.5 ? "最近收盘序列呈现回落动量" : "最近收盘序列偏中性",
    priceVsAverage > 1 ? "现价高于短期均值，说明买盘偏强" : priceVsAverage < -1 ? "现价低于短期均值，说明承压较明显" : "现价围绕短期均值波动",
    volatility > 3 ? "短线波动较大，盈亏变化会更快" : "短线波动相对可控，更适合做模拟跟踪",
    `综合信号偏向${direction}`
  ];
}

function buildCautions(volatility, direction, priceVsAverage) {
  const cautions = [];
  if (volatility > 3) cautions.push("波动率偏高，建议轻仓模拟，不要把单次结果当成稳定结论。");
  if (direction === "看涨" && priceVsAverage > 3) cautions.push("价格已明显高于均值，追高后可能出现回撤。");
  if (direction === "看跌" && priceVsAverage < -3) cautions.push("价格已经较弱，继续杀跌的空间可能有限。");
  if (!cautions.length) cautions.push("当前信号较温和，适合继续观察真实市场反馈。");
  return cautions;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function loadEnv(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
  } catch {
    return {};
  }
}
