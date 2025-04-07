
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
  
  // Firebase Config
  const firebaseConfig = {
    apiKey: "AIzaSyB5nYhfpEc2fAHQUfF5asLR4t-LAZ6bTAw",
    authDomain: "crypto-portfolio-manager1.firebaseapp.com",
    projectId: "crypto-portfolio-manager1",
    storageBucket: "crypto-portfolio-manager1.firebasestorage.app",
    messagingSenderId: "150024999954",
    appId: "1:150024999954:web:03ea530bb483d9007e74cb"
  };


  // Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Initialize Firestore



export default firebaseConfig;





  