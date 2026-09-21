import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Redirige al login solo si tampoco hay usuario en localStorage
onAuthStateChanged(auth, (user) => {
  if (!user) {
    const usuarioLocal = localStorage.getItem('usuario');
    if (!usuarioLocal) {
      window.location.href = 'login.html';
    }
  }
});

// Función global de logout: cierra sesión en Firebase + limpia localStorage
window.cerrarSesion = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Error al cerrar sesión en Firebase (modo fallback activo):', e);
  } finally {
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
  }
};

