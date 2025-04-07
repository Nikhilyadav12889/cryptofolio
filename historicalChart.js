document.addEventListener('DOMContentLoaded', () => {
    // Debounce helper to limit API calls
    function debounce(func, wait) {
      let timeout;
      return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    }
  
    // Cache for historical data (coinId:days -> data)
    const historicalCache = new Map();
    const CACHE_DURATION = 5 * 60 * 1000; // Cache for 5 minutes
  
    // Fetch historical price data with retry logic
    async function fetchHistoricalPrice(coinId, days, currency = 'inr', retries = 3, delay = 2000) {
      const cacheKey = `${coinId}:${days}`;
      const cached = historicalCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
  
      const apiUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=${currency}&days=${days}`;
      for (let i = 0; i < retries; i++) {
        try {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
          const response = await fetch(apiUrl, { method: 'GET' });
          if (response.status === 429) {
            console.warn(`Rate limit hit for ${coinId} (${days} days), retrying (${i + 1}/${retries})`);
            continue;
          }
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const data = await response.json();
          historicalCache.set(cacheKey, { data: data.prices, timestamp: Date.now() });
          return data.prices; // Array of [timestamp, price]
        } catch (error) {
          console.error('Error fetching historical data:', error);
          if (i === retries - 1) return null; // Return null after all retries fail
        }
      }
      return null;
    }
  
    // Initialize the chart
    const ctx = document.getElementById('cryptoPriceChart').getContext('2d');
    const cryptoPriceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Price (INR)',
          data: [],
          borderColor: '#00FFFF',
          backgroundColor: 'rgba(0, 255, 255, 0.1)',
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: 'Date', color: '#fff' },
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
          },
          y: {
            title: { display: true, text: 'Price (INR)', color: '#fff' },
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
          },
        },
        plugins: {
          legend: { labels: { color: '#fff' } },
          tooltip: { enabled: true },
        },
      },
    });
  
    // Update chart with historical data
    async function updateChart() {
      const coinId = document.getElementById('chartCoin').value;
      const days = document.getElementById('timePeriod').value;
  
      // Show loading state
      cryptoPriceChart.data.labels = [];
      cryptoPriceChart.data.datasets[0].data = [];
      cryptoPriceChart.data.datasets[0].label = 'Loading...';
      cryptoPriceChart.update();
  
      const historicalData = await fetchHistoricalPrice(coinId, days);
      if (historicalData) {
        const labels = historicalData.map(point => {
          const date = new Date(point[0]);
          return days <= 1
            ? date.toLocaleTimeString()
            : date.toLocaleDateString();
        });
        const prices = historicalData.map(point => point[1]);
  
        cryptoPriceChart.data.labels = labels;
        cryptoPriceChart.data.datasets[0].data = prices;
        cryptoPriceChart.data.datasets[0].label = `${coinId.toUpperCase()} Price (INR)`;
        cryptoPriceChart.update();
      } else {
        cryptoPriceChart.data.labels = [];
        cryptoPriceChart.data.datasets[0].data = [];
        cryptoPriceChart.data.datasets[0].label = 'Failed to load data';
        cryptoPriceChart.update();
        console.warn('Failed to load historical data. Chart cleared.');
      }
    }
  
    // Debounced version of updateChart to prevent rapid API calls
    const debouncedUpdateChart = debounce(updateChart, 1500); // 1.5-second delay
  
    // Event listeners for coin and time period changes
    document.getElementById('chartCoin').addEventListener('change', debouncedUpdateChart);
    document.getElementById('timePeriod').addEventListener('change', debouncedUpdateChart);
  
    // Initial chart load
    updateChart();
  });