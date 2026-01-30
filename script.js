/**
 * STOCKAI PRO - INSTITUTIONAL TERMINAL CONTROLLER
 * Handles Session, Market Data, AI Signals, and Portfolio Ledger
 */

// Configuration
const API_BASE_URL = "https://stock-prediction-3-ohd2.onrender.com"; 
let currentTicker = "NASDAQ:AAPL";
let myAssets = JSON.parse(localStorage.getItem("stockai_ledger")) || ["AAPL", "NVDA", "TSLA", "BTCUSD"];

/* ===== SESSION MANAGEMENT ===== */
function checkSession() {
  const isAuth = localStorage.getItem("institutional_auth") === "true";
  const loginScreen = document.getElementById("login-screen");
  const dashboard = document.getElementById("mainDashboard");

  if (isAuth) {
    if (loginScreen) loginScreen.style.display = "none";
    if (dashboard) {
        dashboard.style.display = "grid"; 
        // Force opacity for smooth entry
        requestAnimationFrame(() => {
            dashboard.style.opacity = '1';
        });
    }
    setTimeout(() => {
      initTicker();
      initMovers();
      renderLedger();
      console.log("System Initialized");
    }, 100);
  } else {
    if (loginScreen) loginScreen.style.display = "flex";
    if (dashboard) dashboard.style.display = "none";
  }
}

function handleLogin() {
  const btn = document.querySelector('#login-screen button');
  if (btn) btn.innerHTML = "ACCESS GRANTED...";
  btn.style.background = "var(--accent-success)";

  setTimeout(() => {
    localStorage.setItem("institutional_auth", "true");
    checkSession();
  }, 500);
}

function bypassLogin() {
    localStorage.setItem("institutional_auth", "true");
    checkSession();
    // Force DOM update in case checkSession fails due to cache
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("mainDashboard").style.display = "grid";
}

function handleLogout() {
  localStorage.removeItem("institutional_auth");
  location.reload();
}

/* ===== TAB NAVIGATION ===== */
function switchTab(tab) {
  const isMarket = tab === "market";
  const viewMarket = document.getElementById("view-market");
  const viewPortfolio = document.getElementById("view-portfolio");

  if (viewMarket) {
    if (isMarket) viewMarket.classList.remove("hidden");
    else viewMarket.classList.add("hidden");
  }
  
  if (viewPortfolio) {
    if (!isMarket) viewPortfolio.classList.remove("hidden");
    else viewPortfolio.classList.add("hidden");
  }

  // Active States
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  
  if (isMarket) {
    const d = document.getElementById("nav-market-desktop");
    const m = document.getElementById("nav-market-mobile");
    if(d) d.classList.add("active");
    if(m) m.classList.add("active");
  } else {
    const d = document.getElementById("nav-portfolio-desktop");
    const m = document.getElementById("nav-portfolio-mobile");
    if(d) d.classList.add("active");
    if(m) m.classList.add("active");
  }
}

/* ===== TICKER WIDGET ===== */
function initTicker() {
  const container = document.getElementById("ticker-container");
  if (!container) return;
  container.innerHTML = "";
  
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
  script.async = true;
  script.innerHTML = JSON.stringify({
    symbols: [
      { proName: "NASDAQ:AAPL", title: "Apple" },
      { proName: "NASDAQ:NVDA", title: "Nvidia" },
      { proName: "NASDAQ:TSLA", title: "Tesla" },
      { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
      { proName: "FOREXCOM:SPXUSD", title: "S&P 500" }
    ],
    colorTheme: "dark",
    isTransparent: true,
    displayMode: "adaptive",
    locale: "en"
  });
  container.appendChild(script);
}

/* ===== MARKET DATA & AI ===== */
/* Robust Fetch Helper */
async function robustFetch(url, retries = 3) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return robustFetch(url, retries - 1);
    }
    throw error;
  }
}

