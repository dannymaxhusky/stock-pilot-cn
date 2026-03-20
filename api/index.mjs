const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "";
const ANTHROPIC_AUTH_TOKEN =
  process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const routedPath = url.searchParams.get("path") || "";
      const pathname = `/api/${routedPath}`.replace(/\/+$/, "");

      if (request.method === "GET" && pathname === "/api/config") {
        return json({
          hasOpenAIKey: Boolean(OPENAI_API_KEY),
          openaiModel: OPENAI_MODEL,
          hasAnthropicKey: Boolean(ANTHROPIC_AUTH_TOKEN),
          anthropicModel: ANTHROPIC_MODEL,
          defaultAiProvider: getDefaultAiProvider(),
          availableProviders: buildAvailableProviders()
        });
      }

      if (request.method === "GET" && pathname === "/api/search") {
        const query = url.searchParams.get("q") || "";
        const items = await searchStocks(query);
        return json({ items });
      }

      if (request.method === "GET" && pathname === "/api/quote") {
        const code = url.searchParams.get("code") || "";
        const quote = await fetchMarketQuote(code);
        return json(quote);
      }

      if (request.method === "GET" && pathname === "/api/movers") {
        const type = url.searchParams.get("type") || "gainers";
        const items = await fetchMarketMovers(type);
        return json({ items });
      }

      if (request.method === "GET" && pathname === "/api/indices") {
        const items = await fetchMarketIndices();
        return json({ items });
      }

      if (request.method === "POST" && pathname === "/api/ai/analyze") {
        const payload = await request.json();
        const analysis = await analyzeWithAi(payload);
        return json(analysis);
      }

      if (pathname.startsWith("/api/auth/") || pathname === "/api/portfolio") {
        return json(
          {
            error: "Vercel 测试版暂不提供登录和云同步，请先使用选股排行榜和单股分析。"
          },
          501
        );
      }

      return json({ error: "接口不存在" }, 404);
    } catch (error) {
      return json({ error: error.message || "服务器错误" }, inferStatusCode(error));
    }
  }
};

async function fetchMarketQuote(code) {
  if (!/^\d{6}$/.test(code)) {
    throw new Error("股票代码必须是 6 位数字");
  }

  const secid = `${guessMarket(code)}.${code}`;
  const headers = {
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
    fetch(quoteUrl, { headers }),
    fetch(historyUrl, { headers })
  ]);

  if (!quoteResponse.ok || !historyResponse.ok) {
    throw new Error(`行情源返回异常：${quoteResponse.status}/${historyResponse.status}`);
  }

  const quotePayload = await quoteResponse.json();
  const historyPayload = await historyResponse.json();
  const quoteData = quotePayload?.data;
  const rows = historyPayload?.data?.klines;

  if (!quoteData || !Array.isArray(rows) || !rows.length) {
    throw new Error("行情源未返回有效数据");
  }

  return {
    code,
    name: quoteData.f58 || quoteData.f57 || code,
    currentPrice: normalizeEastMoneyPrice(quoteData.f43),
    changePercent: normalizeEastMoneyPrice(quoteData.f170),
    amplitude: normalizeEastMoneyPrice(quoteData.f171),
    candles: rows.slice(-12).map((row) => {
      const [date, open, close, high, low] = String(row).split(",");
      return {
        date,
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low)
      };
    }),
    closes: rows
      .slice(-5)
      .map((row) => Number(String(row).split(",")[2]))
      .filter((value) => Number.isFinite(value) && value > 0)
  };
}

async function fetchMarketMovers(type) {
  const fid = "f3";
  const fs = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";
  const url = new URL("https://push2.eastmoney.com/api/qt/clist/get");
  url.searchParams.set("pn", "1");
  url.searchParams.set("pz", "10");
  url.searchParams.set("po", type === "losers" ? "1" : "0");
  url.searchParams.set("np", "1");
  url.searchParams.set("ut", "bd1d9ddb04089700cf9c27f6f7426281");
  url.searchParams.set("fltt", "2");
  url.searchParams.set("invt", "2");
  url.searchParams.set("fid", fid);
  url.searchParams.set("fs", fs);
  url.searchParams.set("fields", "f2,f3,f12,f14,f6");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 StockPilotCN/1.0",
      Referer: "https://quote.eastmoney.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`榜单接口异常：HTTP ${response.status}`);
  }

  const payload = await response.json();
  const diff = payload?.data?.diff || [];
  return diff.map((item) => ({
    code: item.f12,
    name: item.f14,
    currentPrice: Number(item.f2),
    changePercent: Number(item.f3),
    amount: Number(item.f6)
  }));
}

