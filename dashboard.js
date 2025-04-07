import firebaseConfig from './firebase_config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, deleteDoc, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const logoutBtn = document.getElementById("logoutBtn");
const saveCryptoBtn = document.getElementById("saveCryptoBtn");
const cryptoTable = document.getElementById("holdingsTable");
const addCryptoModal = document.getElementById("addCryptoModal");
const transactionHistory = document.getElementById("transactionHistory");
const monthFilter = document.getElementById("monthFilter");
const yearFilter = document.getElementById("yearFilter");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const menuBtn = document.getElementById("menuBtn");
const mobileMenu = document.getElementById("mobileMenu");

// Price Cache
const priceCache = new Map();
const CACHE_DURATION = 60 * 1000; // Cache prices for 1 minute

// Local state for holdings
let holdings = [];
let transactions = []; // Store all transactions locally
let unsubscribeHoldingsSnapshot = null;
let unsubscribeTransactionsSnapshot = null;

// Initialize Pie Chart
const ctx = document.getElementById('portfolioPieChart').getContext('2d');
const portfolioPieChart = new Chart(ctx, {
  type: 'pie',
  data: {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: ['#00FFFF', '#FF00FF', '#FFFF00', '#00FF00', '#FF5733'],
      borderColor: '#fff',
      borderWidth: 1,
    }],
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#fff', font: { size: 14 } },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${context.raw.toFixed(2)}%`,
        },
      },
    },
  },
});

// Check if user is logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("User logged in:", user.email);
    const username = user.displayName || user.email.split('@')[0];
    document.getElementById('welcome-message').textContent = `Welcome, ${username}`;
    //document.getElementById('userName').textContent = username; // Set username in navbar
    //document.getElementById('userMenuBtn').querySelector('div').textContent = username.charAt(0).toUpperCase(); // Initial in avatar
    fetchCryptoData(user.uid);
    fetchTransactionHistory(user.uid);
  } else {
    console.log("No user logged in. Redirecting to login page.");
    window.location.href = "index.html";
  }
});

// Navbar interactivity
menuBtn.addEventListener('click', () => {
  mobileMenu.classList.toggle('closed');
  mobileMenu.classList.toggle('open');
});


// // Close mobile menu and dropdown when clicking outside
// document.addEventListener('click', (e) => {
//   if (!navMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
//     navMenu.classList.remove('open');
//   }
//   if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
//     userDropdown.classList.add('hidden');
//   }
// });

// Validate crypto input
const validateCryptoInput = (cryptoName, cryptoAmount, buyPrice) => {
  if (!cryptoName || !cryptoAmount || !buyPrice) return "Please fill in all fields.";
  const amount = parseFloat(cryptoAmount);
  const price = parseFloat(buyPrice);
  if (isNaN(amount) || isNaN(price) || amount <= 0 || price <= 0) {
    return "Amount and buy price must be positive numbers.";
  }
  return null;
};

