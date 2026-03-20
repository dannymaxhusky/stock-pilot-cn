const STORAGE_KEY = "stock-pilot-cn-state-v2";
const INITIAL_CASH = 100000;
const API_BASE = "/api";

const SAMPLE_STOCKS = [
  { code: "600519", name: "贵州茅台", currentPrice: 1678.2, closes: [1602.5, 1618.0, 1636.6, 1650.2, 1671.8] },
  { code: "000001", name: "平安银行", currentPrice: 11.28, closes: [10.88, 10.95, 11.02, 11.15, 11.22] },
  { code: "300750", name: "宁德时代", currentPrice: 182.5, closes: [189.8, 186.2, 184.9, 183.4, 181.6] }
];

const els = {
  stockForm: document.querySelector("#stockForm"),
  rankingForm: document.querySelector("#rankingForm"),
  rankingCodes: document.querySelector("#rankingCodes"),
  fillRankingSampleBtn: document.querySelector("#fillRankingSampleBtn"),
  rankingSummary: document.querySelector("#rankingSummary"),
  ranking5List: document.querySelector("#ranking5List"),
  ranking10List: document.querySelector("#ranking10List"),
  watchlistSearchForm: document.querySelector("#watchlistSearchForm"),
  watchlistQuery: document.querySelector("#watchlistQuery"),
  watchlistMessage: document.querySelector("#watchlistMessage"),
  watchlistList: document.querySelector("#watchlistList"),
  marketStrip: document.querySelector("#marketStrip"),
  marketTopGainers: document.querySelector("#marketTopGainers"),
  marketTopLosers: document.querySelector("#marketTopLosers"),
  futureTop5: document.querySelector("#futureTop5"),
  futureTop10: document.querySelector("#futureTop10"),
  stockCode: document.querySelector("#stockCode"),
  stockName: document.querySelector("#stockName"),
  currentPrice: document.querySelector("#currentPrice"),
  recentCloses: document.querySelector("#recentCloses"),
  fillSampleBtn: document.querySelector("#fillSampleBtn"),
  fetchQuoteBtn: document.querySelector("#fetchQuoteBtn"),
  remoteAiBtn: document.querySelector("#remoteAiBtn"),
  analysisCard: document.querySelector("#analysisCard"),
  cartList: document.querySelector("#cartList"),
  portfolioList: document.querySelector("#portfolioList"),
  tradeList: document.querySelector("#tradeList"),
  reviewPanel: document.querySelector("#reviewPanel"),
  reportCard: document.querySelector("#reportCard"),
  cashValue: document.querySelector("#cashValue"),
  holdingsValue: document.querySelector("#holdingsValue"),
  equityValue: document.querySelector("#equityValue"),
  profitValue: document.querySelector("#profitValue"),
  resetDataBtn: document.querySelector("#resetDataBtn"),
  installBtn: document.querySelector("#installBtn"),
  marketApiUrl: document.querySelector("#marketApiUrl"),
  aiProvider: document.querySelector("#aiProvider"),
  aiApiUrl: document.querySelector("#aiApiUrl"),
  apiToken: document.querySelector("#apiToken"),
  settingsForm: document.querySelector("#settingsForm"),
  profileForm: document.querySelector("#profileForm"),
  profileName: document.querySelector("#profileName"),
  profileCity: document.querySelector("#profileCity"),
  profileRisk: document.querySelector("#profileRisk"),
  tradeLotSize: document.querySelector("#tradeLotSize"),
  userSummary: document.querySelector("#userSummary"),
  modelSummary: document.querySelector("#modelSummary"),
  reportCharts: document.querySelector("#reportCharts"),
  configHint: document.querySelector("#configHint"),
  bottomNav: document.querySelector("#bottomNav"),
  tabSections: document.querySelectorAll("[data-tab]")
};

let deferredPrompt = null;
let serverConfig = {
  hasOpenAIKey: false,
  openaiModel: "",
  hasAnthropicKey: false,
  anthropicModel: "",
  defaultAiProvider: "local",
  availableProviders: [{ id: "local", label: "基础分析" }]
};
let appState = loadState();

boot();

async function boot() {
  bindEvents();
  registerServiceWorker();
  await Promise.all([loadServerConfig(), loadMovers(), loadIndices()]);
  syncRankingsFromWatchlist();
  renderAll();
}

function bindEvents() {
  els.watchlistSearchForm.addEventListener("submit", handleWatchlistSearch);
  if (els.rankingForm) els.rankingForm.addEventListener("submit", handleRankingSubmit);
  if (els.fillRankingSampleBtn) els.fillRankingSampleBtn.addEventListener("click", fillRankingSample);
  if (els.stockForm) els.stockForm.addEventListener("submit", handleAnalyze);
  if (els.fillSampleBtn) els.fillSampleBtn.addEventListener("click", fillSample);
  if (els.fetchQuoteBtn) els.fetchQuoteBtn.addEventListener("click", handleFetchQuote);
  if (els.remoteAiBtn) els.remoteAiBtn.addEventListener("click", handleRemoteAnalyze);
  els.resetDataBtn.addEventListener("click", resetPortfolioOnly);
  if (els.settingsForm) els.settingsForm.addEventListener("submit", handleSaveSettings);
  els.profileForm.addEventListener("submit", handleSaveProfile);
  els.watchlistList.addEventListener("click", handleWatchlistAction);
  els.watchlistList.addEventListener("click", handleChartTooltipToggle);
  els.watchlistList.addEventListener("pointerleave", handleChartTooltipLeave);
  els.cartList.addEventListener("click", handleCartAction);
  els.portfolioList.addEventListener("click", handlePortfolioAction);
  els.tradeList.addEventListener("click", handleTradeAction);
  els.bottomNav.addEventListener("click", handleTabChange);
  if (els.ranking5List) els.ranking5List.addEventListener("click", handleOpenFromRanking);
  if (els.ranking10List) els.ranking10List.addEventListener("click", handleOpenFromRanking);
  if (els.futureTop5) els.futureTop5.addEventListener("click", handleOpenFromRanking);
  if (els.futureTop10) els.futureTop10.addEventListener("click", handleOpenFromRanking);
  if (els.marketTopGainers) els.marketTopGainers.addEventListener("click", handleOpenFromRanking);
  if (els.marketTopLosers) els.marketTopLosers.addEventListener("click", handleOpenFromRanking);
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  els.installBtn.addEventListener("click", installPwa);
}

function handleTabChange(event) {
  const button = event.target.closest("[data-tab-target]");
  if (!button) return;
  appState.activeTab = button.dataset.tabTarget;
  saveState();
  renderTabs();
}

function handleOpenFromRanking(event) {
  const button = event.target.closest("[data-rank-action]");
  if (!button) return;
  const code = button.dataset.openCode;
  const name = button.dataset.openName || "";
  if (!code) return;

  if (button.dataset.rankAction === "view") {
    openStockFromList(code, name);
    return;
  }

  addStockFromRanking(code, name);
}

function loadState() {
  const fallback = defaultState();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
      profile: { ...fallback.profile, ...(parsed.profile || {}) },
      auth: { ...fallback.auth, ...(parsed.auth || {}) }
    };
  } catch {
    return fallback;
  }
}