async function fetchMarketIndices() {
  const targets = [
    { code: "000001", name: "上证指数", secid: "1.000001" },
    { code: "399001", name: "深证成指", secid: "0.399001" },
    { code: "399006", name: "创业板指", secid: "0.399006" }
  ];

  const headers = {
    "User-Agent": "Mozilla/5.0 StockPilotCN/1.0",
    Referer: "https://quote.eastmoney.com/"
  };

  const items = await Promise.all(
    targets.map(async (target) => {
      const url = new URL("https://push2.eastmoney.com/api/qt/stock/get");
      url.searchParams.set("secid", target.secid);
      url.searchParams.set("fields", "f43,f57,f58,f169,f170");
      url.searchParams.set("ut", "fa5fd1943c7b386f172d6893dbfba10b");
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`指数接口异常：HTTP ${response.status}`);
      const payload = await response.json();
      const data = payload?.data;
      if (!data) throw new Error("指数接口未返回有效数据");
      return {
        code: target.code,
        name: data.f58 || target.name,
        currentPrice: normalizeEastMoneyPrice(data.f43),
        changePercent: normalizeEastMoneyPrice(data.f170)
      };
    })
  );

  return items;
}

async function searchStocks(query) {
  const keyword = String(query || "").trim();
  if (!keyword) return [];

  if (/^\d{6}$/.test(keyword)) {
    const quote = await fetchMarketQuote(keyword);
    return [{ code: quote.code, name: quote.name }];
  }

  const url = new URL("https://searchapi.eastmoney.com/api/suggest/get");
  url.searchParams.set("input", keyword);
  url.searchParams.set("type", "14");
  url.searchParams.set("token", "D43BF722C8E33BDC906FB84D85E326E8");
  url.searchParams.set("count", "10");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 StockPilotCN/1.0",
      Referer: "https://quote.eastmoney.com/"
    }
  });

  if (!response.ok) throw new Error(`搜索接口异常：HTTP ${response.status}`);
  const payload = await response.json();
  const quotations = payload?.QuotationCodeTable?.Data || payload?.Data || [];

  return quotations
    .map((item) => ({
      code: item.Code || item.SECURITY_CODE || item.code,
      name: item.Name || item.SECURITY_NAME_ABBR || item.name
    }))
    .filter((item) => /^\d{6}$/.test(item.code))
    .slice(0, 8);
}

async function analyzeWithAi(stock) {
  validateStockPayload(stock);
  const localAnalysis = buildLocalAnalysis(stock);
  const provider = normalizeProvider(stock.provider);

  if (provider === "local") {
    return { ...localAnalysis, provider: "local", model: "rule-engine" };
  }

  if (provider === "anthropic") {
    if (!(ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL)) throw new Error("Anthropic 当前不可用");
    return analyzeWithAnthropic(stock, localAnalysis);
  }

  if (provider === "openai") {
    if (!OPENAI_API_KEY) throw new Error("OpenAI 当前不可用");
    return analyzeWithOpenAI(stock, localAnalysis);
  }

  if (ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL) return analyzeWithAnthropic(stock, localAnalysis);
  if (OPENAI_API_KEY) return analyzeWithOpenAI(stock, localAnalysis);
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
        "你是谨慎的 A 股助手。只返回 JSON，不要输出 Markdown，不要承诺收益。",
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
              direction: { type: "string", enum: ["看涨", "看跌", "震荡"] },
              confidence: { type: "number", minimum: 0, maximum: 100 },
              action: { type: "string" },
              rationale: { type: "string" },
              riskLevel: { type: "string", enum: ["低", "中", "高"] },
              keySignals: { type: "array", items: { type: "string" } },
              cautions: { type: "array", items: { type: "string" } },
              targetPrice: { type: "number" },
              stopPrice: { type: "number" },
              score: { type: "number" }
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

  if (!response.ok) throw new Error(`OpenAI 调用失败：HTTP ${response.status}`);
  const payload = await response.json();
  const outputText = payload.output_text || extractOpenAiText(payload);
  const parsed = JSON.parse(outputText);
  return mergeAiResult(localAnalysis, parsed, "openai", OPENAI_MODEL);
}

async function analyzeWithAnthropic(stock, localAnalysis) {
  const endpoint = new URL("/v1/messages", ensureTrailingSlash(ANTHROPIC_BASE_URL)).toString();
  console.log(
    `[Anthropic request] endpoint=${endpoint} model=${ANTHROPIC_MODEL} code=${stock.stockCode || stock.code || ""}`
  );
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
      system: "你是谨慎的 A 股助手。只返回 JSON，不要输出 Markdown，不要承诺收益。",
      messages: [
        {
          role: "user",
          content: `请分析这只 A 股的短线走势，并只返回 JSON：${JSON.stringify(stock)}。JSON 字段必须包含 direction, confidence, action, rationale, riskLevel, keySignals, cautions, targetPrice, stopPrice, score。`
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `[Anthropic error] status=${response.status} endpoint=${endpoint} model=${ANTHROPIC_MODEL} body=${errorText.slice(0, 600)}`
    );
    throw new Error(`Anthropic 调用失败：HTTP ${response.status} ${errorText.slice(0, 200)}`);
  }
  const payload = await response.json();
  const rawText = extractAnthropicText(payload);
  let parsed;

  try {
    parsed = parseLooseJson(rawText);
  } catch {
    console.error(
      `[Anthropic parse error] endpoint=${endpoint} model=${ANTHROPIC_MODEL} text=${String(rawText).slice(0, 600)}`
    );
    throw new Error("Anthropic 返回内容不是有效 JSON");
  }
  return mergeAiResult(localAnalysis, parsed, "anthropic", ANTHROPIC_MODEL);
}

