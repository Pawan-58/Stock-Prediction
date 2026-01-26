// auth.js
import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const authBtn = document.getElementById("authBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const statusEl = document.getElementById("authStatus");

let mode = "login";

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));

function setMode(newMode) {
  mode = newMode;
  if (mode === "login") {
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    authBtn.textContent = "Login";
  } else {
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    authBtn.textContent = "Create account";
  }
  showStatus("", false);
}

authBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const pwd = passwordInput.value.trim();

  if (!email || !pwd) {
    showStatus("Please enter both email and password.", true);
    return;
  }

  showStatus("Processing…", false);

  try {
    if (mode === "signup") {
      await createUserWithEmailAndPassword(auth, email, pwd);
      showStatus("Account created. Redirecting…", false);
    } else {
      await signInWithEmailAndPassword(auth, email, pwd);
      showStatus("Login successful. Redirecting…", false);
    }

    setTimeout(() => {
      window.location.href = "index.html";
    }, 800);
  } catch (err) {
    console.error(err);
    showStatus(err.message || "Authentication failed.", true);
  }
});

function showStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", !!isError);
}

// If already logged in, go straight to dashboard
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "index.html";
  }
});
