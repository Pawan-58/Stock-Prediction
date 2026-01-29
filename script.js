/**
 * TRADING TERMINAL CORE SYSTEM
 * Handled: Live Market, AI Predictions, Portfolio Ledger, TradingView Integration
 */

// ================= CONFIG & STATE =================
const BACKEND_URL = "https://stock-prediction-3-ohd2.onrender.com";

const State = {
    currentSymbol: "AAPL",
    currentExchange: "NASDAQ",
    fullTicker: "NASDAQ:AAPL",
    isAnalyzing: false
};

// DOM Elements Registry
const DOM = {
    symbolInput: () => document.getElementById("stockInput") || document.getElementById("symbol") || document.getElementById("stockSearch"),
    predictBtn: document.getElementById("predictBtn"),
    statusMessage: document.getElementById("statusMessage"),
    predictionResult: document.getElementById("predictionResult"),
    selectedLabel: document.getElementById("selectedStockDisplay") || document.getElementById("selectedStock"),
    gainersTable: document.getElementById("gainersTableBody"),
    marketCanvas: document.getElementById("marketChartCanvas"),
    assetTable: document.getElementById("assetTable"),
    assetInput: document.getElementById("assetInput")
};

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", () => {
    console.log("Terminal Initializing...");
    
    // Initialize UI Components
    initChart(State.fullTicker); 
    loadTopGainers();
    loadLiveMarket();
    renderAssets();

    // Event Listeners
    if (DOM.predictBtn) {
        DOM.predictBtn.addEventListener("click", handlePredictionRequest);
    }

    const predictForm = document.getElementById("predictForm");
    if (predictForm) {
        predictForm.addEventListener("submit", (e) => {
            e.preventDefault();
            handlePredictionRequest();
        });
    }

    // Background Refresh Cycles
    setInterval(loadTopGainers, 120000); // 2 min
    setInterval(loadLiveMarket, 30000);  // 30 sec
});

// Optimized Resize Listener (Debounced)
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        console.log("Adjusting UI for new screen size...");
        initChart(State.fullTicker);
    }, 250);
});

// ================= TRADINGVIEW WIDGET =================

function initChart(symbol) {
    const chartContainer = document.getElementById("tv-chart-main") || document.getElementById("tv-chart-container");
    if (!chartContainer) return;

    chartContainer.innerHTML = ""; // Clear existing instance
    
    // Auto-formatting for Indian Stocks if prefix is missing
    let formattedSymbol = symbol;
    if (!symbol.includes(":")) {
        formattedSymbol = symbol.endsWith(".NS") ? `NSE:${symbol.replace(".NS", "")}` : `NASDAQ:${symbol}`;
    }

    new TradingView.widget({
        "autosize": true,
        "symbol": formattedSymbol,
        "interval": "D",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "container_id": chartContainer.id,
        "hide_top_toolbar": window.innerWidth < 768,
        "hide_side_toolbar": window.innerWidth < 768,
        "allow_symbol_change": true,
        "save_image": false,
        "details": window.innerWidth > 1024,
        "hotlist": false,
        "calendar": false,
        "enable_publishing": false,
        "hide_legend": false
    });
}

// ================= AI PREDICTION ENGINE =================

async function handlePredictionRequest() {
    if (State.isAnalyzing) return;

    const input = DOM.symbolInput();
    let rawSymbol = input.value.trim().toUpperCase();
    
    if (!rawSymbol) {
        updateStatus("Please enter a valid symbol", true);
        return;
    }

    // Clean symbol for backend (remove exchange prefix if exists)
    const cleanSymbol = rawSymbol.includes(":") ? rawSymbol.split(":")[1] : rawSymbol;
    State.currentSymbol = cleanSymbol;
    State.fullTicker = rawSymbol.includes(":") ? rawSymbol : `NSE:${cleanSymbol}`;

    setLoading(true);
    updateStatus(`Neural Core analyzing ${cleanSymbol}...`, false);

    try {
        // Sync Chart & Live View immediately
        initChart(State.fullTicker);
        
        // Parallel fetch for speed
        const [predRes, marketRes] = await Promise.all([
            fetch(`${BACKEND_URL}/predict?symbol=${cleanSymbol}`),
            fetch(`${BACKEND_URL}/market?symbol=${cleanSymbol}`).catch(() => null)
        ]);

        const predData = await predRes.json();
        
        // Display AI Result
        displayPrediction(cleanSymbol, predData);
        
        // Update Live Dashboard if market data exists
        if (marketRes && marketRes.ok) {
            const marketData = await marketRes.json();
            updateLiveUI(cleanSymbol, marketData);
        }

        updateStatus("Analysis Complete ✅", false);
    } catch (err) {
        console.error("Core Prediction Error:", err);
        updateStatus("❌ Intelligence Offline", true);
    } finally {
        setLoading(false);
    }
}

