import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBB3vR5-P27fjdQHXrF8NIpL2izh7kaFSQ",
  authDomain: "escuela-61c37.firebaseapp.com",
  projectId: "escuela-61c37",
  storageBucket: "escuela-61c37.firebasestorage.app",
  messagingSenderId: "953747301951",
  appId: "1:953747301951:web:a6b4375c86963fdbbeba8a"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
