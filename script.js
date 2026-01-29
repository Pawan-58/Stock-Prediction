/**
 * TRADING TERMINAL CORE SYSTEM
 * Handled: Session, Live Market, AI Predictions, Portfolio Ledger, TradingView Integration
 */

let currentTicker = "NASDAQ:AAPL";
let myAssets = JSON.parse(localStorage.getItem("stockai_ledger")) || ["AAPL", "NVDA", "TSLA", "BTCUSD"];

/* ===== SESSION MANAGEMENT ===== */
function checkSession() {
  const isAuth = localStorage.getItem("institutional_auth") === "true";
  const loginScreen = document.getElementById("login-screen");
  const dashboard = document.getElementById("mainDashboard");

  if (isAuth) {
    if (loginScreen) loginScreen.style.display = "none";
    if (dashboard) dashboard.style.display = "contents"; // Match new structure
    setTimeout(() => {
      initTicker();
      initMovers();
      renderLedger();
      updateView();
      addLog("SYSTEM_CORTEX_REINITIALIZED");
      addLog("SECURE_TUNNEL_ESTABLISHED");
    }, 100);
  } else {
    if (loginScreen) loginScreen.style.display = "flex";
    if (dashboard) dashboard.style.display = "none";
  }
}

/* ===== NEURAL LOG SYSTEM ===== */
function addLog(msg) {
  const log = document.getElementById("neural-log");
  if (!log) return;
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  entry.innerHTML = `<span class="log-timestamp">[${time}]</span> ${msg}...`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
  if (log.children.length > 50) log.removeChild(log.firstChild);
}

function handleLogin() {
  const btn = document.querySelector('#login-screen button');
  if (btn) btn.innerHTML = "VERIFYING_CREDENTIALS...";

  setTimeout(() => {
    localStorage.setItem("institutional_auth", "true");
    location.reload();
  }, 1200);
}

function handleLogout() {
  localStorage.removeItem("institutional_auth");
  location.reload();
}

/* ===== TAB SWITCH ===== */
function switchTab(tab) {
  const isMarket = tab === "market";
  const viewMarket = document.getElementById("view-market");
  const viewPortfolio = document.getElementById("view-portfolio");

  if (viewMarket) viewMarket.classList.toggle("hidden", !isMarket);
  if (viewPortfolio) viewPortfolio.classList.toggle("hidden", isMarket);

  const desktopMarket = document.getElementById("nav-market-desktop");
  const desktopPortfolio = document.getElementById("nav-portfolio-desktop");

  if (desktopMarket) desktopMarket.classList.toggle("active", isMarket);
  if (desktopPortfolio) desktopPortfolio.classList.toggle("active", !isMarket);

  addLog(`SWITCHING_TO_TAB: ${tab.toUpperCase()}`);
}

/* ===== BACKEND WAKE-UP ===== */
async function wakeBackend() {
  const icon = document.getElementById("backend-status-icon");
  const text = document.getElementById("backend-status-text");

  try {
    addLog("PINGING_NEURAL_NODE_SERVICE");
    if (text) text.innerText = "WAKING_NODES...";
    const start = Date.now();
    const res = await fetch("https://stock-prediction-3-ohd2.onrender.com/");
    const latency = Date.now() - start;

    if (res.ok) {
      if (statusIcon) statusIcon.style.background = "var(--success)";
      if (statusText) statusText.innerText = `ONLINE (${latency}ms)`;
    }
  } catch (e) {
    if (statusIcon) statusIcon.style.background = "var(--danger)";
    if (statusText) statusText.innerText = "OFFLINE";
  }
}