function defaultState() {
  return {
    cash: INITIAL_CASH,
    rankings: {
      horizon5: [],
      horizon10: [],
      updatedAt: null
    },
    movers: {
      gainers: [],
      losers: [],
      updatedAt: null
    },
    indices: [],
    watchlist: [],
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
    },
    profile: {
      name: "股友",
      city: "",
      riskPreference: "稳健",
      tradeLotSize: 100
    },
    auth: {
      user: null,
      cloudSyncedAt: null
    },
    reviewCode: "",
    activeTab: "watchlist",
    expandedWatchCode: ""
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

async function loadServerConfig() {
  try {
    serverConfig = await apiRequest("/config");
  } catch {
    serverConfig = {
      hasOpenAIKey: false,
      openaiModel: "",
      hasAnthropicKey: false,
      anthropicModel: "",
      defaultAiProvider: "local",
      availableProviders: [{ id: "local", label: "基础分析" }]
    };
  }
}

async function restoreSession() {
  try {
    const session = await apiRequest("/auth/session");
    appState.auth.user = session.user;
    const cloud = await apiRequest("/portfolio");
    mergeCloudPortfolio(cloud.portfolio);
  } catch {
    appState.auth.user = null;
  }
}

function handleSaveSettings(event) {
  event.preventDefault();
  appState.settings.marketApiUrl = els.marketApiUrl.value.trim();
  appState.settings.aiProvider = els.aiProvider.value;
  appState.settings.aiApiUrl = els.aiApiUrl.value.trim();
  appState.settings.apiToken = els.apiToken.value.trim();
  saveState();
  renderNotice("接口设置已保存。默认情况下，程序会优先调用内置服务端代理。");
  renderSettings();
}

function handleSaveProfile(event) {
  event.preventDefault();
  appState.profile.name = els.profileName.value.trim() || "股友";
  appState.profile.city = els.profileCity.value.trim();
  appState.profile.riskPreference = els.profileRisk.value || "稳健";
  appState.profile.tradeLotSize = normalizeTradeLotSize(els.tradeLotSize.value);
  saveState();
  renderUserPanel();
  renderCart();
  renderNotice("用户信息已保存，模拟交易参数已更新。");
}

function fillSample() {
  const sample = SAMPLE_STOCKS[Math.floor(Math.random() * SAMPLE_STOCKS.length)];
  els.stockCode.value = sample.code;
  els.stockName.value = sample.name;
  els.currentPrice.value = sample.currentPrice;
  els.recentCloses.value = sample.closes.join(", ");
}

function fillRankingSample() {
  els.rankingCodes.value = SAMPLE_STOCKS.map((item) => item.code).join("\n");
}

async function handleWatchlistSearch(event) {
  event.preventDefault();
  const query = els.watchlistQuery.value.trim();
  if (!query) {
    els.watchlistMessage.textContent = "请输入股票代码或名称。";
    return;
  }

  const button = event.submitter || els.watchlistSearchForm.querySelector(".primary-btn");

  try {
    setBusyState(button, true, "查询中...");
    const candidates = await searchStocks(query);
    if (!candidates.length) {
      els.watchlistMessage.textContent = "没有找到对应股票，请换一个代码或名称试试。";
      return;
    }

    const target = candidates[0];
    await addToWatchlist(target.code, target.name);
    els.watchlistQuery.value = "";
    els.watchlistMessage.textContent = `已加入 ${target.name}（${target.code}）到关注清单。`;
  } catch (error) {
    els.watchlistMessage.textContent = `加入失败：${error.message}`;
  } finally {
    setBusyState(button, false, "加入关注清单");
  }
}

async function searchStocks(query) {
  const keyword = query.trim();
  if (/^\d{6}$/.test(keyword)) {
    const quote = await fetchQuote(keyword);
    return [{ code: quote.code || keyword, name: quote.name || keyword }];
  }

  const result = await apiRequest(`/search?q=${encodeURIComponent(keyword)}`);
  return result.items || [];
}

async function addToWatchlist(code, name) {
  const quote = await fetchQuote(code);
  const predictions = await buildModelPredictions({
    code,
    name: name || quote.name || code,
    currentPrice: quote.currentPrice,
    closes: quote.closes
  });

  const watchItem = {
    code,
    name: name || quote.name || code,
    currentPrice: quote.currentPrice,
    changePercent: quote.changePercent,
    candles: quote.candles || buildFallbackCandles(quote.closes || []),
    closes: quote.closes,
    predictions,
    updatedAt: new Date().toISOString()
  };

  const index = appState.watchlist.findIndex((item) => item.code === code);
  if (index >= 0) appState.watchlist[index] = watchItem;
  else appState.watchlist.unshift(watchItem);
  appState.expandedWatchCode = code;
  syncRankingsFromWatchlist();
  saveState();
  renderWatchlist();
}

async function buildModelPredictions(stock) {
  const providers = serverConfig.availableProviders?.length
    ? serverConfig.availableProviders.map((item) => item.id)
    : [serverConfig.defaultAiProvider || "local"];

  const uniqueProviders = [...new Set(providers.filter(Boolean))];
  const results = await Promise.all(
    uniqueProviders.map(async (provider) => {
      try {
        const result = await apiRequest("/ai/analyze", {
          method: "POST",
          body: JSON.stringify({
            provider,
            stockCode: stock.code,
            stockName: stock.name,
            currentPrice: stock.currentPrice,
            recentCloses: stock.closes
          })
        });
        return {
          provider: result.provider,
          model: result.model,
          direction: result.ai.direction,
          confidence: result.ai.confidence,
          targetPrice: result.ai.targetPrice,
          riskLevel: result.ai.riskLevel,
          rationale: result.ai.rationale
        };
      } catch (error) {
        console.error(`[AI fallback] provider=${provider} code=${stock.code} message=${error.message}`);
        const local = buildLocalAnalysis(stock, "local");
        return {
          provider: "local",
          model: `fallback-from-${provider}`,
          direction: local.ai.direction,
          confidence: local.ai.confidence,
          targetPrice: local.ai.targetPrice,
          riskLevel: local.ai.riskLevel,
          rationale: `${local.ai.rationale}（${renderProviderName(provider)} 调用失败，已回退到基础分析）`
        };
      }
    })
  );

  const externalProviders = new Set(
    results
      .map((item) => item.provider)
      .filter((provider) => provider === "openai" || provider === "anthropic")
  );

  if (externalProviders.has("openai") && externalProviders.has("anthropic")) {
    return results.filter((item) => item.provider !== "local");
  }

  return results;
}

function handleWatchlistAction(event) {
  const actionTarget = event.target.closest("[data-action][data-code]");
  if (!actionTarget) return;
  const code = actionTarget.dataset.code;
  if (!code) return;

  if (actionTarget.dataset.action === "toggle-watch") {
    appState.expandedWatchCode = appState.expandedWatchCode === code ? "" : code;
  }

  if (actionTarget.dataset.action === "remove-watch") {
    appState.watchlist = appState.watchlist.filter((item) => item.code !== code);
    if (appState.expandedWatchCode === code) appState.expandedWatchCode = "";
    syncRankingsFromWatchlist();
  }

  if (actionTarget.dataset.action === "refresh-watch") {
    refreshWatchItem(code);
    return;
  }

  if (actionTarget.dataset.action === "add-watch-cart") {
    addWatchToCart(code);
    return;
  }

  saveState();
  renderWatchlist();
}

function handleChartTooltipToggle(event) {
  const hotspot = event.target.closest(".chart-hit");
  if (!hotspot) return;

  const shell = hotspot.closest(".chart-shell");
  const tooltip = shell?.querySelector(".chart-tooltip");
  if (!shell || !tooltip) return;

  const title = hotspot.dataset.tipTitle || "";
  const body = hotspot.dataset.tipBody || "";
  const x = Number(hotspot.dataset.tipX || 180);
  const y = Number(hotspot.dataset.tipY || 20);
  const placement = hotspot.dataset.tipPlacement || "top";

  tooltip.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(body)}</span>
  `;
  tooltip.hidden = false;
  tooltip.dataset.placement = placement;
  tooltip.style.left = `${Math.min(Math.max(x, 84), 276)}px`;
  tooltip.style.top = `${Math.min(Math.max(y, 18), 188)}px`;
}

function handleChartTooltipLeave(event) {
  const shell = event.target.closest(".chart-shell");
  if (!shell) return;
  const tooltip = shell.querySelector(".chart-tooltip");
  if (tooltip) tooltip.hidden = true;
}

async function openStockFromList(code, name) {
  appState.activeTab = "watchlist";
  saveState();
  renderTabs();
  els.watchlistMessage.textContent = `正在打开 ${name || code}...`;
  try {
    await addToWatchlist(code, name);
    els.watchlistMessage.textContent = `${name || code} 已展开详细预测。`;
  } catch (error) {
    els.watchlistMessage.textContent = `打开失败：${error.message}`;
  }
}

async function addStockFromRanking(code, name) {
  const exists = appState.watchlist.some((item) => item.code === code);
  if (exists) {
    els.watchlistMessage.textContent = `${name || code} 已经在自选里了。`;
    renderMovers();
    renderRankings();
    return;
  }

  try {
    await addToWatchlist(code, name);
    els.watchlistMessage.textContent = `${name || code} 已加入自选，可在“自选预测”里查看详情。`;
    renderMovers();
    renderRankings();
  } catch (error) {
    els.watchlistMessage.textContent = `加入自选失败：${error.message}`;
  }
}

async function refreshWatchItem(code) {
  const item = appState.watchlist.find((entry) => entry.code === code);
  if (!item) return;
  try {
    els.watchlistMessage.textContent = `正在更新 ${item.name}...`;
    await addToWatchlist(item.code, item.name);
    els.watchlistMessage.textContent = `${item.name} 已更新最新行情与预测。`;
  } catch (error) {
    els.watchlistMessage.textContent = `更新失败：${error.message}`;
  }
}

function addWatchToCart(code) {
  const item = appState.watchlist.find((entry) => entry.code === code);
  if (!item) return;
  const prediction = item.predictions?.[0];
  if (!prediction) {
    els.watchlistMessage.textContent = "当前股票还没有可用预测，暂时不能加入虚拟交易。";
    return;
  }

  const cartItem = {
    id: crypto.randomUUID(),
    code: item.code,
    name: item.name,
    currentPrice: item.currentPrice,
    closes: item.closes,
    analyzedAt: item.updatedAt || new Date().toISOString(),
    provider: prediction.provider,
    model: prediction.model,
    ai: {
      direction: prediction.direction,
      confidence: prediction.confidence,
      targetPrice: prediction.targetPrice,
      riskLevel: prediction.riskLevel,
      rationale: prediction.rationale
    }
  };

  const index = appState.cart.findIndex((entry) => entry.code === code);
  if (index >= 0) appState.cart[index] = cartItem;
  else appState.cart.unshift(cartItem);
  appState.activeTab = "trade";
  saveState();
  renderAll();
  els.watchlistMessage.textContent = `${item.name} 已加入虚拟交易购物车。`;
}

async function handleFetchQuote() {
  const code = sanitizeCode(els.stockCode.value);
  if (!code) {
    renderNotice("先输入 6 位大陆股票代码，再拉取行情。");
    return;
  }

  try {
    setBusyState(els.fetchQuoteBtn, true, "拉取中...");
    const quote = await fetchQuote(code);
    els.stockName.value = quote.name || els.stockName.value;
    els.currentPrice.value = quote.currentPrice;
    els.recentCloses.value = quote.closes.join(", ");
    renderNotice(`已拉取 ${quote.name || code} 的最新行情。`);
  } catch (error) {
    renderNotice(`行情拉取失败：${error.message}`);
  } finally {
    setBusyState(els.fetchQuoteBtn, false, "拉取行情");
  }
}

async function handleAnalyze(event) {
  event.preventDefault();
  const stock = readStockInput();
  if (!stock) return;
  persistAnalysis(buildLocalAnalysis(stock, "local"));
}

async function handleRankingSubmit(event) {
  event.preventDefault();
  const codes = parseRankingCodes(els.rankingCodes.value);
  if (!codes.length) {
    els.rankingSummary.textContent = "请先输入股票代码，再生成排序。";
    return;
  }

  const button = event.submitter || els.rankingForm.querySelector(".primary-btn");

  try {
    setBusyState(button, true, "生成中...");
    els.rankingSummary.textContent = `正在分析 ${codes.length} 只股票，请稍候...`;
    const candidates = await Promise.all(codes.map((code) => buildRankingCandidate(code)));
    const valid = candidates.filter(Boolean);
    appState.rankings = {
      horizon5: sortRanking(valid, "predicted5d"),
      horizon10: sortRanking(valid, "predicted10d"),
      updatedAt: new Date().toISOString()
    };
    saveState();
    renderRankings();
    els.rankingSummary.textContent = `已完成 ${valid.length} 只股票的排序。`;
  } catch (error) {
    els.rankingSummary.textContent = `生成排序失败：${error.message}`;
  } finally {
    setBusyState(button, false, "生成涨幅排序");
  }
}

function parseRankingCodes(value) {
  return [...new Set((value || "")
    .split(/[\n,\s，]+/)
    .map((item) => item.trim())
    .filter((item) => /^\d{6}$/.test(item)))].slice(0, 20);
}

async function buildRankingCandidate(code) {
  let quote;
  try {
    quote = await fetchQuote(code);
  } catch {
    const sample = SAMPLE_STOCKS.find((item) => item.code === code);
    quote = sample
      ? {
          code: sample.code,
          name: sample.name,
          currentPrice: sample.currentPrice,
          closes: sample.closes
        }
      : null;
  }

  if (!quote || !Array.isArray(quote.closes) || quote.closes.length < 3) return null;

  const stock = {
    code,
    name: quote.name || code,
    currentPrice: Number(quote.currentPrice),
    closes: quote.closes
  };

  let analysis;
  try {
    analysis = await requestAiAnalysis(stock);
  } catch {
    analysis = buildLocalAnalysis(stock, "local-ranking");
  }

  return {
    code: stock.code,
    name: stock.name,
    currentPrice: stock.currentPrice,
    provider: analysis.provider,
    direction: analysis.ai.direction,
    confidence: analysis.ai.confidence,
    riskLevel: analysis.ai.riskLevel,
    predicted5d: calculateProjectedGain(analysis, 5),
    predicted10d: calculateProjectedGain(analysis, 10)
  };
}

function calculateProjectedGain(analysis, days) {
  const directionFactor =
    analysis.ai.direction === "看涨" ? 1 : analysis.ai.direction === "震荡" ? 0.35 : -0.6;
  const confidenceFactor = analysis.ai.confidence / 100;
  const riskPenalty =
    analysis.ai.riskLevel === "高" ? 0.75 : analysis.ai.riskLevel === "中" ? 0.9 : 1;
  const horizonFactor = days === 5 ? 0.65 : 1;
  const targetGap = ((analysis.ai.targetPrice - analysis.currentPrice) / analysis.currentPrice) * 100;
  return round2(targetGap * directionFactor * confidenceFactor * riskPenalty * horizonFactor);
}

function sortRanking(list, key) {
  return [...list].sort((a, b) => b[key] - a[key]).slice(0, 10);
}

async function handleRemoteAnalyze() {
  const stock = readStockInput();
  if (!stock) return;

  try {
    setBusyState(els.remoteAiBtn, true, "分析中...");
    const analysis = await requestAiAnalysis(stock);
    persistAnalysis(analysis);
  } catch (error) {
    persistAnalysis(buildLocalAnalysis(stock, "local-fallback"));
    renderNotice(`AI 分析失败，已回退到基础分析：${error.message}`);
  } finally {
    setBusyState(els.remoteAiBtn, false, "调用 AI");
  }
}

function readStockInput() {
  const code = sanitizeCode(els.stockCode.value);
  const currentPrice = Number(els.currentPrice.value);
  const closes = els.recentCloses.value
    .split(/[,\s，]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!code) {
    renderNotice("请输入 6 位大陆股票代码，例如 600519。");
    return null;
  }

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || closes.length < 3) {
    renderNotice("请填写有效的当前价格，并至少提供 3 个最近收盘价。");
    return null;
  }

  return {
    code,
    name: els.stockName.value.trim() || "未命名股票",
    currentPrice,
    closes
  };
}

function buildLocalAnalysis(stock, provider = "local") {
  const closes = stock.closes.slice(-5);
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
    id: crypto.randomUUID(),
    code: stock.code,
    name: stock.name,
    currentPrice: roundMoney(stock.currentPrice),
    closes,
    analyzedAt: new Date().toISOString(),
    average: roundMoney(average),
    momentum: round2(momentum),
    volatility: round2(volatility),
    priceVsAverage: round2(priceVsAverage),
    provider,
    model: provider === "openai" ? serverConfig.openaiModel : "rule-engine",
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

async function requestAiAnalysis(stock) {
  if (appState.settings.aiProvider === "custom") {
    if (!appState.settings.aiApiUrl) {
      throw new Error("当前已选择自定义接口，但还没有填写 AI 接口地址");
    }
    return buildRemoteAnalysisFromCustomEndpoint(stock);
  }

  const payload = await apiRequest("/ai/analyze", {
    method: "POST",
    body: JSON.stringify({
      provider: appState.settings.aiProvider || "auto",
      stockCode: stock.code,
      stockName: stock.name,
      currentPrice: stock.currentPrice,
      recentCloses: stock.closes
    })
  });

  return {
    ...buildLocalAnalysis(
      stock,
      payload.provider || serverConfig.defaultAiProvider || (serverConfig.hasOpenAIKey ? "openai" : "local")
    ),
    provider: payload.provider || serverConfig.defaultAiProvider || "openai",
    model:
      payload.model ||
      serverConfig.anthropicModel ||
      serverConfig.openaiModel ||
      "rule-engine",
    average: Number.isFinite(payload.average) ? roundMoney(payload.average) : buildLocalAnalysis(stock).average,
    momentum: Number.isFinite(payload.momentum) ? round2(payload.momentum) : buildLocalAnalysis(stock).momentum,
    volatility: Number.isFinite(payload.volatility) ? round2(payload.volatility) : buildLocalAnalysis(stock).volatility,
    ai: {
      score: round2(payload.ai.score),
      direction: payload.ai.direction,
      action: payload.ai.action,
      confidence: clamp(round2(payload.ai.confidence), 1, 100),
      rationale: payload.ai.rationale,
      riskLevel: payload.ai.riskLevel || buildLocalAnalysis(stock).ai.riskLevel,
      keySignals: Array.isArray(payload.ai.keySignals)
        ? payload.ai.keySignals
        : buildLocalAnalysis(stock).ai.keySignals,
      cautions: Array.isArray(payload.ai.cautions)
        ? payload.ai.cautions
        : buildLocalAnalysis(stock).ai.cautions,
      targetPrice: roundMoney(payload.ai.targetPrice),
      stopPrice: roundMoney(payload.ai.stopPrice)
    }
  };
}

async function buildRemoteAnalysisFromCustomEndpoint(stock) {
  const response = await fetch(appState.settings.aiApiUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      stockCode: stock.code,
      stockName: stock.name,
      currentPrice: stock.currentPrice,
      recentCloses: stock.closes
    })
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const base = buildLocalAnalysis(stock, "custom-ai");
  return {
    ...base,
    provider: "custom-ai",
    model: payload.model || "custom-endpoint",
    ai: {
      score: Number.isFinite(payload.score) ? round2(payload.score) : base.ai.score,
      direction: payload.direction || base.ai.direction,
      action: payload.action || base.ai.action,
      confidence: Number.isFinite(payload.confidence) ? round2(payload.confidence) : base.ai.confidence,
      rationale: payload.rationale || base.ai.rationale,
      riskLevel: payload.riskLevel || base.ai.riskLevel,
      keySignals: Array.isArray(payload.keySignals) ? payload.keySignals : base.ai.keySignals,
      cautions: Array.isArray(payload.cautions) ? payload.cautions : base.ai.cautions,
      targetPrice: Number.isFinite(payload.targetPrice) ? roundMoney(payload.targetPrice) : base.ai.targetPrice,
      stopPrice: Number.isFinite(payload.stopPrice) ? roundMoney(payload.stopPrice) : base.ai.stopPrice
    }
  };
}

async function fetchQuote(code) {
  if (appState.settings.marketApiUrl) {
    const customUrl = new URL(appState.settings.marketApiUrl);
    customUrl.searchParams.set("code", code);
    const response = await fetch(customUrl, { headers: buildHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  return apiRequest(`/quote?code=${encodeURIComponent(code)}`);
}

async function loadMovers() {
  try {
    const [gainers, losers] = await Promise.all([
      apiRequest("/movers?type=gainers"),
      apiRequest("/movers?type=losers")
    ]);
    appState.movers = {
      gainers: gainers.items || [],
      losers: losers.items || [],
      updatedAt: new Date().toISOString()
    };
    saveState();
  } catch {
    appState.movers = {
      gainers: [],
      losers: [],
      updatedAt: null
    };
  }
}

async function loadIndices() {
  try {
    const payload = await apiRequest("/indices");
    appState.indices = payload.items || [];
    saveState();
  } catch {
    appState.indices = [];
  }
}

function persistAnalysis(analysis) {
  appState.lastAnalysis = analysis;
  appState.analysisHistory = [toAnalysisSnapshot(analysis), ...(appState.analysisHistory || [])]
    .slice(0, 60);
  upsertCartCandidate(analysis);
  saveState();
  renderAll();
}

function toAnalysisSnapshot(analysis) {
  return {
    id: analysis.id,
    code: analysis.code,
    name: analysis.name,
    currentPrice: analysis.currentPrice,
    analyzedAt: analysis.analyzedAt,
    provider: analysis.provider,
    model: analysis.model,
    ai: {
      direction: analysis.ai.direction,
      confidence: analysis.ai.confidence,
      targetPrice: analysis.ai.targetPrice,
      stopPrice: analysis.ai.stopPrice,
      action: analysis.ai.action,
      riskLevel: analysis.ai.riskLevel
    }
  };
}

function upsertCartCandidate(analysis) {
  const cartItem = {
    id: analysis.id,
    code: analysis.code,
    name: analysis.name,
    currentPrice: analysis.currentPrice,
    closes: analysis.closes,
    analyzedAt: analysis.analyzedAt,
    provider: analysis.provider,
    model: analysis.model,
    ai: analysis.ai
  };
  const index = appState.cart.findIndex((item) => item.code === analysis.code);
  if (index >= 0) appState.cart[index] = cartItem;
  else appState.cart.unshift(cartItem);
}

function handleCartAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = appState.cart.find((entry) => entry.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === "remove-cart") {
    appState.cart = appState.cart.filter((entry) => entry.id !== item.id);
  }

  if (button.dataset.action === "buy") {
    buyStock(item, appState.profile?.tradeLotSize || 100);
  }

  saveState();
  renderAll();
}

function buyStock(item, quantity) {
  const cost = roundMoney(item.currentPrice * quantity);
  if (cost > appState.cash) {
    renderNotice("可用资金不足，无法完成本次模拟买入。");
    return;
  }

  appState.cash = roundMoney(appState.cash - cost);
  const existing = appState.holdings.find((holding) => holding.code === item.code);

  if (existing) {
    const totalCost = existing.avgCost * existing.quantity + cost;
    existing.quantity += quantity;
    existing.avgCost = roundMoney(totalCost / existing.quantity);
    existing.currentPrice = item.currentPrice;
    existing.ai = item.ai;
    existing.provider = item.provider;
    existing.model = item.model;
  } else {
    appState.holdings.unshift({
      id: crypto.randomUUID(),
      code: item.code,
      name: item.name,
      quantity,
      avgCost: item.currentPrice,
      currentPrice: item.currentPrice,
      ai: item.ai,
      provider: item.provider,
      model: item.model,
      openedAt: new Date().toISOString()
    });
  }

  appState.trades.unshift({
    id: crypto.randomUUID(),
    type: "买入",
    code: item.code,
    name: item.name,
    quantity,
    price: item.currentPrice,
    amount: cost,
    timestamp: new Date().toISOString(),
    aiDirection: item.ai.direction,
    aiConfidence: item.ai.confidence,
    provider: item.provider,
    model: item.model,
    reviewType: "trade"
  });
}

function handlePortfolioAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const holding = appState.holdings.find((entry) => entry.id === button.dataset.id);
  if (!holding && button.dataset.action !== "review") return;

  if (button.dataset.action === "review") {
    appState.reviewCode = button.dataset.code || "";
    saveState();
    renderAll();
    return;
  }

  if (button.dataset.action === "refresh-price") {
    refreshHoldingPrice(holding, button);
    return;
  }

  if (button.dataset.action === "sell") {
    sellHolding(holding, holding.quantity);
    saveState();
    renderAll();
  }
}

async function refreshHoldingPrice(holding, button) {
  try {
    setBusyState(button, true, "刷新中...");
    const quote = await fetchQuote(holding.code);
    holding.currentPrice = roundMoney(quote.currentPrice);
    appState.trades.unshift({
      id: crypto.randomUUID(),
      type: "价格更新",
      code: holding.code,
      name: holding.name,
      quantity: holding.quantity,
      price: holding.currentPrice,
      amount: roundMoney(holding.currentPrice * holding.quantity),
      timestamp: new Date().toISOString(),
      provider: "market",
      model: "eastmoney-proxy",
      reviewType: "quote"
    });
    saveState();
    renderAll();
  } catch (error) {
    renderNotice(`刷新价格失败：${error.message}`);
  } finally {
    setBusyState(button, false, "刷新市价");
  }
}

function sellHolding(holding, quantity) {
  const amount = roundMoney(holding.currentPrice * quantity);
  appState.cash = roundMoney(appState.cash + amount);
  appState.trades.unshift({
    id: crypto.randomUUID(),
    type: "卖出",
    code: holding.code,
    name: holding.name,
    quantity,
    price: holding.currentPrice,
    amount,
    timestamp: new Date().toISOString(),
    pnl: roundMoney((holding.currentPrice - holding.avgCost) * quantity),
    aiDirection: holding.ai.direction,
    aiConfidence: holding.ai.confidence,
    entryPrice: holding.avgCost,
    provider: holding.provider,
    model: holding.model,
    reviewType: "trade"
  });
  appState.holdings = appState.holdings.filter((entry) => entry.id !== holding.id);
}

function handleTradeAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const trade = appState.trades.find((entry) => entry.id === button.dataset.id);
  if (!trade) return;
  if (button.dataset.action === "reuse-analysis") {
    openStockFromList(trade.code, trade.name);
    return;
  }
  if (button.dataset.action === "review") {
    appState.reviewCode = trade.code;
    saveState();
    renderAll();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = els.authUsername.value.trim();
  const password = els.authPassword.value;
  const mode = event.submitter?.dataset.mode || "login";

  try {
    setBusyState(event.submitter, true, mode === "register" ? "注册中..." : "登录中...");
    const path = mode === "register" ? "/auth/register" : "/auth/login";
    const session = await apiRequest(path, {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    appState.auth.user = session.user;
    els.authPassword.value = "";
    await syncToCloud();
  } catch (error) {
    els.authStatus.textContent = error.message;
  } finally {
    setBusyState(event.submitter, false, mode === "register" ? "注册" : "登录");
    renderAll();
  }
}

async function handleAuthAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  if (button.dataset.action === "logout") {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // noop
    }
    appState.auth.user = null;
    appState.auth.cloudSyncedAt = null;
    saveState();
    renderAll();
  }

  if (button.dataset.action === "pull-cloud") {
    await pullCloudPortfolio();
  }
}

async function pullCloudPortfolio() {
  if (!appState.auth.user) return;
  try {
    const cloud = await apiRequest("/portfolio");
    mergeCloudPortfolio(cloud.portfolio);
    appState.auth.cloudSyncedAt = new Date().toISOString();
    saveState();
    renderAll();
    renderNotice("已从云端拉取模拟账户。");
  } catch (error) {
    els.authStatus.textContent = error.message;
  }
}

async function syncToCloud() {
  if (!appState.auth.user) {
    els.authStatus.textContent = "登录后才能同步到云端。";
    return;
  }

  try {
    setBusyState(els.syncBtn, true, "同步中...");
    const payload = await apiRequest("/portfolio", {
      method: "PUT",
      body: JSON.stringify({ state: getPortableState() })
    });
    appState.auth.cloudSyncedAt = payload.savedAt;
    saveState();
    renderAll();
    els.authStatus.textContent = "云端同步完成。";
  } catch (error) {
    els.authStatus.textContent = error.message;
  } finally {
    setBusyState(els.syncBtn, false, "同步到云端");
  }
}

function mergeCloudPortfolio(portfolio) {
  if (!portfolio) return;
  appState = {
    ...appState,
    ...portfolio,
    settings: {
      ...appState.settings,
      ...(portfolio.settings || {})
    },
    auth: {
      ...appState.auth
    }
  };
  saveState();
}

function getPortableState() {
  return {
    cash: appState.cash,
    cart: appState.cart,
    holdings: appState.holdings,
    trades: appState.trades,
    lastAnalysis: appState.lastAnalysis,
    analysisHistory: appState.analysisHistory,
    settings: appState.settings
  };
}

function resetPortfolioOnly() {
  appState.cash = INITIAL_CASH;
  appState.cart = [];
  appState.holdings = [];
  appState.trades = [];
  appState.lastAnalysis = null;
  appState.analysisHistory = [];
  appState.reviewCode = "";
  saveState();
  renderAll();
}

function renderAll() {
  renderMarketStrip();
  renderTabs();
  renderSettings();
  renderUserPanel();
  renderWallet();
  renderWatchlist();
  renderRankings();
  renderMovers();
  renderCart();
  renderPortfolio();
  renderTrades();
  renderReviewPanel();
  renderReport();
}

function renderMarketStrip() {
  if (!els.marketStrip) return;
  const list = appState.indices || [];

  if (!list.length) {
    els.marketStrip.innerHTML = `
      <article class="market-ticker market-loading">
        <span>市场状态加载中...</span>
      </article>
    `;
    return;
  }

  els.marketStrip.innerHTML = list
    .map(
      (item) => `
        <article class="market-ticker ${item.changePercent >= 0 ? "is-up" : "is-down"}">
          <div class="ticker-head">
            <strong>${item.name}</strong>
            <span class="ticker-code">${item.code}</span>
          </div>
          <div class="ticker-price">${formatMoney(item.currentPrice)}</div>
          <div class="ticker-foot">
            <span class="ticker-status">${item.changePercent >= 0 ? "市场偏强" : "市场偏弱"}</span>
            <div class="ticker-change ${item.changePercent >= 0 ? "trend-up" : "trend-down"}">${formatSigned(item.changePercent)}%</div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderWatchlist() {
  if (!appState.watchlist.length) {
    els.watchlistList.className = "list-stack empty-state";
    els.watchlistList.innerHTML = "<p>还没有关注的股票。</p>";
    return;
  }

  els.watchlistList.className = "list-stack";
  els.watchlistList.innerHTML = appState.watchlist
    .map((item) => {
      const expanded = appState.expandedWatchCode === item.code;
      const topPrediction = item.predictions?.[0];
      const recent5 = calculateRecentChange(item.closes || []);
      const changePercent = Number(item.changePercent) || 0;
      const currentPrice = Number(item.currentPrice) || 0;
      const previousClose = changePercent === -100 ? currentPrice : currentPrice / (1 + changePercent / 100);
      const todayMove = roundMoney(currentPrice - previousClose);
      const summary = buildPredictionSummary(item);
      const quickRows = buildWatchQuickRows(item);
      return `
        <article class="watch-card">
          <div class="watch-summary-trigger" data-action="toggle-watch" data-code="${item.code}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}">
          <div class="watch-quote-row">
            <div class="watch-identity" data-action="toggle-watch" data-code="${item.code}">
              <div class="item-title">${item.name}</div>
              <div class="item-subtitle">${item.code} · ${summary.caption}</div>
            </div>
            <div class="watch-price-block" data-action="toggle-watch" data-code="${item.code}">
              <strong>${formatMoney(item.currentPrice)}</strong>
              <span class="${Number(item.changePercent) >= 0 ? "trend-up" : "trend-down"}">${formatSigned(Number(item.changePercent) || 0)}%</span>
              <small class="${Number(item.changePercent) >= 0 ? "trend-up" : "trend-down"}">${formatSignedMoney(todayMove)}</small>
              <em class="watch-toggle-hint" data-action="toggle-watch" data-code="${item.code}">${expanded ? "收起详情" : "展开详情"}</em>
            </div>
          </div>
          </div>
          ${
            expanded
              ? `
                <div class="watch-market-board">
                  <div class="watch-stat-card">
                    <span class="watch-stat-label">真实 5 日</span>
                    <strong class="${recent5 >= 0 ? "trend-up" : "trend-down"}">${formatSigned(recent5)}%</strong>
                    <small class="watch-stat-note">最近收盘走势</small>
                  </div>
                  <div class="watch-stat-card">
                    <span class="watch-stat-label">综合判断</span>
                    <strong class="${mapTrendClass(summary.direction)}">${summary.direction}</strong>
                    <small class="watch-stat-note">${summary.detail}</small>
                  </div>
                  <div class="watch-stat-card">
                    <span class="watch-stat-label">最高目标</span>
                    <strong class="${summary.bestGap >= 0 ? "trend-up" : "trend-down"}">${formatSigned(summary.bestGap)}%</strong>
                    <small class="watch-stat-note">${formatMoney(summary.bestTarget)}</small>
                  </div>
                </div>
                <div class="watch-meta-row">
                  <span class="tag">现价 ${formatMoney(item.currentPrice)}</span>
                  ${topPrediction ? `<span class="tag ${mapRiskClass(topPrediction.riskLevel)}">风险 ${topPrediction.riskLevel}</span>` : ""}
                  ${item.predictions?.length ? `<span class="tag">模型 ${item.predictions.length} 家</span>` : ""}
                </div>
                <div class="watch-model-scan">${quickRows}</div>
                <div class="action-row">
                  <button class="ghost-btn" data-action="toggle-watch" data-code="${item.code}">收起</button>
                  <button class="ghost-btn" data-action="refresh-watch" data-code="${item.code}">更新</button>
                  <button class="primary-btn" data-action="add-watch-cart" data-code="${item.code}">加入虚拟交易</button>
                  <button class="text-btn" data-action="remove-watch" data-code="${item.code}">删除</button>
                </div>
                <div class="watch-expanded">
                  ${buildMarketPredictionChart(item)}
                  ${buildWatchComparison(item)}
                  <div class="model-grid">
                    ${(item.predictions || [])
                      .map(
                        (prediction) => `
                          <article class="model-card">
                            <div class="item-head">
                              <div>
                                <div class="item-title">${renderProviderName(prediction.provider)}</div>
                                <div class="item-subtitle">未来 5 到 10 天预测</div>
                              </div>
                              <span class="pill ${mapTrendClass(prediction.direction)}">${prediction.direction}</span>
                            </div>
                            <div class="tag-row">
                              <span class="tag">置信度 ${prediction.confidence}%</span>
                              <span class="tag ${mapRiskClass(prediction.riskLevel)}">风险 ${prediction.riskLevel}</span>
                              <span class="tag">目标价 ${formatMoney(prediction.targetPrice)}</span>
                            </div>
                            <p class="meta-note">${prediction.rationale}</p>
                          </article>
                        `
                      )
                      .join("")}
                  </div>
                </div>
              `
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function buildWatchQuickRows(item) {
  const preferredOrder = ["openai", "anthropic", "local"];
  const ordered = [...(item.predictions || [])].sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a.provider);
    const bIndex = preferredOrder.indexOf(b.provider);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });

  return ordered
    .slice(0, 3)
    .map(
      (prediction, index) => `
        <div class="watch-model-row ${mapTrendClass(prediction.direction)}">
          <span class="watch-model-rank">${index + 1}</span>
          <span class="watch-model-name">${renderProviderName(prediction.provider)}</span>
          <span class="watch-model-view">${prediction.direction}</span>
          <span class="watch-model-target ${prediction.targetPrice >= item.currentPrice ? "trend-up" : "trend-down"}">${formatSigned(
            round2(((prediction.targetPrice - item.currentPrice) / item.currentPrice) * 100)
          )}%</span>
        </div>
      `
    )
    .join("");
}

function buildPredictionSummary(item) {
  const predictions = item.predictions || [];
  if (!predictions.length) {
    return {
      direction: "观望",
      caption: "等待模型判断",
      detail: "暂无有效结果",
      bestTarget: Number(item.currentPrice) || 0,
      bestGap: 0
    };
  }

  const trendCounts = predictions.reduce(
    (acc, prediction) => {
      if (prediction.direction === "看涨") acc.up += 1;
      else if (prediction.direction === "看跌") acc.down += 1;
      else acc.flat += 1;
      return acc;
    },
    { up: 0, down: 0, flat: 0 }
  );

  let direction = "震荡";
  if (trendCounts.up > trendCounts.down) direction = "偏多";
  if (trendCounts.down > trendCounts.up) direction = "偏空";

  const bestTarget = predictions.reduce((max, prediction) => Math.max(max, Number(prediction.targetPrice) || 0), 0);
  const bestGap = item.currentPrice
    ? round2(((bestTarget - item.currentPrice) / item.currentPrice) * 100)
    : 0;

  return {
    direction,
    caption: `${predictions.length} 家模型`,
    detail: `${trendCounts.up} 看涨 / ${trendCounts.down} 看跌 / ${trendCounts.flat} 震荡`,
    bestTarget,
    bestGap
  };
}

function buildWatchComparison(item) {
  const latest5 = calculateRecentChange(item.closes || []);
  const rows = (item.predictions || [])
    .map(
      (prediction) => `
        <div class="compare-row">
          <span class="compare-provider">${renderProviderName(prediction.provider)}</span>
          <strong class="compare-direction ${mapTrendClass(prediction.direction)}">${prediction.direction}</strong>
          <div class="compare-meta">
            <span class="compare-confidence">置信 ${prediction.confidence}%</span>
            <span class="compare-target">目标 ${formatMoney(prediction.targetPrice)}</span>
          </div>
          <span class="compare-gap ${prediction.targetPrice >= item.currentPrice ? "trend-up" : "trend-down"}">${formatSigned(
            round2(((prediction.targetPrice - item.currentPrice) / item.currentPrice) * 100)
          )}%</span>
        </div>
      `
    )
    .join("");

  return `
    <div class="compare-table-card">
      <h3>实际数据 vs 模型预测</h3>
      <div class="market-facts">
        <div class="detail-box">
          <span>当前价格</span>
          <strong>${formatMoney(item.currentPrice)}</strong>
        </div>
        <div class="detail-box">
          <span>今日涨跌</span>
          <strong class="${Number(item.changePercent) >= 0 ? "trend-up" : "trend-down"}">${formatSigned(
            Number(item.changePercent) || 0
          )}%</strong>
        </div>
        <div class="detail-box">
          <span>近 5 日表现</span>
          <strong class="${latest5 >= 0 ? "trend-up" : "trend-down"}">${formatSigned(latest5)}%</strong>
        </div>
      </div>
      <div class="compare-header compare-row">
        <span>模型</span>
        <span>方向</span>
        <span>置信度</span>
        <span>目标价</span>
        <span>目标空间</span>
      </div>
      <div class="compare-table">
        ${rows}
      </div>
    </div>
  `;
}

function renderTabs() {
  els.tabSections.forEach((section) => {
    section.classList.toggle("hidden", section.dataset.tab !== appState.activeTab);
  });
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === appState.activeTab);
  });
}

function renderSettings() {
  if (!els.marketApiUrl || !els.aiProvider || !els.aiApiUrl || !els.apiToken || !els.configHint) return;
  els.marketApiUrl.value = appState.settings.marketApiUrl || "";
  els.aiProvider.value = appState.settings.aiProvider || "auto";
  els.aiApiUrl.value = appState.settings.aiApiUrl || "";
  els.apiToken.value = appState.settings.apiToken || "";
  els.configHint.textContent =
    appState.settings.aiProvider === "custom"
      ? "当前将优先走自定义 AI 接口。"
      : appState.settings.aiProvider === "auto"
        ? `当前自动选择，服务器默认走 ${renderProviderName(serverConfig.defaultAiProvider)}。`
        : `当前强制使用 ${renderProviderName(appState.settings.aiProvider)}。`;
}

function renderRankings() {
  renderRankingList(els.ranking5List, appState.rankings?.horizon5 || [], "predicted5d", "近 5 天");
  renderRankingList(els.ranking10List, appState.rankings?.horizon10 || [], "predicted10d", "近 10 天");
  renderRankingList(els.futureTop5, appState.rankings?.horizon5 || [], "predicted5d", "未来 5 天");
  renderRankingList(els.futureTop10, appState.rankings?.horizon10 || [], "predicted10d", "未来 10 天");
  if (els.rankingSummary && appState.rankings?.updatedAt) {
    els.rankingSummary.textContent = `最近一次排序时间：${formatDateTime(appState.rankings.updatedAt)}`;
  }
}

function renderMovers() {
  renderMarketMoverList(els.marketTopGainers, appState.movers?.gainers || [], "实时涨幅前十");
  renderMarketMoverList(els.marketTopLosers, appState.movers?.losers || [], "实时跌幅前十");
}

function renderMarketMoverList(container, list, label) {
  if (!list.length) {
    container.className = "list-stack empty-state";
    container.innerHTML = `<p>还没有${label}数据。</p>`;
    return;
  }

  container.className = "list-stack";
  container.innerHTML = list
    .map(
      (item, index) => {
        const inWatchlist = appState.watchlist.some((entry) => entry.code === item.code);
        return `
        <article class="rank-item">
          <div class="rank-no">${index + 1}</div>
          <div class="rank-main rank-main-compact">
            <div class="rank-topline">
              <div class="rank-title-wrap">
                <div class="item-title">${item.name}</div>
                <div class="item-subtitle">${item.code}</div>
              </div>
              <div class="rank-side">
                <strong class="${item.changePercent >= 0 ? "trend-up" : "trend-down"}">${formatSigned(item.changePercent)}%</strong>
                <span class="rank-price">现价 ${formatMoney(item.currentPrice)}</span>
              </div>
            </div>
            <div class="rank-bottomline">
              <span class="rank-inline-note">成交额 ${formatLargeNumber(item.amount)}</span>
              <button
                class="${inWatchlist ? "ghost-btn" : "primary-btn"} rank-action-btn"
                data-rank-action="${inWatchlist ? "view" : "add"}"
                data-open-code="${item.code}"
                data-open-name="${item.name}"
              >${inWatchlist ? "查看自选" : "加入自选"}</button>
            </div>
          </div>
        </article>
      `;
      }
    )
    .join("");
}

function renderRankingList(container, list, key, label) {
  if (!container) return;
  if (!list.length) {
    container.className = "list-stack empty-state";
    container.innerHTML = `<p>还没有生成${label}预测榜单。</p>`;
    return;
  }

  container.className = "list-stack";
  container.innerHTML = list
    .map(
      (item, index) => {
        const inWatchlist = appState.watchlist.some((entry) => entry.code === item.code);
        return `
        <article class="rank-item">
          <div class="rank-no">${index + 1}</div>
          <div class="rank-main rank-main-compact">
            <div class="rank-topline">
              <div class="rank-title-wrap">
                <div class="item-title">${item.name}</div>
                <div class="item-subtitle">${item.code} · ${item.direction} · 置信 ${item.confidence}%</div>
              </div>
              <div class="rank-side">
                <strong class="${item[key] >= 0 ? "trend-up" : "trend-down"}">${formatSigned(item[key])}%</strong>
                <span class="rank-price">现价 ${formatMoney(item.currentPrice)}</span>
              </div>
            </div>
            <div class="rank-bottomline">
              <span class="rank-inline-note ${mapRiskClass(item.riskLevel)}">风险 ${item.riskLevel}</span>
              <button
                class="${inWatchlist ? "ghost-btn" : "primary-btn"} rank-action-btn"
                data-rank-action="${inWatchlist ? "view" : "add"}"
                data-open-code="${item.code}"
                data-open-name="${item.name}"
              >${inWatchlist ? "查看自选" : "加入自选"}</button>
            </div>
          </div>
        </article>
      `;
      }
    )
    .join("");
}

function syncRankingsFromWatchlist() {
  const items = (appState.watchlist || [])
    .map((item) => {
      const currentPrice = Number(item.currentPrice);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

      const forecast = buildForecastPoints(currentPrice, item.predictions || []);
      const projected5 = forecast.find((entry) => entry.label === "5天")?.price ?? currentPrice;
      const projected10 = forecast.find((entry) => entry.label === "10天")?.price ?? currentPrice;
      const topPrediction = item.predictions?.[0];

      return {
        code: item.code,
        name: item.name,
        currentPrice,
        provider: topPrediction?.provider || "local",
        direction: topPrediction?.direction || "震荡",
        confidence: topPrediction?.confidence || 50,
        riskLevel: topPrediction?.riskLevel || "中",
        predicted5d: round2(((projected5 - currentPrice) / currentPrice) * 100),
        predicted10d: round2(((projected10 - currentPrice) / currentPrice) * 100)
      };
    })
    .filter(Boolean);

  appState.rankings = {
    horizon5: sortRanking(items, "predicted5d"),
    horizon10: sortRanking(items, "predicted10d"),
    updatedAt: items.length ? new Date().toISOString() : null
  };
}

function renderUserPanel() {
  const profile = appState.profile || defaultState().profile;
  els.profileName.value = profile.name || "股友";
  els.profileCity.value = profile.city || "";
  els.profileRisk.value = profile.riskPreference || "稳健";
  els.tradeLotSize.value = profile.tradeLotSize || 100;

  els.userSummary.innerHTML = `
    <article class="metric-card">
      <span>当前称呼</span>
      <strong>${profile.name || "股友"}</strong>
    </article>
    <article class="metric-card">
      <span>所在城市</span>
      <strong>${profile.city || "未填写"}</strong>
    </article>
    <article class="metric-card">
      <span>交易风格</span>
      <strong>${profile.riskPreference || "稳健"}</strong>
    </article>
    <article class="metric-card">
      <span>默认买入</span>
      <strong>${profile.tradeLotSize || 100} 股</strong>
    </article>
  `;

  const providers = (serverConfig.availableProviders || []).map((item) => item.label).join("、") || "基础分析";
  const selectedProvider =
    appState.settings.aiProvider === "auto"
      ? `自动选择（当前默认 ${renderProviderName(serverConfig.defaultAiProvider)}）`
      : renderProviderName(appState.settings.aiProvider);

  els.modelSummary.innerHTML = `
    <strong>当前模型配置：</strong>
    当前已启用的预测来源有 ${providers}。用户在股票详情里会直接看到来源名称，不会显示底层模型代号。
  `;
}

function renderWallet() {
  const holdingsValue = roundMoney(
    appState.holdings.reduce((sum, holding) => sum + holding.currentPrice * holding.quantity, 0)
  );
  const equity = roundMoney(appState.cash + holdingsValue);
  const profit = roundMoney(equity - INITIAL_CASH);

  els.cashValue.textContent = formatMoney(appState.cash);
  els.holdingsValue.textContent = formatMoney(holdingsValue);
  els.equityValue.textContent = formatMoney(equity);
  els.equityValue.dataset.value = equity;
  els.profitValue.textContent = formatMoney(profit);
  els.profitValue.className = profit >= 0 ? "trend-up" : "trend-down";
}

function renderAnalysis() {
  const analysis = appState.lastAnalysis;
  if (!analysis) {
    renderNotice("录入股票后，这里会给出趋势判断、置信度、波动提示和建议操作。");
    return;
  }

  const trendClass = mapTrendClass(analysis.ai.direction);
  const riskClass = mapRiskClass(analysis.ai.riskLevel);
  const previous = getPreviousAnalysis(analysis);
  const history = getHistoryForCode(analysis.code);
  els.analysisCard.className = "analysis-card";
  els.analysisCard.innerHTML = `
    <div class="analysis-grid">
      <div>
        <div class="item-head">
          <div>
            <div class="item-title">${analysis.name} · ${analysis.code}</div>
            <div class="item-subtitle">${formatDateTime(analysis.analyzedAt)} 更新</div>
          </div>
          <span class="pill ${trendClass}">${analysis.ai.direction}</span>
        </div>
        ${buildLineChart(analysis.closes, "最近收盘走势")}
        <div class="tag-row">
          <span class="tag ${trendClass}">置信度 ${analysis.ai.confidence}%</span>
          <span class="tag ${riskClass}">风险 ${analysis.ai.riskLevel || "中"}</span>
          <span class="tag">目标价 ${formatMoney(analysis.ai.targetPrice)}</span>
          <span class="tag warn">止损 ${formatMoney(analysis.ai.stopPrice)}</span>
          <span class="tag">来源 ${renderProviderName(analysis.provider)}</span>
        </div>
        ${
          previous
            ? `
              <div class="compare-card">
                <h3>与上次相比</h3>
                <div class="compare-grid">
                  <div class="detail-box">
                    <span>方向变化</span>
                    <strong>${previous.ai.direction} -> ${analysis.ai.direction}</strong>
                  </div>
                  <div class="detail-box">
                    <span>置信度变化</span>
                    <strong>${formatSigned(analysis.ai.confidence - previous.ai.confidence)}%</strong>
                  </div>
                  <div class="detail-box">
                    <span>目标价变化</span>
                    <strong>${formatSignedMoney(analysis.ai.targetPrice - previous.ai.targetPrice)}</strong>
                  </div>
                  <div class="detail-box">
                    <span>风险等级变化</span>
                    <strong>${previous.ai.riskLevel} -> ${analysis.ai.riskLevel}</strong>
                  </div>
                </div>
              </div>
            `
            : `
              <div class="compare-card">
                <h3>与上次相比</h3>
                <p class="meta-note">这是这只股票的第一次分析记录，后续会自动显示变化趋势。</p>
              </div>
            `
        }
        <p class="meta-note">${analysis.ai.rationale}</p>
        <div class="insight-grid">
          <article class="insight-card">
            <h3>关键信号</h3>
            <ul class="insight-list">
              ${(analysis.ai.keySignals || []).map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </article>
          <article class="insight-card">
            <h3>风险提示</h3>
            <ul class="insight-list">
              ${(analysis.ai.cautions || []).map((item) => `<li>${item}</li>`).join("")}
            </ul>
          </article>
        </div>
        <details class="analysis-details">
          <summary>展开研究卡片</summary>
          <div class="detail-grid">
            <div class="detail-box">
              <span>策略动作</span>
              <strong>${analysis.ai.action}</strong>
            </div>
            <div class="detail-box">
              <span>模型来源</span>
              <strong>${analysis.model || "rule-engine"}</strong>
            </div>
            <div class="detail-box">
              <span>趋势评分</span>
              <strong>${analysis.ai.score}</strong>
            </div>
            <div class="detail-box">
              <span>分析时间</span>
              <strong>${formatDateTime(analysis.analyzedAt)}</strong>
            </div>
          </div>
          <div class="history-block">
            <h3>最近分析历史</h3>
            <div class="history-list">
              ${history
                .map(
                  (item) => `
                    <div class="history-item">
                      <span>${formatDateTime(item.analyzedAt)}</span>
                      <strong>${item.ai.direction}</strong>
                      <span>${item.ai.confidence}%</span>
                      <span>${formatMoney(item.ai.targetPrice)}</span>
                    </div>
                  `
                )
                .join("")}
            </div>
          </div>
        </details>
      </div>
      <div>
        <div class="report-line"><span>当前价格</span><strong>${formatMoney(analysis.currentPrice)}</strong></div>
        <div class="report-line"><span>5 日均价</span><strong>${formatMoney(analysis.average)}</strong></div>
        <div class="report-line"><span>动量</span><strong>${analysis.momentum}%</strong></div>
        <div class="report-line"><span>波动率</span><strong>${analysis.volatility}%</strong></div>
        <div class="report-line"><span>建议动作</span><strong>${analysis.ai.action}</strong></div>
        <div class="report-line"><span>模型</span><strong>${analysis.model || "rule-engine"}</strong></div>
      </div>
    </div>
  `;
}

function renderNotice(message) {
  if (els.watchlistMessage) {
    els.watchlistMessage.textContent = message;
  }
}

function renderCart() {
  if (!appState.cart.length) {
    els.cartList.className = "list-stack empty-state";
    els.cartList.innerHTML = "<p>还没有加入购物车的股票。</p>";
    return;
  }

  els.cartList.className = "list-stack";
  els.cartList.innerHTML = appState.cart
    .map(
      (item) => `
        <article class="list-item">
          <div class="item-head">
            <div>
              <div class="item-title">${item.name}</div>
              <div class="item-subtitle">${item.code}</div>
            </div>
            <strong>${formatMoney(item.currentPrice)}</strong>
          </div>
          <div class="tag-row">
            <span class="tag ${mapTrendClass(item.ai.direction)}">${item.ai.direction}</span>
            <span class="tag">目标价 ${formatMoney(item.ai.targetPrice)}</span>
            <span class="tag">模型 ${item.model || "rule-engine"}</span>
          </div>
          <p class="meta-note">${item.ai.rationale}</p>
          <div class="action-row">
            <button class="primary-btn" data-action="buy" data-id="${item.id}">模拟买入 ${appState.profile?.tradeLotSize || 100} 股</button>
            <button class="ghost-btn" data-action="remove-cart" data-id="${item.id}">移出购物车</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderPortfolio() {
  if (!appState.holdings.length) {
    els.portfolioList.className = "list-stack empty-state";
    els.portfolioList.innerHTML = "<p>暂无持仓，先在上方分析后加入购物车并买入。</p>";
    return;
  }

  els.portfolioList.className = "list-stack";
  els.portfolioList.innerHTML = appState.holdings
    .map((holding) => {
      const marketValue = roundMoney(holding.currentPrice * holding.quantity);
      const profit = roundMoney((holding.currentPrice - holding.avgCost) * holding.quantity);
      return `
        <article class="list-item">
          <div class="item-head">
            <div>
              <div class="item-title">${holding.name} · ${holding.code}</div>
              <div class="item-subtitle">持仓 ${holding.quantity} 股 · 成本 ${formatMoney(holding.avgCost)}</div>
            </div>
            <strong class="${profit >= 0 ? "trend-up" : "trend-down"}">${formatMoney(profit)}</strong>
          </div>
          <div class="tag-row">
            <span class="tag">现价 ${formatMoney(holding.currentPrice)}</span>
            <span class="tag">市值 ${formatMoney(marketValue)}</span>
            <span class="tag ${mapTrendClass(holding.ai.direction)}">${holding.ai.direction}</span>
          </div>
          <div class="action-row">
            <button class="ghost-btn" data-action="review" data-id="${holding.id}" data-code="${holding.code}">查看复盘</button>
            <button class="ghost-btn" data-action="refresh-price" data-id="${holding.id}">刷新市价</button>
            <button class="primary-btn" data-action="sell" data-id="${holding.id}">全部卖出</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTrades() {
  const recentTrades = appState.trades.slice(0, 8);
  if (!recentTrades.length) {
    els.tradeList.className = "list-stack empty-state";
    els.tradeList.innerHTML = "<p>当前没有交易记录。</p>";
    return;
  }

  els.tradeList.className = "list-stack";
  els.tradeList.innerHTML = recentTrades
    .map(
      (trade) => `
        <article class="list-item">
          <div class="item-head">
            <div>
              <div class="item-title">${trade.type} · ${trade.name}</div>
              <div class="item-subtitle">${trade.code} · ${formatDateTime(trade.timestamp)}</div>
            </div>
            <strong>${formatMoney(trade.amount)}</strong>
          </div>
          <div class="tag-row">
            <span class="tag">${trade.quantity} 股</span>
            <span class="tag">成交价 ${formatMoney(trade.price)}</span>
            <span class="tag">来源 ${renderProviderName(trade.provider)}</span>
            ${
              Number.isFinite(trade.pnl)
                ? `<span class="tag ${trade.pnl >= 0 ? "good" : "bad"}">已实现 ${formatMoney(trade.pnl)}</span>`
                : ""
            }
          </div>
          <div class="action-row">
            <button class="ghost-btn" data-action="reuse-analysis" data-id="${trade.id}">打开这只股票</button>
            <button class="ghost-btn" data-action="review" data-id="${trade.id}">查看复盘</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderReviewPanel() {
  const code = appState.reviewCode || appState.lastAnalysis?.code || "";
  if (!code) {
    els.reviewPanel.className = "report-card empty-state";
    els.reviewPanel.innerHTML =
      "<p>在持仓或交易记录中点击“查看复盘”后，这里会展示该股票的分析、买卖和价格变化时间线。</p>";
    return;
  }

  const timeline = buildReviewTimeline(code);
  if (!timeline.length) {
    els.reviewPanel.className = "report-card empty-state";
    els.reviewPanel.innerHTML = "<p>当前股票还没有足够的复盘数据。</p>";
    return;
  }

  const title = timeline[0].name || code;
  els.reviewPanel.className = "report-card";
  els.reviewPanel.innerHTML = `
    <div class="item-head">
      <div>
        <div class="item-title">${title} · ${code}</div>
        <div class="item-subtitle">按时间倒序展示分析、成交和价格更新</div>
      </div>
      <span class="pill">${timeline.length} 条记录</span>
    </div>
    <div class="timeline-list">
      ${timeline
        .map(
          (item) => `
            <article class="timeline-item">
              <div class="timeline-dot ${item.tone}"></div>
              <div class="timeline-body">
                <div class="item-head">
                  <div>
                    <div class="item-title">${item.title}</div>
                    <div class="item-subtitle">${formatDateTime(item.timestamp)}</div>
                  </div>
                  <strong>${item.value}</strong>
                </div>
                <p class="meta-note">${item.description}</p>
                <div class="tag-row">
                  ${item.tags.map((tag) => `<span class="tag ${tag.className || ""}">${tag.label}</span>`).join("")}
                </div>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function buildReviewTimeline(code) {
  const analysisItems = (appState.analysisHistory || [])
    .filter((item) => item.code === code)
    .map((item) => ({
      timestamp: item.analyzedAt,
      name: item.name,
      title: `AI 分析 · ${item.ai.direction}`,
      value: `${item.ai.confidence}%`,
      description: `目标价 ${formatMoney(item.ai.targetPrice)}，风险 ${item.ai.riskLevel}，动作 ${item.ai.action}。`,
      tone: mapTrendClass(item.ai.direction),
      tags: [
        { label: renderProviderName(item.provider) },
        { label: renderProviderName(item.provider) },
        { label: `止损 ${formatMoney(item.ai.stopPrice)}`, className: "warn" }
      ]
    }));

  const tradeItems = appState.trades
    .filter((item) => item.code === code)
    .map((item) => ({
      timestamp: item.timestamp,
      name: item.name,
      title: item.type,
      value: formatMoney(item.amount),
      description:
        item.type === "价格更新"
          ? `持仓 ${item.quantity || 0} 股，最新价格更新为 ${formatMoney(item.price)}。`
          : `${item.quantity} 股，成交价 ${formatMoney(item.price)}。${
              Number.isFinite(item.pnl) ? `已实现收益 ${formatMoney(item.pnl)}。` : ""
            }`,
      tone:
        item.type === "卖出" ? (item.pnl >= 0 ? "good" : "bad") : item.type === "价格更新" ? "warn" : "good",
      tags: [
        { label: item.type },
        { label: `价格 ${formatMoney(item.price)}` },
        { label: renderProviderName(item.provider) }
      ]
    }));

  return [...analysisItems, ...tradeItems].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

function renderReport() {
  const realizedTrades = appState.trades.filter((trade) => Number.isFinite(trade.pnl));
  const realizedProfit = roundMoney(realizedTrades.reduce((sum, trade) => sum + trade.pnl, 0));
  const unrealizedProfit = roundMoney(
    appState.holdings.reduce(
      (sum, holding) => sum + (holding.currentPrice - holding.avgCost) * holding.quantity,
      0
    )
  );
  const totalTrades = appState.trades.filter((trade) => trade.type === "卖出").length;
  const winRate = totalTrades
    ? round2((realizedTrades.filter((trade) => trade.pnl >= 0).length / totalTrades) * 100)
    : 0;
  const aiAccuracy = calcAiAccuracy();
  const maxDrawdown = calculateMaxDrawdown();
  const turnover = roundMoney(appState.trades.reduce((sum, trade) => sum + trade.amount, 0));

  els.reportCard.innerHTML = `
    <div class="report-grid">
      <article class="metric-card"><span>已实现收益</span><strong class="${realizedProfit >= 0 ? "trend-up" : "trend-down"}">${formatMoney(realizedProfit)}</strong></article>
      <article class="metric-card"><span>浮动收益</span><strong class="${unrealizedProfit >= 0 ? "trend-up" : "trend-down"}">${formatMoney(unrealizedProfit)}</strong></article>
      <article class="metric-card"><span>胜率</span><strong>${winRate}%</strong></article>
      <article class="metric-card"><span>AI 命中率</span><strong>${aiAccuracy}%</strong></article>
      <article class="metric-card"><span>最大回撤</span><strong>${maxDrawdown}%</strong></article>
      <article class="metric-card"><span>累计成交额</span><strong>${formatMoney(turnover)}</strong></article>
    </div>
  `;

  els.reportCharts.innerHTML = `
    <article class="chart-card">
      <h3>权益曲线</h3>
      ${buildLineChart(buildEquitySeries(), "账户权益")}
    </article>
    <article class="chart-card">
      <h3>已实现盈亏分布</h3>
      ${buildBarChart(realizedTrades.map((trade) => trade.pnl))}
    </article>
  `;
}

function calcAiAccuracy() {
  const closedTrades = appState.trades.filter(
    (trade) => trade.type === "卖出" && typeof trade.aiDirection === "string"
  );
  if (!closedTrades.length) return 0;
  const hits = closedTrades.filter((trade) => {
    if (trade.aiDirection === "看涨") return trade.pnl >= 0;
    if (trade.aiDirection === "看跌") return trade.pnl <= 0;
    return Math.abs((trade.price - trade.entryPrice) / trade.entryPrice) < 0.03;
  }).length;
  return round2((hits / closedTrades.length) * 100);
}

function buildEquitySeries() {
  const ordered = [...appState.trades].reverse();
  let cash = INITIAL_CASH;
  let realized = 0;
  const points = [INITIAL_CASH];

  ordered.forEach((trade) => {
    if (trade.type === "买入") cash -= trade.amount;
    if (trade.type === "卖出") {
      cash += trade.amount;
      realized += trade.pnl || 0;
    }
    points.push(roundMoney(cash + realized));
  });

  if (points.length === 1) points.push(points[0]);
  return points;
}

function calculateMaxDrawdown() {
  const series = buildEquitySeries();
  let peak = series[0];
  let maxDrawdown = 0;
  series.forEach((value) => {
    peak = Math.max(peak, value);
    const drawdown = peak ? ((peak - value) / peak) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  });
  return round2(maxDrawdown);
}

function buildLineChart(values, label) {
  const safe = values.length ? values : [0, 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const spread = max - min || 1;
  const points = safe
    .map((value, index) => {
      const x = (index / Math.max(safe.length - 1, 1)) * 224 + 8;
      const y = 78 - ((value - min) / spread) * 60;
      return `${x},${y}`;
    })
    .join(" ");

  return `
    <svg class="mini-chart" viewBox="0 0 240 88" preserveAspectRatio="none" aria-label="${label}">
      <polyline class="chart-line" points="${points}"></polyline>
    </svg>
  `;
}

function buildMarketPredictionChart(item) {
  const candles = (item.candles || buildFallbackCandles(item.closes || [])).filter(
    (entry) =>
      Number.isFinite(entry.open) &&
      Number.isFinite(entry.close) &&
      Number.isFinite(entry.high) &&
      Number.isFinite(entry.low)
  );
  if (!candles.length) return buildLineChart(item.closes || [], `${item.name} 走势`);

  const recentCandles = candles.slice(-10);
  const forecast = buildForecastPoints(item.currentPrice, item.predictions || []);
  const values = [
    ...recentCandles.flatMap((entry) => [entry.high, entry.low]),
    ...forecast.map((entry) => entry.price)
  ].filter((value) => Number.isFinite(value));

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const width = 360;
  const height = 240;
  const chartLeft = 52;
  const chartRight = 336;
  const chartTop = 16;
  const chartBottom = 176;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const yFor = (price) => chartBottom - ((price - min) / spread) * chartHeight;
  const actualSlots = recentCandles.length;
  const totalSlots = actualSlots + forecast.length;
  const stepX = chartWidth / Math.max(totalSlots - 1, 1);

  const gridLines = [0, 0.5, 1].map((ratio) => {
    const price = max - spread * ratio;
    const y = chartTop + chartHeight * ratio;
    return `
      <line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" class="axis-grid"></line>
      <text x="8" y="${y + 4}" class="axis-label">${price.toFixed(2)}</text>
    `;
  }).join("");

  const candleWidth = Math.min(16, Math.max(8, stepX * 0.55));
  const candleMarkup = recentCandles
    .map((entry, index) => {
      const x = chartLeft + index * stepX;
      const wickX = x;
      const openY = yFor(entry.open);
      const closeY = yFor(entry.close);
      const highY = yFor(entry.high);
      const lowY = yFor(entry.low);
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(3, Math.abs(closeY - openY));
      const toneClass = entry.close >= entry.open ? "candle-up" : "candle-down";
      return `
        <line x1="${wickX}" y1="${highY}" x2="${wickX}" y2="${lowY}" class="candle-wick ${toneClass}"></line>
        <rect x="${x - candleWidth / 2}" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" rx="3" class="candle-body ${toneClass}"></rect>
        <rect
          x="${x - Math.max(candleWidth, 18)}"
          y="${chartTop}"
          width="${Math.max(candleWidth * 2, 24)}"
          height="${chartHeight}"
          rx="8"
          class="chart-hit"
          data-tip-x="${x}"
          data-tip-y="${highY < chartTop + 28 ? lowY + 18 : highY - 8}"
          data-tip-placement="${highY < chartTop + 28 ? "bottom" : "top"}"
          data-tip-title="${escapeHtmlAttr("实际K线")}"
          data-tip-body="${escapeHtmlAttr(`日期 ${formatFullDateLabel(entry.date, index)} | 开 ${entry.open.toFixed(2)} / 高 ${entry.high.toFixed(2)} / 低 ${entry.low.toFixed(2)} / 收 ${entry.close.toFixed(2)}`)}"
        ></rect>
      `;
    })
    .join("");

  const actualClosePoints = recentCandles
    .map((entry, index) => `${chartLeft + index * stepX},${yFor(entry.close)}`)
    .join(" ");

  const forecastStartX = chartLeft + (actualSlots - 1) * stepX;
  const forecastPolyline = [
    `${forecastStartX},${yFor(recentCandles.at(-1).close)}`,
    ...forecast.map((entry, index) => `${chartLeft + (actualSlots + index) * stepX},${yFor(entry.price)}`)
  ].join(" ");

  const forecastMarkers = forecast
    .map((entry, index) => {
      const x = chartLeft + (actualSlots + index) * stepX;
      const y = yFor(entry.price);
      return `
        <circle cx="${x}" cy="${y}" r="4.5" class="forecast-dot"></circle>
        <text x="${x - 12}" y="${y - 10}" class="forecast-label">${entry.label} ${entry.price.toFixed(2)}</text>
        <circle
          cx="${x}"
          cy="${y}"
          r="16"
          class="chart-hit chart-hit-point"
          data-tip-x="${x}"
          data-tip-y="${y < chartTop + 28 ? y + 18 : y - 10}"
          data-tip-placement="${y < chartTop + 28 ? "bottom" : "top"}"
          data-tip-title="${escapeHtmlAttr(`${entry.label} AI预测`)}"
          data-tip-body="${escapeHtmlAttr(`预测价格 ${entry.price.toFixed(2)}`)}"
        ></circle>
      `;
    })
    .join("");

  const xLabels = buildChartLabels(recentCandles, forecast, chartLeft, stepX, actualSlots)
    .map(
      (entry) => `
        <text x="${entry.x}" y="206" class="time-label">${entry.label}</text>
      `
    )
    .join("");

  return `
    <div class="chart-shell">
      <div class="chart-caption">
        <strong>实际 K 线 + AI 预测线</strong>
        <span>点一下 K 线或预测点，可看详细价格</span>
      </div>
      <svg class="market-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="${item.name} 实际 K 线与 AI 预测线">
        <rect x="${chartLeft}" y="${chartTop}" width="${chartWidth}" height="${chartHeight}" class="chart-panel"></rect>
        ${gridLines}
        <polyline class="actual-close-line" points="${actualClosePoints}"></polyline>
        ${candleMarkup}
        <polyline class="forecast-line" points="${forecastPolyline}"></polyline>
        ${forecastMarkers}
        <line x1="${forecastStartX}" y1="${chartTop}" x2="${forecastStartX}" y2="${chartBottom}" class="forecast-divider"></line>
        ${xLabels}
      </svg>
      <div class="chart-tooltip" hidden></div>
    </div>
  `;
}

function buildCandlestickChart(candles, label) {
  const safe = (candles || []).filter(
    (item) =>
      Number.isFinite(item.open) &&
      Number.isFinite(item.close) &&
      Number.isFinite(item.high) &&
      Number.isFinite(item.low)
  );
  if (!safe.length) return buildLineChart([], label);

  const min = Math.min(...safe.map((item) => item.low));
  const max = Math.max(...safe.map((item) => item.high));
  const spread = max - min || 1;
  const candleWidth = 12;
  const gap = 6;
  const startX = 10;

  const bars = safe
    .map((item, index) => {
      const x = startX + index * (candleWidth + gap);
      const wickX = x + candleWidth / 2;
      const highY = 78 - ((item.high - min) / spread) * 60;
      const lowY = 78 - ((item.low - min) / spread) * 60;
      const openY = 78 - ((item.open - min) / spread) * 60;
      const closeY = 78 - ((item.close - min) / spread) * 60;
      const bodyY = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(openY - closeY));
      const tone = item.close >= item.open ? "#0f7a45" : "#b54739";
      return `
        <line x1="${wickX}" y1="${highY}" x2="${wickX}" y2="${lowY}" stroke="${tone}" stroke-width="2"></line>
        <rect x="${x}" y="${bodyY}" width="${candleWidth}" height="${bodyHeight}" rx="3" fill="${tone}" opacity="0.9"></rect>
      `;
    })
    .join("");

  return `
    <svg class="mini-chart candle-chart" viewBox="0 0 240 88" preserveAspectRatio="none" aria-label="${label}">
      ${bars}
    </svg>
  `;
}

function buildForecastPoints(currentPrice, predictions) {
  const valid = (predictions || []).filter((entry) => Number.isFinite(entry.targetPrice));
  if (!valid.length) {
    return [
      { label: "5天", price: round2(currentPrice) },
      { label: "10天", price: round2(currentPrice) }
    ];
  }

  const projected5 = valid.map((entry) => currentPrice + (entry.targetPrice - currentPrice) * 0.55);
  const projected10 = valid.map((entry) => entry.targetPrice);

  return [
    { label: "5天", price: round2(projected5.reduce((sum, value) => sum + value, 0) / projected5.length) },
    { label: "10天", price: round2(projected10.reduce((sum, value) => sum + value, 0) / projected10.length) }
  ];
}

function buildChartLabels(candles, forecast, chartLeft, stepX, actualSlots) {
  const first = candles[0];
  const mid = candles[Math.floor((candles.length - 1) / 2)];
  const last = candles.at(-1);
  const labels = [
    { x: chartLeft, label: simplifyDateLabel(first?.date, "开始") },
    { x: chartLeft + Math.floor((candles.length - 1) / 2) * stepX, label: simplifyDateLabel(mid?.date, "中间") },
    { x: chartLeft + (actualSlots - 1) * stepX, label: simplifyDateLabel(last?.date, "今天") },
    { x: chartLeft + actualSlots * stepX, label: forecast[0]?.label || "5天" },
    { x: chartLeft + (actualSlots + 1) * stepX, label: forecast[1]?.label || "10天" }
  ];
  return labels;
}

function simplifyDateLabel(value, fallback) {
  if (!value) return fallback;
  const text = String(value);
  if (text.includes("-")) return text.slice(5).replace("-", "/");
  if (text.length >= 4) return text.slice(-4);
  return text;
}

function formatFullDateLabel(value, index = 0) {
  if (!value) return `第${index + 1}天`;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.replaceAll("-", "/");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text;
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}/${text.slice(4, 6)}/${text.slice(6, 8)}`;
  return text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}

function buildFallbackCandles(closes) {
  const safe = (closes || []).filter((value) => Number.isFinite(value) && value > 0);
  const fallbackDates = buildRecentTradingDates(safe.length);
  return safe.map((close, index) => {
    const previous = safe[index - 1] ?? close;
    const drift = close - previous;
    const open = round2(previous);
    const high = round2(Math.max(open, close) + Math.abs(drift) * 0.35 + close * 0.003);
    const low = round2(Math.min(open, close) - Math.abs(drift) * 0.35 - close * 0.003);
    return {
      date: fallbackDates[index],
      open,
      close: round2(close),
      high,
      low
    };
  });
}

function buildRecentTradingDates(count) {
  const dates = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  while (dates.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
      );
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  return dates.reverse();
}

function buildBarChart(values) {
  const safe = values.length ? values : [0];
  const maxAbs = Math.max(...safe.map((value) => Math.abs(value)), 1);
  const width = 240;
  const gap = 10;
  const barWidth = Math.max(12, Math.floor((width - gap * (safe.length + 1)) / safe.length));
  const baseline = 44;
  const bars = safe
    .map((value, index) => {
      const height = Math.max(2, Math.round((Math.abs(value) / maxAbs) * 34));
      const x = gap + index * (barWidth + gap);
      const y = value >= 0 ? baseline - height : baseline;
      const fill = value >= 0 ? "#0f7a45" : "#b54739";
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="6" fill="${fill}"></rect>`;
    })
    .join("");

  return `
    <svg class="mini-chart" viewBox="0 0 240 88" preserveAspectRatio="none" aria-label="已实现盈亏分布">
      <line x1="0" y1="${baseline}" x2="240" y2="${baseline}" stroke="rgba(15,61,62,0.18)" stroke-width="2"></line>
      ${bars}
    </svg>
  `;
}

function normalizeTradeLotSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 100) return 100;
  return Math.round(numeric / 100) * 100;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (appState.settings.apiToken) headers.Authorization = `Bearer ${appState.settings.apiToken}`;
  return headers;
}

function mergeText(target, text) {
  target.textContent = text;
}

function sanitizeCode(value) {
  const code = (value || "").trim();
  return /^\d{6}$/.test(code) ? code : "";
}

function setBusyState(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = label;
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

function calcVolatility(values) {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / average) * 100;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}

function onBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredPrompt = event;
  els.installBtn.hidden = false;
}

async function installPwa() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.installBtn.hidden = true;
}

function mapTrendClass(direction) {
  if (direction === "看涨" || direction === "偏多") return "good";
  if (direction === "看跌" || direction === "偏空") return "bad";
  return "warn";
}

function formatMoney(value) {
  return `¥${roundMoney(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatLargeNumber(value) {
  const numeric = Number(value) || 0;
  if (numeric >= 100000000) return `${round2(numeric / 100000000)} 亿`;
  if (numeric >= 10000) return `${round2(numeric / 10000)} 万`;
  return `${numeric}`;
}

function calculateRecentChange(closes) {
  const safe = (closes || []).filter((value) => Number.isFinite(value) && value > 0);
  if (safe.length < 2) return 0;
  return round2(((safe.at(-1) - safe[0]) / safe[0]) * 100);
}

function formatDateTime(input) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(input));
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

function renderProviderName(provider) {
  if (provider === "anthropic") {
    return "Anthropic";
  }
  if (provider === "openai") {
    return "OpenAI";
  }
  if (provider === "custom") {
    return "自定义接口";
  }
  return "基础分析";
}

function getPreviousAnalysis(current) {
  return (appState.analysisHistory || []).find(
    (item) => item.code === current.code && item.id !== current.id
  );
}

function getHistoryForCode(code) {
  return (appState.analysisHistory || []).filter((item) => item.code === code).slice(0, 5);
}

function calcRiskLevel(volatility, priceGap) {
  if (volatility > 3.5 || priceGap > 4) return "高";
  if (volatility > 2 || priceGap > 2) return "中";
  return "低";
}

function buildKeySignals(momentum, priceVsAverage, volatility, direction) {
  return [
    momentum > 1.5 ? "最近收盘序列维持上行动量。" : momentum < -1.5 ? "最近收盘序列呈现回落动量。" : "最近收盘序列以整理为主。",
    priceVsAverage > 1 ? "现价高于短期均值，买盘相对占优。" : priceVsAverage < -1 ? "现价低于短期均值，短线承压更明显。" : "现价和短期均值接近，方向等待确认。",
    volatility > 3 ? "波动较大，模拟结果对价格变化更敏感。" : "波动可控，适合做节奏跟踪。",
    `综合判断偏向${direction}。`
  ];
}

function buildCautions(volatility, direction, priceVsAverage) {
  const cautions = [];
  if (volatility > 3) cautions.push("短线振幅偏大，建议轻仓模拟，避免把一次波动当成长期趋势。");
  if (direction === "看涨" && priceVsAverage > 3) cautions.push("当前价格已高于均值较多，追涨后回撤风险在上升。");
  if (direction === "看跌" && priceVsAverage < -3) cautions.push("价格已明显走弱，继续下探空间可能不如前段大。");
  if (!cautions.length) cautions.push("当前风险相对温和，适合继续观察 AI 判断和真实市场的偏差。");
  return cautions;
}

function mapRiskClass(level) {
  if (level === "高") return "bad";
  if (level === "中") return "warn";
  return "good";
}

function formatSigned(value) {
  const rounded = round2(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function formatSignedMoney(value) {
  const rounded = roundMoney(value);
  return `${rounded > 0 ? "+" : ""}¥${rounded.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
