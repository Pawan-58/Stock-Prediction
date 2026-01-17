// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDGG-fvrqZKjFwSuYQC5-4UYZMpq7bRgI8",
  authDomain: "stock-market-prediction-fba95.firebaseapp.com",
  projectId: "stock-market-prediction-fba95",
  storageBucket: "stock-market-prediction-fba95.firebasestorage.app",
  messagingSenderId: "1039537699156",
  appId: "1:1039537699156:web:e23a5b1e9250c16f67f0c1",
  measurementId: "G-HF96MPQG4S"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
