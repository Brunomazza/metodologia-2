/**
 * auth-guard.js - Guardia de Rutas y Sesión (JWT / localStorage)
 * 
 * Verifica que el usuario tenga una sesión activa válida en el navegador.
 * Desacoplado al 100% de Firebase para una arquitectura limpia en 3 capas.
 */

(function() {
  const usuarioLocal = localStorage.getItem('usuario');
  const rutaActual = window.location.pathname.toLowerCase();

  // Páginas públicas que no requieren autenticación
  const paginasPublicas = ['index.html', 'login.html', 'login-admin.html', 'preinscripcion.html', 'inicial.html', 'primario.html', 'secundario.html'];
  const esPaginaPublica = paginasPublicas.some(p => rutaActual.endsWith(p)) || rutaActual === '/' || rutaActual === '';

  if (!esPaginaPublica && !usuarioLocal) {
    // Si intenta entrar al área admin sin sesión, redirigir al login admin
    if (rutaActual.includes('dashboard') || rutaActual.includes('admin') || rutaActual.includes('asignacion')) {
      window.location.href = 'login-admin.html';
    } else {
      window.location.href = 'login.html';
    }
  }
})();

/**
 * Función global para cerrar sesión de manera segura
 */
window.cerrarSesion = function() {
  localStorage.removeItem('usuario');
  localStorage.removeItem('token');
  window.location.href = 'login.html';
};