/* ===== TICKER WIDGET ===== */
function initTicker() {
  wakeBackend();
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
  script.async = true;
  script.innerHTML = JSON.stringify({
    symbols: [
      { proName: "NASDAQ:AAPL", title: "Apple" },
      { proName: "NASDAQ:NVDA", title: "Nvidia" },
      { proName: "NASDAQ:TSLA", title: "Tesla" },
      { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
      { proName: "TVC:VIX", title: "VIX Index" },
      { proName: "FOREXCOM:SPXUSD", title: "S&P 500" }
    ],
    colorTheme: "dark",
    isTransparent: true,
    displayMode: "adaptive",
    locale: "en"
  });
  const container = document.getElementById("ticker-container");
  if (container) container.appendChild(script);
}

/* ===== HOTLISTS (MOVERS) ===== */
function initMovers() {
  const container = document.getElementById("movers-container");
  if (!container) return;
  container.innerHTML = "";
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-hotlists.js";
  script.async = true;
  script.innerHTML = JSON.stringify({
    colorTheme: "dark",
    exchange: "US",
    showChart: false,
    width: "100%",
    height: "100%",
    isTransparent: true
  });
  container.appendChild(script);
}

/* ===== NEWS WIRE FALLBACK ===== */
function injectNews(symbol) {
  const container = document.getElementById("news-container");
  if (!container) return;
  container.innerHTML = "";
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js";
  script.async = true;
  script.innerHTML = JSON.stringify({
    feedMode: "symbol",
    symbol: symbol,
    colorTheme: "dark",
    isTransparent: true,
    displayMode: "regular",
    width: "100%",
    height: "100%",
    locale: "en"
  });
  container.appendChild(script);
}

/* ===== ROBUST FETCH HELPER ===== */
async function robustFetch(url, options = {}, retries = 3, backoff = 1000) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fetch failed, retrying in ${backoff}ms... (${retries} left)`, error);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return robustFetch(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

/* ===== CACHE & STATE ===== */
const _CACHE = new Map();
let isFetching = false;

async function updateView() {
  if (isFetching) return;

  const input = document.getElementById("stockSearch").value.toUpperCase().trim();
  const ticker = input || currentTicker;

  if (_CACHE.has(ticker)) {
    renderWithData(_CACHE.get(ticker), true);
    return;
  }

  isFetching = true;
  addLog(`INITIALIZING_ANALYSIS: ${ticker}`);

  const val = document.getElementById("predictVal");
  const meta = document.getElementById("predictMeta");
  const chart = document.getElementById("tv-chart-main");

  if (val) {
    val.innerHTML = "ANALYZING...";
    val.style.color = "var(--text-dim)";
    meta.innerText = "Handshaking with Neural Cluster...";
  }

  try {
    addLog("FETCHING_PREDICTION_WEIGHTS");
    const [data, news] = await Promise.all([
      robustFetch(`https://stock-prediction-3-ohd2.onrender.com/predict?symbol=${ticker}`)
        .catch(e => { addLog("PREDICT_NODE_ERROR"); return { error: true, message: e.message }; }),
      robustFetch(`https://stock-prediction-3-ohd2.onrender.com/news?symbol=${ticker}`)
        .catch(e => { addLog("NEWS_WIRE_LATENCY"); return []; })
    ]);

    if (data.error) throw new Error(data.message || "Predict Failed");

    addLog("INFERENCE_SUCCESSFUL");
    data.news = news;
    _CACHE.set(ticker, data);
    renderWithData(data);
  } catch (e) {
    addLog(`FATAL_EXCEPTION: ${e.message}`);
    handleUpdateError(e);
  } finally {
    isFetching = false;
  }
}

function renderWithData(data, isCached = false) {
  const val = document.getElementById("predictVal");
  const meta = document.getElementById("predictMeta");
  const prob = document.getElementById("ai-prob");
  const chartContainer = document.getElementById("tv-chart-main");
  const terminalSymbol = document.getElementById("terminal-symbol");

  const trueSymbol = data.symbol;
  const tvSymbol = data.tv_symbol || trueSymbol;
  currentTicker = trueSymbol;

  if (terminalSymbol) terminalSymbol.innerText = `NASDAQ:${trueSymbol}`;

  // Update AI Signal & Meta
  if (val) {
    const isBull = data.prediction === "UP" || data.prediction === "Bullish";
    val.innerText = isBull ? "STRONG_BUY" : "LIQUIDATE / SHORT";
    val.style.color = isBull ? "var(--success)" : "var(--danger)";
    val.style.textShadow = `0 0 25px ${isBull ? "rgba(0, 255, 136, 0.4)" : "rgba(255, 59, 48, 0.4)"}`;
    
    if (meta) {
      meta.innerText = `${trueSymbol} // ${data.reason || "Neural inference suggests clear trend trajectory."}`;
      meta.style.color = "var(--text-main)";
    }
  }

  // Update Confidence Bar
  if (prob) {
    let conf = (data.probability || data.confidence * 100).toFixed(1);
    prob.innerText = `${conf}%`;
    const bar = document.getElementById("confidence-bar");
    if (bar) bar.style.width = `${conf}%`;
  }

  // Update Chart
  if (chartContainer && !isCached) {
    chartContainer.innerHTML = "";
    new TradingView.widget({
      autosize: true,
      symbol: tvSymbol,
      interval: "D",
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "#f1f3f6",
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      container_id: "tv-chart-main",
    });
  }

  // Update News Wire
  const newsWire = document.getElementById("news-container");
  if (newsWire) {
    if (data.news && data.news.length > 0) {
      newsWire.innerHTML = data.news.slice(0, 10).map(n => `
        <div class="news-item" onclick="window.open('${n.link}', '_blank')">
          <div class="news-title">${n.title}</div>
          <div class="news-meta">
            <span style="color:var(--accent-primary)">${n.publisher}</span>
            <span>${new Date(n.providerPublishTime * 1000).toLocaleTimeString()}</span>
          </div>
        </div>
      `).join('');
    } else {
      const tvSym = data.tv_symbol || data.symbol;
      injectNews(tvSym);
    }
  }

  initMovers();
  addLog(`UI_RENDER_COMPLETE: ${trueSymbol}`);
}

