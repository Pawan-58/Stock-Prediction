// ================= CONFIG =================
const BACKEND_URL = "http://127.0.0.1:8000";

// DOM Elements
const symbolInput = document.getElementById("stockInput") || document.getElementById("symbol");
const predictBtn = document.getElementById("predictBtn");
const statusMessage = document.getElementById("statusMessage");
const predictionResult = document.getElementById("predictionResult");
const selectedStockLabel = document.getElementById("selectedStockDisplay") || document.getElementById("selectedStock");
const gainersTableBody = document.getElementById("gainersTableBody");
const marketChartCanvas = document.getElementById("marketChartCanvas");

let chartInstance = null; // Original Chart instance
let marketChart;        // Live Market Chart instance

// ================= INITIALIZATION =================
document.addEventListener("DOMContentLoaded", () => {
    initChart(); // Pre-initialize Chart.js
    loadTopGainers(); // Initial load of Indian Top Gainers
    loadLiveMarket(); // Initial load of Live Market Chart
    
    // Support both direct button click and Form Submit
    if (predictBtn) {
        predictBtn.addEventListener("click", handlePredictionRequest);
    }

    const form = document.getElementById("predictForm");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            handlePredictionRequest();
        });
    }

    // Refresh Top Gainers every 2 minutes
    setInterval(loadTopGainers, 120000);
    
    // Auto refresh live market every 30 sec
    setInterval(loadLiveMarket, 30000);
});

// ================= LIVE MARKET CHART LOGIC =================

async function loadLiveMarket(){
  try{
    // Uses the current input value or defaults to AAPL
    const symbol = symbolInput.value.trim().toUpperCase() || "AAPL";

    // 1️⃣ Get live price
    const priceRes = await fetch(`${BACKEND_URL}/live-price?symbol=${symbol}`);
    const priceData = await priceRes.json();

    // Update the live price dashboard element if it exists
    const liveIndexElem = document.getElementById('live-index');
    if(liveIndexElem) liveIndexElem.innerText = priceData.price.toFixed(2);
    
    console.log("Live price:", priceData.price);

    // 2️⃣ Get live chart candles
    const chartRes = await fetch(`${BACKEND_URL}/live-chart?symbol=${symbol}`);
    const chartData = await chartRes.json();

    const labels = chartData.times.map(t =>
      new Date(t * 1000).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})
    );

    if(marketChart){
      marketChart.data.labels = labels;
      marketChart.data.datasets[0].data = chartData.prices;
      marketChart.update();
    }else if(marketChartCanvas){
      marketChart = new Chart(marketChartCanvas, {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            data: chartData.prices,
            borderColor: "#2563eb",
            fill: true,
            tension: 0.4,
            backgroundColor: "rgba(37,99,235,.25)",
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins:{legend:{display:false}},
          scales:{
            x:{ticks:{color:"#9ca3af"}},
            y:{ticks:{color:"#9ca3af"}}
          }
        }
      });
    }

  }catch(e){
    console.error("Market API error", e);
  }
}

// ================= TOP GAINERS & TICKER =================

async function loadTopGainers() {
    if (!gainersTableBody) return;

    try {
        const response = await fetch(`${BACKEND_URL}/top-gainers`);
        if (!response.ok) throw new Error("Gainer API Error");
        const data = await response.json();

        gainersTableBody.innerHTML = "";
        data.forEach((stock, index) => {
            const row = `
                <tr>
                    <td><strong>${stock.symbol}</strong></td>
                    <td>₹${stock.price.toLocaleString('en-IN')}</td>
                    <td class="${stock.change_pct >= 0 ? 'up' : 'down'}">
                        ${stock.change_pct >= 0 ? '+' : ''}${stock.change_pct}%
                    </td>
                </tr>
            `;
            gainersTableBody.innerHTML += row;

            const tickerElem = document.getElementById(`ticker-${index + 1}`);
            if (tickerElem) {
                tickerElem.innerHTML = `${stock.symbol} <span class="up">+${stock.change_pct}%</span>`;
            }
        });
    } catch (err) {
        console.error("Failed to load gainers:", err);
        gainersTableBody.innerHTML = `<tr><td colspan="3" style="color:orange">Market Data offline</td></tr>`;
    }
}

// ================= CORE PREDICTION LOGIC =================

async function handlePredictionRequest() {
    let symbol = symbolInput.value.trim().toUpperCase();
    
    if (!symbol) {
        showStatus("Please enter a symbol (e.g., RELIANCE or TCS)", true);
        return;
    }

    const searchSymbol = symbol.includes(".") ? symbol : `${symbol}`;

    // Trigger AI prediction and chart sync
    await getPrediction();
    await runFullPrediction(symbol, searchSymbol);
}

async function runFullPrediction(originalSymbol, searchSymbol) {
    setLoading(true);
    showStatus(`Analyzing ${originalSymbol}...`, false);
    
    try {
        const marketRes = await fetch(`${BACKEND_URL}/market?symbol=${searchSymbol}`);
        const marketData = await marketRes.json();

        const predRes = await fetch(`${BACKEND_URL}/predict?symbol=${searchSymbol}`);
        const predData = await predRes.json();

        updateUI(originalSymbol, predData, marketData);
        updateTradingView(searchSymbol); 
        loadLiveMarket(); // Update the live chart canvas
        showStatus("Analysis complete ✅", false);

    } catch (err) {
        console.error("Connection Error:", err);
        showStatus("❌ Backend Offline.", true);
    } finally {
        setLoading(false);
    }
}

