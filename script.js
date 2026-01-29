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
    if (dashboard) dashboard.style.display = "grid";
    setTimeout(() => {
      initTicker();
      initMovers();
      renderLedger();
      updateView();
    }, 100);
  } else {
    if (loginScreen) loginScreen.style.display = "flex";
    if (dashboard) dashboard.style.display = "none";
  }
}

function handleLogin() {
  const btn = document.querySelector('#login-screen button');
  if (btn) btn.innerHTML = "VERIFYING...";

  setTimeout(() => {
    localStorage.setItem("institutional_auth", "true");
    location.reload();
  }, 800);
}

function handleLogout() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); backdrop-filter: blur(5px);
    display: flex; justify-content: center; align-items: center; z-index: 10000;
    opacity: 0; transition: opacity 0.5s ease;
  `;
  overlay.innerHTML = `
    <div style="text-align:center; color:white; font-family:'Plus Jakarta Sans'">
        <div style="font-size:3rem; margin-bottom:20px">🔒</div>
        <h2 style="margin:0">Secure Session Terminated</h2>
        <p style="color:#888">Clearing Encrypted Cache...</p>
    </div>
  `;
  document.body.appendChild(overlay);

  setTimeout(() => overlay.style.opacity = '1', 10);

  setTimeout(() => {
    localStorage.removeItem("institutional_auth");
    location.reload();
  }, 2000);
}

/* ===== TAB SWITCH ===== */
function switchTab(tab) {
  const isMarket = tab === "market";
  const viewMarket = document.getElementById("view-market");
  const viewPortfolio = document.getElementById("view-portfolio");

  if (viewMarket) viewMarket.classList.toggle("hidden", !isMarket);
  if (viewPortfolio) viewPortfolio.classList.toggle("hidden", isMarket);

  if (isMarket && viewMarket) viewMarket.classList.add("view-fade");
  else if (!isMarket && viewPortfolio) viewPortfolio.classList.add("view-fade");

  const desktopMarket = document.getElementById("nav-market-desktop");
  const desktopPortfolio = document.getElementById("nav-portfolio-desktop");
  const mobileMarket = document.getElementById("nav-market-mobile");
  const mobilePortfolio = document.getElementById("nav-portfolio-mobile");

  if (desktopMarket) desktopMarket.classList.toggle("active", isMarket);
  if (desktopPortfolio) desktopPortfolio.classList.toggle("active", !isMarket);
  if (mobileMarket) mobileMarket.classList.toggle("active", isMarket);
  if (mobilePortfolio) mobilePortfolio.classList.toggle("active", !isMarket);

  const headerTitle = document.getElementById("header-title");
  if (headerTitle) headerTitle.innerText = isMarket ? "Market Intelligence" : "Asset Ledger";
}

/* ===== BACKEND WAKE-UP ===== */
async function wakeBackend() {
  const statusIcon = document.getElementById("backend-status-icon");
  const statusText = document.getElementById("backend-status-text");

  try {
    if (statusText) statusText.innerText = "WAKING NODES...";
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

  const val = document.getElementById("predictVal");
  const meta = document.getElementById("predictMeta");
  const chart = document.getElementById("tv-chart-main");
  const movers = document.getElementById("movers-container");

  if (val) {
    val.innerHTML = '<span class="pulse-live"></span> ANALYZING...';
    meta.innerText = "Synchronizing with Institutional Nodes...";
  }

  if (chart) chart.innerHTML = '<div class="skeleton" style="height:100%;width:100%"></div>';
  if (movers) movers.innerHTML = '<div class="skeleton" style="height:100%;width:100%;padding:20px"></div>';

  try {
    const [data, news] = await Promise.all([
      robustFetch(`https://stock-prediction-3-ohd2.onrender.com/predict?symbol=${ticker}`)
        .catch(e => { console.error("Predict Fail:", e); return { error: true, message: e.message }; }),
      robustFetch(`https://stock-prediction-3-ohd2.onrender.com/news?symbol=${ticker}`)
        .catch(e => { console.error("News Fail:", e); return []; })
    ]);

    if (data.error) throw new Error(data.message || "Predict Failed");

    data.news = news;
    _CACHE.set(ticker, data);
    renderWithData(data);
  } catch (e) {
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

  if (terminalSymbol) terminalSymbol.innerText = `CORE_ID: ${trueSymbol}`;

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
      container_id: "tv-chart-main",
    });
  }

  // Update News Wire (COL 3)
  const newsWire = document.getElementById("news-container");
  if (data.news && data.news.length > 0 && newsWire) {
    newsWire.innerHTML = `<div style="padding:10px;overflow-y:auto;height:100%">
      ${data.news.slice(0, 15).map(n => `
        <div style="margin-bottom:15px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:12px">
            <a href="${n.link}" target="_blank" style="color:var(--text-primary);text-decoration:none;font-size:0.85rem;font-weight:700;display:block;margin-bottom:6px;line-height:1.4;transition:color 0.2s" onmouseover="this.style.color='var(--accent-glow)'" onmouseout="this.style.color='var(--text-primary)'">${n.title}</a>
            <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:6px;display:flex;justify-content:space-between;font-family:'JetBrains Mono'">
                <span style="color:var(--accent-soft)">${n.publisher}</span>
                <span>${new Date(n.providerPublishTime * 1000).toLocaleDateString()}</span>
            </div>
        </div>
      `).join('')}
    </div>`;
  }

  initMovers();

  // Update AI Signal
  const isUp = data.prediction === "UP";
  if (val) {
      val.innerText = isUp ? "STRONG BUY" : "SELL / SHORT";
      val.style.color = isUp ? "var(--success)" : "var(--danger)";
      val.style.fontSize = "1.8rem";
      val.style.fontWeight = "900";
      val.style.textShadow = isUp ? "0 0 25px rgba(63, 185, 80, 0.4)" : "0 0 25px rgba(248, 81, 73, 0.4)";
  }

  const signalCard = document.getElementById("card-signal");
  if (window.innerWidth < 900 && signalCard) {
    signalCard.style.borderColor = isUp ? "var(--success)" : "var(--danger)";
    signalCard.style.boxShadow = isUp ? "0 0 30px rgba(63, 185, 80, 0.2)" : "0 0 30px rgba(248, 81, 73, 0.2)";
  }

  if (meta) meta.innerText = `${data.symbol} | $${data.price}`;
  if (prob) {
      let confVal = data.confidence * 100;
      if (confVal > 99.9) confVal = 99.9;
      prob.innerText = confVal.toFixed(2) + "%";
  }
}