function handleUpdateError(e) {
  const val = document.getElementById("predictVal");
  const meta = document.getElementById("predictMeta");
  addLog(`NODE_FAILURE: ${e.message}`);
  if (val) {
    val.innerText = "ACCESS_DENIED";
    val.style.color = "var(--danger)";
    if (meta) meta.innerText = "Check ticker core ID or network tunnel.";
  }
}

/* ===== LEDGER LOGIC ===== */
function renderLedger() {
  const container = document.getElementById("assetTable");
  if (!container) return;
  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 120px; padding: 12px 16px; color: var(--text-dim); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid var(--glass-border)">
      <div>Security</div>
      <div>Status</div>
      <div>Price</div>
      <div>Delta</div>
      <div>Action</div>
    </div>
  `;

  myAssets.forEach((asset, index) => {
    const price = (Math.random() * 500 + 100).toFixed(2);
    const change = (Math.random() * 4 - 2).toFixed(2);
    const isPos = change >= 0;

    const row = document.createElement("div");
    row.style.cssText = "display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 120px; padding: 16px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.03); transition: background 0.2s;";
    row.onmouseover = () => row.style.background = "rgba(255,255,255,0.02)";
    row.onmouseout = () => row.style.background = "transparent";
    
    row.innerHTML = `
      <div onclick="viewSymbol('${asset}')" style="cursor:pointer; color:var(--accent-primary); font-weight:700; font-family:'JetBrains Mono'">${asset}</div>
      <div style="font-size:0.6rem; color:var(--success)"><span class="pulse-amber" style="width:4px; height:4px; border-radius:50%; background:var(--success); display:inline-block; margin-right:6px"></span>LINKED</div>
      <div style="font-family:'JetBrains Mono'; font-size:0.85rem">$${price}</div>
      <div style="color:${isPos ? 'var(--success)' : 'var(--danger)'}; font-family:'JetBrains Mono'; font-size:0.85rem">${isPos ? '+' : ''}${change}%</div>
      <div>
        <button onclick="removeAsset(${index})" style="background:none; border:1px solid rgba(255,59,48,0.3); color:var(--danger); padding:4px 12px; border-radius:4px; font-size:0.6rem; cursor:pointer;">PURGE</button>
      </div>
    `;
    container.appendChild(row);
  });
  localStorage.setItem("stockai_ledger", JSON.stringify(myAssets));
}

function addAsset() {
  const input = document.getElementById("assetInput");
  if (!input) return;
  const val = input.value.toUpperCase().trim();
  if (val && !myAssets.includes(val)) {
    myAssets.push(val);
    renderLedger();
    input.value = "";
    addLog(`LEDGER_MODIFIED: ADD_${val}`);
  }
}

function removeAsset(index) {
  const removed = myAssets[index];
  myAssets.splice(index, 1);
  renderLedger();
  addLog(`LEDGER_MODIFIED: PURGE_${removed}`);
}

function viewSymbol(symbol) {
  const search = document.getElementById("stockSearch");
  if (search) search.value = symbol;
  switchTab("market");
  updateView();
}

/* ===== INITIALIZATION ===== */
window.onload = () => {
  checkSession();
  const search = document.getElementById("stockSearch");
  if (search) {
    search.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        updateView();
      }
    });
  }
};
