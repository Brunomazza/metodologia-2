import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Redirige al login si Firebase no tiene sesión activa
onAuthStateChanged(auth, (user) => {
  if (!user) {
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
  }
});

// Función global de logout: cierra sesión en Firebase + limpia localStorage
window.cerrarSesion = async () => {
  try {
    await signOut(auth);
  } finally {
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
  }
};