async function updateView() {
  const input = document.getElementById("stockSearch");
  const symbol = input && input.value ? input.value.toUpperCase().trim() : currentTicker;
  
  // UI Loading State
  const val = document.getElementById("predictVal");
  const meta = document.getElementById("predictMeta");
  if (val) {
     val.innerText = "ANALYZING...";
     val.style.color = "var(--text-muted)";
  }
  if (meta) meta.innerText = "Querying Neural Network...";

  try {
    // Parallel Fetch: Prediction + News
    const [predData, newsData] = await Promise.all([
      robustFetch(`${API_BASE_URL}/predict?symbol=${symbol}`).catch(e => ({ error: true, message: e.message })),
      robustFetch(`${API_BASE_URL}/news?symbol=${symbol}`).catch(() => [])
    ]);

    if (predData.error) {
        window.isBackendConnected = false;
        throw new Error(predData.message);
    }
    
    // Success -> Backend is alive
    window.isBackendConnected = true;

    // Update State
    currentTicker = predData.symbol; // Use returned normalized symbol
    if (input) input.value = ""; // Clear search bar

    renderPrediction(predData);
    renderChart(predData.tv_symbol || symbol);
    renderNews(newsData, predData.tv_symbol || symbol);
    
    // Update Header Symbol
    const title = document.getElementById("terminal-symbol");
    if(title) title.innerText = predData.tv_symbol || symbol;

  } catch (e) {
    console.error(e);
    window.isBackendConnected = false; // Connection failed
    
    if (val) {
        val.innerText = "DATA ERROR";
        val.style.color = "var(--accent-danger)";
    }
    if (meta) meta.innerText = "Connection failed or symbol invalid";
  }
}

function renderPrediction(data) {
  const val = document.getElementById("predictVal");
  const meta = document.getElementById("predictMeta");
  const prob = document.getElementById("ai-prob");
  const bar = document.getElementById("confidence-bar");

  // Safeguard: Check invalid Data
  const price = parseFloat(data.price) || 0;
  const sma = parseFloat(data.sma_20) || 0;
  
  // If we have no price or no SMA, don't show SELL. Show ANALYZING/NEUTRAL.
  let isBull = false;
  let label = "NEUTRAL";
  let color = "var(--text-muted)";
  
  if (price > 0 && sma > 0) {
      isBull = data.prediction === "UP" || data.prediction === "Bullish";
      label = isBull ? "▲ STRONG BUY" : "▼ STRONG SELL";
      color = isBull ? "var(--accent-success)" : "var(--accent-danger)";
  } else {
      label = "● ANALYZING";
      color = "var(--accent-warning)"; // Yellow for neutral/loading
  }
  
  if (val) {
    val.innerHTML = label;
    val.style.color = color;
  }
  
  if (meta) {
    // Advanced Stats Integration
    let rsiHTML = "";
    if (data.rsi) {
        let rsiColor = "var(--text-muted)";
        if (data.rsi > 70) rsiColor = "var(--accent-danger)";
        if (data.rsi < 30) rsiColor = "var(--accent-success)";
        rsiHTML = `<div style="margin-top:10px; display:flex; gap:15px; font-size:0.8rem; font-family:var(--font-mono);">
            <span>RSI: <span style="color:${rsiColor}">${data.rsi}</span></span>
            <span>SMA20: <span style="color:var(--text-primary)">$${data.sma_20}</span></span>
        </div>`;
    }
    
    meta.innerHTML = `Target: <span style="color:white">$${data.price || '---'}</span>${rsiHTML}`;
  }

  const confidence = (data.probability || data.confidence * 100 || 0).toFixed(1);
  if (prob) prob.innerText = `${confidence}%`;
  if (bar) {
    bar.style.width = `${confidence}%`;
    bar.style.backgroundColor = color;
    // Add glowing effect to the bar
    bar.style.boxShadow = `0 0 10px ${color}`;
  }
}

function renderChart(tvSymbol) {
  const containerId = "tv-chart-main";
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = ""; // Clear existing
  new TradingView.widget({
    autosize: true,
    symbol: tvSymbol,
    interval: "D",
    timezone: "Etc/UTC",
    theme: "dark",
    style: "1",
    locale: "en",
    toolbar_bg: "#f1f3f6",
    enable_publishing: false,
    allow_symbol_change: true,
    container_id: containerId,
    hide_side_toolbar: false,
    width: "100%",
    height: "100%",
    // Advanced Features
    withdateranges: true,
    details: true,
    hotlist: true,
    calendar: true,
    show_popup_button: true,
    popup_width: "1000",
    popup_height: "650"
  });
}

