/**
 * authMiddleware.js - Middlewares de autenticación y autorización (RBAC)
 * 
 * 1. verificarToken: Verifica que la petición incluya un token JWT válido
 *    en la cabecera 'Authorization: Bearer <token>'.
 * 2. permitirRoles: Asegura que el usuario tenga uno de los roles permitidos
 *    para acceder a la ruta solicitada (ADMIN, DOCENTE, PADRE, ESTUDIANTE).
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_default';

/**
 * Middleware para validar el JWT en cabeceras de peticiones protegidas
 */
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Formato esperado: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Acceso no autorizado: Token de sesión ausente'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, usuarioDecodificado) => {
    if (err) {
      return res.status(403).json({
        ok: false,
        error: 'Token inválido o expirado. Por favor iniciá sesión nuevamente.'
      });
    }

    // Adjuntamos la información del usuario al request para usarla en los controladores
    req.usuario = usuarioDecodificado;
    next();
  });
}

/**
 * Middleware de Control de Acceso Basado en Roles (RBAC)
 * @param  {...string} rolesPermitidos - Lista de roles autorizados, ej: 'ADMIN', 'DOCENTE'
 */
function permitirRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !req.usuario.rol) {
      return res.status(403).json({
        ok: false,
        error: 'Permisos insuficientes: Rol no identificado'
      });
    }

    const rolNormalizado = req.usuario.rol.toUpperCase();
    const rolesAutorizados = rolesPermitidos.map(r => r.toUpperCase());

    if (!rolesAutorizados.includes(rolNormalizado)) {
      return res.status(403).json({
        ok: false,
        error: `Acceso denegado: Se requiere rol [${rolesPermitidos.join(', ')}] pero tu rol es [${req.usuario.rol}]`
      });
    }

    next();
  };
}

module.exports = {
  verificarToken,
  permitirRoles
};
