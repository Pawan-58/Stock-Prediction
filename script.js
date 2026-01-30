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
    if (dashboard) dashboard.style.display = "flex";
    setTimeout(() => {
      initTicker();
      initMovers();
      renderLedger();
      addLog("SYSTEM_INITIALIZED");
      addLog("READY_FOR_ANALYSIS");
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

  const dMarket = document.getElementById("nav-market-desktop");
  const dPortfolio = document.getElementById("nav-portfolio-desktop");
  const mMarket = document.getElementById("nav-market-mobile");
  const mPortfolio = document.getElementById("nav-portfolio-mobile");

  if (dMarket) dMarket.classList.toggle("active", isMarket);
  if (dPortfolio) dPortfolio.classList.toggle("active", !isMarket);
  if (mMarket) mMarket.classList.toggle("active", isMarket);
  if (mPortfolio) mPortfolio.classList.toggle("active", !isMarket);

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
      if (icon) icon.style.background = "var(--success)";
      if (text) text.innerText = `ONLINE (${latency}ms)`;
      addLog("GATEWAY_SIGNAL_OPTIMAL");
    }
  } catch (e) {
    if (icon) icon.style.background = "var(--danger)";
    if (text) text.innerText = "OFFLINE";
    addLog("NODE_OFFLINE_OR_SPINNING_DOWN");
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
      addLog(`RETRYING_CONNECTION: ${retries}_ATTEMPTS_REMAINING`);
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
    addLog(`STEP_1: CONTACTING_BACKEND_API`);
    const [data, news] = await Promise.all([
      robustFetch(`https://stock-prediction-3-ohd2.onrender.com/predict?symbol=${ticker}`)
        .catch(e => { 
          addLog(`PREDICTION_ERROR: ${e.message}`); 
          return { error: true, message: e.message }; 
        }),
      robustFetch(`https://stock-prediction-3-ohd2.onrender.com/news?symbol=${ticker}`)
        .catch(e => { 
          addLog("NEWS_FETCH_FAILED"); 
          return []; 
        })
    ]);

    if (data.error) {
      throw new Error(data.message || "Failed to fetch prediction");
    }

    addLog(`STEP_2: DATA_RECEIVED - ${ticker}`);
    addLog(`PREDICTION: ${data.prediction || 'N/A'}`);
    addLog(`CONFIDENCE: ${((data.probability || data.confidence) * 100).toFixed(1)}%`);
    
    data.news = news;
    _CACHE.set(ticker, data);
    renderWithData(data);
  } catch (e) {
    addLog(`ERROR: ${e.message}`);
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

  if (terminalSymbol) terminalSymbol.innerText = `${tvSymbol}`;

  // Update AI Signal with Premium Styling
  if (val) {
    const isBull = data.prediction === "UP" || data.prediction === "Bullish";
    
    // Smooth transition
    val.style.opacity = '0';
    setTimeout(() => {
      val.innerText = isBull ? "🚀 STRONG BUY" : "⚠️ SELL SIGNAL";
      val.style.color = isBull ? "#26A69A" : "#EF5350";
      val.style.textShadow = `0 0 30px ${isBull ? "rgba(38, 166, 154, 0.6)" : "rgba(239, 83, 80, 0.6)"}`;
      val.style.opacity = '1';
    }, 200);
    
    if (meta) {
      meta.innerText = `${trueSymbol} • $${data.price || 'N/A'} • ${data.reason || "AI analysis complete"}`;
      meta.style.color = "#B8C5D6";
    }
  }

  // Update Confidence Bar with Animation
  if (prob) {
    let conf = (data.probability || data.confidence * 100).toFixed(1);
    prob.innerText = `${conf}%`;
    const bar = document.getElementById("confidence-bar");
    if (bar) {
      setTimeout(() => {
        bar.style.width = `${conf}%`;
      }, 300);
    }
  }

  // Update Chart - ALWAYS render for searched symbol
  if (chartContainer) {
    chartContainer.innerHTML = "";
    addLog(`LOADING_CHART: ${tvSymbol}`);
    new TradingView.widget({
      autosize: true,
      symbol: tvSymbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "#0a0e27",
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      container_id: "tv-chart-main",
    });
  }

  // Update News Wire with Premium Cards
  const newsWire = document.getElementById("news-container");
  if (newsWire) {
    if (data.news && data.news.length > 0) {
      newsWire.innerHTML = data.news.slice(0, 10).map(n => `
        <div class="news-item" onclick="window.open('${n.link}', '_blank')">
          <div class="news-title">${n.title}</div>
          <div class="news-meta">
            <span style="color:#4A9EFF">${n.publisher}</span>
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
  addLog(`✓ ANALYSIS_COMPLETE: ${trueSymbol}`);
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
    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 120px; padding: 16px 20px; color:#6B7A8F; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid rgba(100, 150, 255, 0.15); background:rgba(255,255,255,0.02);">
      <div>ASSET</div>
      <div>STATUS</div>
      <div>PRICE</div>
      <div>CHANGE</div>
      <div>ACTION</div>
    </div>
  `;

  myAssets.forEach((asset, index) => {
    const price = (Math.random() * 500 + 100).toFixed(2);
    const change = (Math.random() * 4 - 2).toFixed(2);
    const isPos = change >= 0;

    const row = document.createElement("div");
    row.style.cssText = "display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 120px; padding: 20px; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.03); transition: all 0.3s; border-radius:8px; margin:4px 0;";
    row.onmouseover = () => {
      row.style.background = "rgba(74, 158, 255, 0.05)";
      row.style.transform = "translateX(4px)";
    };
    row.onmouseout = () => {
      row.style.background = "transparent";
      row.style.transform = "translateX(0)";
    };
    
    row.innerHTML = `
      <div onclick="viewSymbol('${asset}')" style="cursor:pointer; color:#4A9EFF; font-weight:700; font-family:'JetBrains Mono'; font-size:0.95rem;">${asset}</div>
      <div style="font-size:0.7rem; color:#00E676;"><span style="width:6px; height:6px; border-radius:50%; background:#00E676; display:inline-block; margin-right:8px; box-shadow:0 0 8px #00E676;"></span>ACTIVE</div>
      <div style="font-family:'JetBrains Mono'; font-size:0.9rem; color:#FFFFFF;">$${price}</div>
      <div style="color:${isPos ? '#00E676' : '#FF5252'}; font-family:'JetBrains Mono'; font-size:0.9rem; font-weight:600;">${isPos ? '+' : ''}${change}%</div>
      <div>
        <button onclick="removeAsset(${index})" style="background:linear-gradient(135deg, #FF5252 0%, #FF1744 100%); border:none; color:white; padding:6px 16px; border-radius:8px; font-size:0.65rem; cursor:pointer; font-weight:600; transition:all 0.3s; text-transform:uppercase;">Remove</button>
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