function renderNews(newsItems, fallbackSymbol) {
  const container = document.getElementById("news-container");
  if (!container) return;

  // Strict check: If null, undefined, or empty array -> Fallback
  if (!newsItems || !Array.isArray(newsItems) || newsItems.length === 0) {
    console.log("News API returned empty/invalid. Loading Widget for:", fallbackSymbol);
    container.innerHTML = "";
    
    // Create a container for the widget to ensure height
    const widgetContainer = document.createElement("div");
    widgetContainer.style.height = "100%";
    widgetContainer.style.width = "100%";
    widgetContainer.id = "news-widget-inner";
    container.appendChild(widgetContainer);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      feedMode: "symbol",
      symbol: fallbackSymbol || currentTicker,
      colorTheme: "dark",
      isTransparent: true,
      displayMode: "regular",
      locale: "en",
      height: "100%",
      width: "100%"
    });
    widgetContainer.appendChild(script);
    return;
  }
  
  // ... (Rest of function)

  // API News Render
  const html = newsItems.slice(0, 8).map(item => `
    <div onclick="window.open('${item.link}', '_blank')" 
         style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; transition:all 0.2s; position:relative;">
        <div style="font-size:0.95rem; font-weight:600; margin-bottom:6px; line-height:1.4; color:var(--text-primary);">${item.title}</div>
        <div style="font-size:0.75rem; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
            <span style="color:var(--accent-glow); display:flex; align-items:center; gap:5px;">
              <span>📰</span> ${item.publisher}
            </span>
            <span>${new Date(item.providerPublishTime * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
    </div>
  `).join('');
  
  container.innerHTML = `<div style="overflow-y:auto; height:100%; scrollbar-width:thin;">${html}</div>`;
}

/* ===== PORTFOLIO LEDGER ===== */
function renderLedger() {
  const container = document.getElementById("assetTable");
  if (!container) return;

  if (myAssets.length === 0) {
    container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-secondary);">No assets tracked. Add a symbol above.</div>`;
    return;
  }

  let html = `
    <table class="ledger-table">
        <thead>
            <tr>
                <th>ASSET</th>
                <th>LAST</th>
                <th>CHANGE</th>
                <th>ACTION</th>
            </tr>
        </thead>
        <tbody>
  `;

  myAssets.forEach((asset, index) => {
    // Simulating data for now (in real app, fetch from API)
    const price = (Math.random() * 1000).toFixed(2);
    const change = (Math.random() * 10 - 5);
    const isPos = change >= 0;
    const changeStr = `${isPos ? '+' : ''}${change.toFixed(2)}%`;
    const colorClass = isPos ? "text-green" : "text-red";

    html += `
        <tr>
            <td style="font-weight:700; color:var(--accent-glow); cursor:pointer;" onclick="viewSymbol('${asset}')">${asset}</td>
            <td class="font-mono">$${price}</td>
            <td class="font-mono ${colorClass}">${changeStr}</td>
            <td>
                <button onclick="removeAsset(${index})" style="background:transparent; border:1px solid var(--accent-danger); color:var(--accent-danger); padding:4px 8px; border-radius:4px; cursor:pointer; font-size:0.7rem;">REMOVE</button>
            </td>
        </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
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

function viewSymbol(sym) {
  const input = document.getElementById("stockSearch");
  if(input) input.value = sym;
  switchTab('market');
  updateView();
}

/* ===== HELPERS ===== */
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
    locale: "en",
    width: "100%",
    height: "100%",
    isTransparent: true
  });
  container.appendChild(script);
}

/* ===== MARKET SESSION CLOCK ===== */
function updateMarketStatus() {
  const brand = document.querySelector('.brand');
  if (!brand) return;

  let clock = document.getElementById("market-clock");
  if (!clock) { // Create if doesn't exist
    clock = document.createElement("span"); // Use span to sit inline
    clock.id = "market-clock";
    clock.style.fontSize = "0.9rem";
    clock.style.color = "var(--text-secondary)";
    clock.style.marginLeft = "15px";
    clock.style.fontFamily = "'JetBrains Mono', monospace";
    brand.appendChild(clock);
  }

  const now = new Date();
  let hours = now.getHours();
  let ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  
  // Just the time.
  // Default to Green (Optimistic UI) 
  let statusColor = "var(--accent-success)"; 
  
  if (window.isBackendConnected === false) {
      statusColor = "var(--accent-danger)";
  }
  
  clock.style.color = statusColor;
  clock.innerHTML = `● ${hours}:${minutes}:${seconds} ${ampm}`;
}


// Start Clock
setInterval(updateMarketStatus, 1000);
updateMarketStatus();

/* ===== INITIALIZATION ===== */
window.onload = () => {
    checkSession();
    updateMarketStatus();
    // ...
    
    // Enter key support for search
    const search = document.getElementById("stockSearch");
    if(search) {
        search.addEventListener("keypress", (e) => {
            if(e.key === "Enter") updateView();
        });
    }

    // Click support for search button
    const searchBtn = document.getElementById("searchBtn");
    if(searchBtn) {
        searchBtn.addEventListener("click", updateView);
    }
};