// ================= AI PREDICTION (AS PROVIDED) =================

async function getPrediction(){
  const symbol = symbolInput.value.trim().toUpperCase();
  if(selectedStockLabel) selectedStockLabel.innerText = "Selected: " + symbol;
  if(predictionResult) predictionResult.innerText = "⏳ AI analyzing...";

  try{
    const r = await fetch(`${BACKEND_URL}/predict?symbol=${symbol}`);
    const d = await r.json();

    if(predictionResult) {
        predictionResult.innerHTML =
          d.prediction === "UP"
          ? `<span class="up">📈 ${symbol} WILL GO UP</span>`
          : `<span class="down">📉 ${symbol} WILL GO DOWN</span>`;
    }
  }catch{
    if(predictionResult) predictionResult.innerText = "❌ Backend not connected";
  }
}

// ================= UI UPDATERS =================

function updateUI(symbol, predData, marketData) {
    if (selectedStockLabel) selectedStockLabel.innerText = "Active: " + symbol;
    
    const liveIndex = document.getElementById('live-index');
    const liveChange = document.getElementById('live-change');
    const statSymbol = document.getElementById('stat-symbol');

    if (liveIndex) liveIndex.innerText = marketData.last_price.toFixed(2);
    if (statSymbol) statSymbol.innerText = symbol;
    if (liveChange) {
        liveChange.innerText = `${marketData.change >= 0 ? '+' : ''}${marketData.change.toFixed(2)}%`;
        liveChange.className = marketData.change >= 0 ? 'up' : 'down';
    }

    if (marketData.prices) {
        updateChart(marketData.prices);
    }
}

// ================= CHART HANDLING =================

function initChart() {
    const canvas = document.getElementById("marketChart") || document.getElementById("priceChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    chartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: Array.from({length: 30}, (_, i) => i + 1),
            datasets: [{
                label: "Price Trend",
                data: [],
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
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
                x: { display: false },
                y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#9ca3af" } }
            }
        }
    });
}

function updateChart(prices) {
    if (!chartInstance) initChart();
    chartInstance.data.labels = prices.map((_, i) => i + 1);
    chartInstance.data.datasets[0].data = prices;
    chartInstance.update();
}

function updateTradingView(symbol) {
    new TradingView.widget({
        "autosize": true,
        "symbol": `NSE:${symbol.replace(".NS", "")}`,
        "interval": "D",
        "timezone": "Asia/Kolkata",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "container_id": "tv-chart-container" 
    });
}

// ================= HELPERS =================

function setLoading(isLoading) {
    if (!predictBtn) return;
    predictBtn.disabled = isLoading;
    predictBtn.innerHTML = isLoading ? 'Analyzing...' : "Predict & Sync";
}

function showStatus(message, isError) {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? "#ef4444" : "#22c55e";
    if (!isError) {
        setTimeout(() => { statusMessage.textContent = ""; }, 5000);
    }
}
// ===============================
// ADVANCED ASSET LEDGER SYSTEM
// ===============================

let portfolioAssets = JSON.parse(localStorage.getItem("portfolioAssets")) || [
    "NASDAQ:AAPL",
    "NASDAQ:MSFT",
    "BITSTAMP:BTCUSD"
];

// Render Portfolio Table
function renderAssets() {
    const table = document.getElementById("assetTable");
    table.innerHTML = "";

    portfolioAssets.forEach((symbol, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td style="padding:10px; cursor:pointer; color:var(--accent-glow);" onclick="selectAsset('${symbol}')">
                ${symbol}
            </td>
            <td style="padding:10px;">
                <button onclick="removeAsset(${index})"
                    style="background:transparent; border:1px solid var(--danger); color:var(--danger); padding:4px 10px; border-radius:6px; cursor:pointer;">
                    Remove
                </button>
            </td>
        `;
        table.appendChild(row);
    });

    localStorage.setItem("portfolioAssets", JSON.stringify(portfolioAssets));
}

// Add Asset
function addAsset() {
    const input = document.getElementById("assetInput");
    let symbol = input.value.trim().toUpperCase();

    if (!symbol) return alert("Enter a valid stock symbol!");

    if (!symbol.includes(":")) {
        symbol = "NASDAQ:" + symbol; // default exchange
    }

    if (!portfolioAssets.includes(symbol)) {
        portfolioAssets.push(symbol);
        renderAssets();
    }

    input.value = "";
}

// Remove Asset
function removeAsset(index) {
    portfolioAssets.splice(index, 1);
    renderAssets();
}

// Select Asset → Update Chart
function selectAsset(symbol) {
    currentTicker = symbol;
    initChart(symbol);
}

// Initialize Portfolio on Login
const oldHandleLogin = handleLogin;
handleLogin = function() {
    oldHandleLogin();
    renderAssets();
};
