import firebaseConfig from './firebase_config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
console.log('Firebase initialized:', app);
const auth = getAuth(app);
console.log('Firebase auth initialized:', auth);

// DOM Elements
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const confirmPassword = document.getElementById("confirmPassword");
const loginBtn = document.getElementById("loginBtn");
const formTitle = document.getElementById("formTitle");
const switchFormText = document.getElementById("switchFormText");
const switchToSignUp = document.getElementById("switchToSignUp");
const signupFields = document.getElementById("signupFields");

// Switch between login and signup form
let isSignUp = false;

const handleFormSwitch = () => {
  isSignUp = !isSignUp;
  formTitle.textContent = isSignUp ? 'Sign Up' : 'Login';
  loginBtn.textContent = isSignUp ? 'Sign Up' : 'Login';
  switchFormText.innerHTML = isSignUp 
    ? `Already have an account? <span id='switchToLogin' class='text-blue-300'>Login</span>`
    : `Don't have an account? <span id='switchToSignUp' class='text-blue-300'>Sign Up</span>`;
  signupFields.classList.toggle('hidden');
};

switchToSignUp.addEventListener('click', handleFormSwitch);
document.addEventListener('click', (e) => {
  if (e.target.id === 'switchToLogin') handleFormSwitch();
});

// Improved error handling
const handleAuthError = (error) => {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'Email already in use. Please login instead.';
    case 'auth/user-not-found':
      return 'User not found. Please check your email.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    default:
      return error.message;
  }
};

// Password validation
const validatePassword = (password) => {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return null;
};

// Handle Login and Sign Up
loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value;
  const password = loginPassword.value;

  if (isSignUp) {
    const confirmPass = confirmPassword.value;
    if (password !== confirmPass) {
      alert('Passwords do not match!');
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      alert(passwordError);
      return;
    }
  }

  try {
    if (isSignUp) {
      await createUserWithEmailAndPassword(auth, email, password);
      alert('Sign Up successful!');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      alert('Login successful!');
    }
    window.location.href = 'dashboard.html';
  } catch (error) {
    alert(handleAuthError(error));
  }
});