// Fetch live price with retry logic
const fetchLivePrice = async (coin, retries = 3, delay = 2000) => {
  const cached = priceCache.get(coin);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }

  for (let i = 0; i < retries; i++) {
    try {
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=inr`,
        { mode: 'cors' }
      );
      if (response.status === 429) {
        console.warn(`Rate limit hit for ${coin}, retrying (${i + 1}/${retries})`);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const price = data[coin]?.inr || 0;
      priceCache.set(coin, { price, timestamp: Date.now() });
      return price;
    } catch (error) {
      console.error(`Error fetching price for ${coin} (attempt ${i + 1}):`, error);
      if (i === retries - 1) return 0;
    }
  }
};

// Create holdings table row
const createTableRow = (doc) => {
  const data = doc.data();
  const row = document.createElement('tr');
  row.id = `row-${doc.id}`;
  row.innerHTML = `
    <td class="p-3">${data.coin.charAt(0).toUpperCase() + data.coin.slice(1)}</td>
    <td class="p-3">${data.amount.toFixed(4)}</td>
    <td class="p-3">₹${data.buyPrice.toFixed(2)}</td>
    <td class="p-3 price-${doc.id}">Fetching...</td>
    <td class="p-3 profit-${doc.id}">Calculating...</td>
    <td class="p-3">
      <button class="deleteBtn bg-red-500 px-3 py-1 rounded-lg text-white hover:bg-red-600 hover:scale-105 transition-all duration-200" data-id="${doc.id}">Delete</button>
    </td>
  `;
  return row;
};

// Create transaction history row
const createTransactionRow = (doc) => {
  const data = doc.data();
  const row = document.createElement('tr');
  row.id = `tx-${doc.id}`;
  const date = new Date(data.timestamp).toLocaleString();
  row.innerHTML = `
    <td class="p-3">${date}</td>
    <td class="p-3">${data.action}</td>
    <td class="p-3">${data.coin.charAt(0).toUpperCase() + data.coin.slice(1)}</td>
    <td class="p-3">${data.amount ? data.amount.toFixed(4) : '-'}</td>
    <td class="p-3">${data.buyPrice ? `₹${data.buyPrice.toFixed(2)}` : '-'}</td>
  `;
  row.dataset.timestamp = data.timestamp; // Store timestamp for filtering
  return row;
};

// Filter transactions based on month and year
const filterTransactions = () => {
  const selectedMonth = monthFilter.value;
  const selectedYear = yearFilter.value;

  transactionHistory.innerHTML = ""; // Clear current display

  const filteredTransactions = transactions.filter((doc) => {
    const date = new Date(doc.data().timestamp);
    const monthMatch = selectedMonth === "all" || date.getMonth() === parseInt(selectedMonth);
    const yearMatch = selectedYear === "all" || date.getFullYear() === parseInt(selectedYear);
    return monthMatch && yearMatch;
  });

  filteredTransactions.forEach((doc) => {
    const row = createTransactionRow(doc);
    transactionHistory.appendChild(row); // Oldest first for filtered view
  });
};


// Populate year filter dynamically
const populateYearFilter = () => {
  const years = new Set(transactions.map(doc => new Date(doc.data().timestamp).getFullYear()));
  yearFilter.innerHTML = '<option value="all" selected>All Years</option>';
  years.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearFilter.appendChild(option);
  });
};

// Update single holdings row
const updateRow = async (doc) => {
  const data = doc.data();
  const currentPrice = await fetchLivePrice(data.coin);
  const profitLoss = (currentPrice - data.buyPrice) * data.amount;

  const priceCell = document.querySelector(`.price-${doc.id}`);
  const profitCell = document.querySelector(`.profit-${doc.id}`);

  if (priceCell) priceCell.textContent = `₹${currentPrice.toFixed(2)}`;
  if (profitCell) {
    profitCell.textContent = `₹${profitLoss.toFixed(2)}`;
    profitCell.className = `p-3 profit-${doc.id} ${profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`;
  }

  return { currentPrice, profitLoss };
};

// Update totals and pie chart
const updateTotalsAndChart = async () => {
  let totalBalance = 0;
  const coinValues = [];

  for (const holding of holdings) {
    const data = holding.data();
    const currentPrice = await fetchLivePrice(data.coin);
    const value = currentPrice * data.amount;
    totalBalance += value;
    coinValues.push({ coin: data.coin, value });
  }

  document.getElementById("totalBalance").textContent = `₹${totalBalance.toFixed(2)}`;

  let totalProfitLoss = 0;
  for (const holding of holdings) {
    const data = holding.data();
    const currentPrice = await fetchLivePrice(data.coin);
    totalProfitLoss += (currentPrice - data.buyPrice) * data.amount;
  }
  document.getElementById("profitLoss").textContent = `₹${totalProfitLoss.toFixed(2)}`;
  document.getElementById("profitLoss").className = `text-3xl font-semibold mt-2 ${totalProfitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`;

  if (totalBalance > 0) {
    const labels = coinValues.map(cv => cv.coin.charAt(0).toUpperCase() + cv.coin.slice(1));
    const percentages = coinValues.map(cv => (cv.value / totalBalance) * 100);
    portfolioPieChart.data.labels = labels;
    portfolioPieChart.data.datasets[0].data = percentages;
    portfolioPieChart.update();
  } else {
    portfolioPieChart.data.labels = ['No Holdings'];
    portfolioPieChart.data.datasets[0].data = [100];
    portfolioPieChart.update();
  }
};

// Fetch holdings data
const fetchCryptoData = (uid) => {
  if (unsubscribeHoldingsSnapshot) unsubscribeHoldingsSnapshot();

  const holdingsRef = collection(db, "users", uid, "holdings");
  unsubscribeHoldingsSnapshot = onSnapshot(holdingsRef, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const doc = change.doc;
        holdings.push(doc);
        const row = createTableRow(doc);
        cryptoTable.appendChild(row);
        await updateRow(doc);
      } else if (change.type === "removed") {
        const docId = change.doc.id;
        const row = document.getElementById(`row-${docId}`);
        if (row) row.remove();
        holdings = holdings.filter(h => h.id !== docId);
      }
    });
    updateTotalsAndChart();
  }, (error) => {
    console.error("Snapshot error:", error);
  });
};

// Fetch transaction history
const fetchTransactionHistory = (uid) => {
  if (unsubscribeTransactionsSnapshot) unsubscribeTransactionsSnapshot();

  const transactionsRef = collection(db, "users", uid, "transactions");
  unsubscribeTransactionsSnapshot = onSnapshot(transactionsRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const doc = change.doc;
        transactions.push(doc);
        const row = createTransactionRow(doc);
        if (monthFilter.value === "all" && yearFilter.value === "all") {
          transactionHistory.insertBefore(row, transactionHistory.firstChild); // Newest first
        }
      } else if (change.type === "removed") {
        const docId = change.doc.id;
        transactions = transactions.filter(t => t.id !== docId);
        const row = document.getElementById(`tx-${docId}`);
        if (row) row.remove();
      }
    });
    populateYearFilter();
    filterTransactions(); // Apply filters after any change
  }, (error) => {
    console.error("Transaction snapshot error:", error.code, error.message);
  });
};


// Clear transaction history
const clearTransactionHistory = async (uid) => {
  if (!confirm("Are you sure you want to clear all transaction history? This cannot be undone.")) return;

  try {
    const transactionsRef = collection(db, "users", uid, "transactions");
    const snapshot = await getDocs(transactionsRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    transactions = [];
    transactionHistory.innerHTML = "";
    alert("Transaction history cleared successfully!");
  } catch (error) {
    console.error("Error clearing transaction history:", error);
    alert("Failed to clear history: " + error.message);
  }
};

// Save crypto handler with transaction logging
const handleSaveCrypto = async () => {
  const cryptoName = document.getElementById('cryptoName').value.trim().toLowerCase();
  const cryptoAmount = document.getElementById('cryptoAmount').value.trim();
  const buyPrice = document.getElementById('buyPrice').value.trim();

  const validationError = validateCryptoInput(cryptoName, cryptoAmount, buyPrice);
  if (validationError) {
    alert(validationError);
    return;
  }

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const holdingsRef = collection(db, "users", user.uid, "holdings");
    const q = query(holdingsRef, where("coin", "==", cryptoName));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      alert("This coin already exists in your holdings.");
      return;
    }

    const docRef = await addDoc(holdingsRef, {
      coin: cryptoName,
      amount: parseFloat(cryptoAmount),
      buyPrice: parseFloat(buyPrice),
      timestamp: new Date().toISOString(),
    });

    // Log the transaction
    await addDoc(collection(db, "users", user.uid, "transactions"), {
      action: "Added",
      coin: cryptoName,
      amount: parseFloat(cryptoAmount),
      buyPrice: parseFloat(buyPrice),
      timestamp: new Date().toISOString(),
    });

    addCryptoModal.classList.add("hidden");
    document.getElementById("cryptoName").value = "bitcoin";
    document.getElementById("cryptoAmount").value = "";
    document.getElementById("buyPrice").value = "";
    alert("Crypto added successfully!");
  } catch (error) {
    console.error("Error adding crypto:", error);
    alert("Failed to save crypto: " + error.message);
  }
};

if (saveCryptoBtn) saveCryptoBtn.addEventListener('click', handleSaveCrypto);

// Delete crypto handler with transaction logging
cryptoTable.addEventListener('click', async (e) => {
  if (e.target.classList.contains('deleteBtn')) {
    const id = e.target.getAttribute('data-id');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("User not authenticated");

      const docRef = doc(db, "users", user.uid, "holdings", id);
      const holding = holdings.find(h => h.id === id);
      if (holding) {
        const data = holding.data();
        // Log the transaction before deleting
        await addDoc(collection(db, "users", user.uid, "transactions"), {
          action: "Deleted",
          coin: data.coin,
          amount: data.amount,
          buyPrice: data.buyPrice,
          timestamp: new Date().toISOString(),
        });
      }
      await deleteDoc(docRef);
      alert("Crypto deleted successfully!");
    } catch (error) {
      console.error("Error deleting crypto:", error);
      alert("Failed to delete crypto: " + error.message);
    }
  }
});


// Event listeners for filters and clear button
monthFilter.addEventListener('change', filterTransactions);
yearFilter.addEventListener('change', filterTransactions);
clearHistoryBtn.addEventListener('click', () => clearTransactionHistory(auth.currentUser.uid));

// Auto-refresh every 5 minutes
const autoRefreshInterval = setInterval(async () => {
  if (auth.currentUser) {
    for (const doc of holdings) {
      await updateRow(doc);
    }
    updateTotalsAndChart();
  }
}, 5 * 60 * 1000);

// Logout
logoutBtn.addEventListener("click", async () => {
  clearInterval(autoRefreshInterval);
  if (unsubscribeHoldingsSnapshot) unsubscribeHoldingsSnapshot();
  if (unsubscribeTransactionsSnapshot) unsubscribeTransactionsSnapshot();
  try {
    await signOut(auth);
    alert("Logged out successfully!");
    window.location.href = "login.html";
  } catch (error) {
    console.error("Error signing out:", error);
    alert("Error: " + error.message);
  }
});



document.getElementById("exportHistoryBtn").addEventListener("click", () => {
  const transactions = Array.from(document.querySelectorAll("#transactionHistory tr")).map(row => {
      const cells = row.querySelectorAll("td");
      return {
          date: cells[0]?.textContent,
          action: cells[1]?.textContent,
          coin: cells[2]?.textContent,
          amount: cells[3]?.textContent,
          buyPrice: cells[4]?.textContent
      };
  });

  const csvContent = "data:text/csv;charset=utf-8," + 
      "Date,Action,Coin,Amount,Buy Price\n" +
      transactions.map(t => `${t.date},${t.action},${t.coin},${t.amount},${t.buyPrice}`).join("\n");
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "transaction_history.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});