function mergeAiResult(localAnalysis, parsed, provider, model) {
  return {
    ...localAnalysis,
    provider,
    model,
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

function buildLocalAnalysis(stock) {
  const closes = stock.recentCloses || stock.closes || [];
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
    action = "尝试关注";
    targetDelta = 0.08;
  } else if (score <= -4) {
    direction = "看跌";
    action = "先回避";
    targetDelta = -0.07;
  }

  return {
    average: roundMoney(average),
    momentum: round2(momentum),
    volatility: round2(volatility),
    priceVsAverage: round2(priceVsAverage),
    currentPrice: roundMoney(stock.currentPrice),
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

function extractOpenAiText(payload) {
  return payload.output?.[0]?.content?.find((item) => item.type === "output_text")?.text || "";
}

function extractAnthropicText(payload) {
  return payload?.content?.find((item) => item.type === "text")?.text || payload?.content?.[0]?.text || "";
}

function parseLooseJson(text) {
  const source = String(text || "").trim();
  if (!source) throw new Error("empty-json");

  try {
    return JSON.parse(source);
  } catch {}

  const fenced = source.match(/```json\s*([\s\S]*?)\s*```/i) || source.match(/```\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(source.slice(start, end + 1));
  }

  throw new Error("unparseable-json");
}

function validateStockPayload(stock) {
  if (!stock || !/^\d{6}$/.test(stock.stockCode || stock.code || "")) {
    throw new Error("股票代码无效");
  }
}

function normalizeProvider(value) {
  return ["auto", "anthropic", "openai", "local"].includes(value) ? value : "auto";
}

function getDefaultAiProvider() {
  if (ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL) return "anthropic";
  if (OPENAI_API_KEY) return "openai";
  return "local";
}

function buildAvailableProviders() {
  const providers = [{ id: "local", label: "基础分析" }];
  if (ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL) {
    providers.unshift({ id: "anthropic", label: "Anthropic" });
  }
  if (OPENAI_API_KEY) {
    providers.unshift({ id: "openai", label: "OpenAI" });
  }
  return providers;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function guessMarket(code) {
  return code.startsWith("6") ? 1 : 0;
}

function normalizeEastMoneyPrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundMoney(numeric / 100) : 0;
}

function calcVolatility(values) {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / average) * 100;
}

function summarizeRationale(momentum, volatility, priceVsAverage, direction) {
  const momentumText =
    momentum > 1.5 ? "短期动量偏强" : momentum < -1.5 ? "短期动量回落" : "短期动量中性";
  const priceText =
    priceVsAverage > 1.2 ? "现价高于均值" : priceVsAverage < -1.2 ? "现价弱于均值" : "现价贴近均值";
  const riskText = volatility > 3 ? "波动偏大" : "波动可控";
  return `${momentumText}，${priceText}，${riskText}，综合判断为“${direction}”。`;
}

function calcRiskLevel(volatility, priceGap) {
  if (volatility > 3.5 || priceGap > 4) return "高";
  if (volatility > 2 || priceGap > 2) return "中";
  return "低";
}

function buildKeySignals(momentum, priceVsAverage, volatility, direction) {
  return [
    momentum > 1.5 ? "最近收盘序列维持上行动量。" : momentum < -1.5 ? "最近收盘序列呈现回落动量。" : "最近收盘序列以整理为主。",
    priceVsAverage > 1 ? "现价高于短期均值，买盘相对占优。" : priceVsAverage < -1 ? "现价低于短期均值，短线承压更明显。" : "现价和短期均值接近。",
    volatility > 3 ? "波动较大，预测结果敏感度更高。" : "波动相对平稳。",
    `综合判断偏向${direction}。`
  ];
}

function buildCautions(volatility, direction, priceVsAverage) {
  const cautions = [];
  if (volatility > 3) cautions.push("短线振幅偏大，建议谨慎参考。");
  if (direction === "看涨" && priceVsAverage > 3) cautions.push("当前价格高于均值较多，追高风险上升。");
  if (direction === "看跌" && priceVsAverage < -3) cautions.push("价格已明显走弱，但继续下探空间可能有限。");
  if (!cautions.length) cautions.push("当前风险相对温和，可继续观察。");
  return cautions;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function inferStatusCode(error) {
  const message = error?.message || "";
  if (/不可用|无效|必须/.test(message)) return 400;
  if (/不存在/.test(message)) return 404;
  return 500;
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
