import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyDfuHdOoAfoeU3npOJGwarV7QS3Iyb0BZE",
  authDomain:        "escuela-3ca50.firebaseapp.com",
  projectId:         "escuela-3ca50",
  storageBucket:     "escuela-3ca50.firebasestorage.app",
  messagingSenderId: "537908816580",
  appId:             "1:537908816580:web:2780ea91f5c6d097ccb791"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