function handleUpdateError(e) {
  const val = document.getElementById("predictVal");
  const meta = document.getElementById("predictMeta");
  const prob = document.getElementById("ai-prob");
  console.error(e);
  if (val) {
    val.innerText = e.message === "Symbol Not Found" ? "INVALID SYMBOL" : "OFFLINE";
    val.style.color = "var(--warning)";
    if (meta) meta.innerText = e.message === "Symbol Not Found" ? "Try: MSFT, AAPL, BTCUSD" : "Backend Connection Failed";
    if (prob) prob.innerText = "ERR";
  }
  initMovers();
}

/* ===== LEDGER LOGIC ===== */
function renderLedger() {
  const container = document.getElementById("assetTable");
  if (!container) return;
  container.innerHTML = "";

  myAssets.forEach((asset, index) => {
    const price = (Math.random() * 500 + 100).toFixed(2);
    const change = (Math.random() * 4 - 2).toFixed(2);
    const isPos = change >= 0;

    container.innerHTML += `
      <div class="ledger-row-div">
        <div class="cell-security" onclick="viewSymbol('${asset}')" style="cursor:pointer;color:var(--accent-glow);font-weight:800;font-size:1.1rem">${asset}</div>
        <div class="cell-status" style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center;">
          <span class="pulse-live" style="width:6px; height:6px; margin-right:5px"></span> ACTIVE
        </div>
        <div class="cell-price" style="font-family:'JetBrains Mono'">$${price}</div>
        <div class="cell-change" style="color:${isPos ? 'var(--success)' : 'var(--danger)'}; font-family:'JetBrains Mono'">${isPos ? '+' : ''}${change}%</div>
        <div class="cell-action">
          <button onclick="removeAsset(${index})" style="background:none;border:1px solid var(--danger);color:var(--danger);padding:6px 12px;font-size:.7rem;border-radius:8px;cursor:pointer;transition:all 0.2s">REMOVE</button>
        </div>
      </div>
    `;
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
  }
}

function removeAsset(index) {
  myAssets.splice(index, 1);
  renderLedger();
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
    search.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        updateView();
      }
    });
  }
};