function displayPrediction(symbol, data) {
    if (DOM.selectedLabel) DOM.selectedLabel.innerText = `Active: ${symbol}`;
    if (!DOM.predictionResult) return;

    const isUp = data.prediction === "UP";
    DOM.predictionResult.innerHTML = `
        <div class="prediction-card ${isUp ? 'trend-up' : 'trend-down'}">
            <span class="icon">${isUp ? '📈' : '📉'}</span>
            <span class="text">${symbol} SIGNAL: ${data.prediction}</span>
        </div>
    `;
}

// ================= LIVE MARKET FEED =================

async function loadLiveMarket() {
    if (!DOM.marketCanvas) return;

    try {
        const symbol = State.currentSymbol;
        const response = await fetch(`${BACKEND_URL}/live-chart?symbol=${symbol}`);
        if (!response.ok) return;
        
        const data = await response.json();
        const labels = data.times.map(t => new Date(t * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));

        if (marketChart) {
            marketChart.data.labels = labels;
            marketChart.data.datasets[0].data = data.prices;
            marketChart.update('none'); // Update without animation for performance
        } else {
            createLiveChart(labels, data.prices);
        }
    } catch (e) {
        console.warn("Live feed standby...");
    }
}

function createLiveChart(labels, prices) {
    const ctx = DOM.marketCanvas.getContext('2d');
    marketChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: prices,
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } }
            }
        }
    });
}

// ================= ASSET LEDGER SYSTEM =================

let portfolioAssets = JSON.parse(localStorage.getItem("portfolioAssets")) || ["NSE:RELIANCE", "NASDAQ:AAPL", "BITSTAMP:BTCUSD"];

function renderAssets() {
    if (!DOM.assetTable) return;
    DOM.assetTable.innerHTML = portfolioAssets.map((symbol, index) => `
        <tr>
            <td class="symbol-cell" onclick="selectAsset('${symbol}')">${symbol}</td>
            <td class="action-cell">
                <button class="btn-remove" onclick="removeAsset(${index})">Remove</button>
            </td>
        </tr>
    `).join('');
    localStorage.setItem("portfolioAssets", JSON.stringify(portfolioAssets));
}

function addAsset() {
    const val = DOM.assetInput.value.trim().toUpperCase();
    if (!val) return;
    
    const formatted = val.includes(":") ? val : `NSE:${val}`;
    if (!portfolioAssets.includes(formatted)) {
        portfolioAssets.push(formatted);
        renderAssets();
    }
    DOM.assetInput.value = "";
}

function removeAsset(index) {
    portfolioAssets.splice(index, 1);
    renderAssets();
}

function selectAsset(symbol) {
    State.fullTicker = symbol;
    State.currentSymbol = symbol.split(":")[1] || symbol;
    
    const input = DOM.symbolInput();
    if(input) input.value = State.currentSymbol;
    
    initChart(symbol);
    handlePredictionRequest();
}

// ================= HELPERS =================

function setLoading(loading) {
    State.isAnalyzing = loading;
    if (DOM.predictBtn) {
        DOM.predictBtn.disabled = loading;
        DOM.predictBtn.innerHTML = loading ? '<span class="loader"></span> ANALYZING...' : "PREDICT & SYNC";
    }
}

function updateStatus(msg, isError) {
    if (!DOM.statusMessage) return;
    DOM.statusMessage.innerText = msg;
    DOM.statusMessage.className = isError ? "status-err" : "status-ok";
}

async function loadTopGainers() {
    if (!DOM.gainersTable) return;
    try {
        const r = await fetch(`${BACKEND_URL}/top-gainers`);
        const data = await r.json();
        DOM.gainersTable.innerHTML = data.map(stock => `
            <tr>
                <td><strong>${stock.symbol}</strong></td>
                <td>₹${stock.price.toLocaleString('en-IN')}</td>
                <td class="${stock.change_pct >= 0 ? 'up' : 'down'}">${stock.change_pct}%</td>
            </tr>
        `).join('');
    } catch (e) { console.error("Gainer Feed Error"); }
}