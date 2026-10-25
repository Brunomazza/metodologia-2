/**
 * =============================================================================
 * API_Server.js - Backend REST API "Educar para Transformar"
 * Metodología de Sistemas II - UTN TUP
 * 
 * Arquitectura de 3 Capas:
 * 1. Presentación (Frontend HTML / JS via fetch)
 * 2. Lógica de Negocio y Auth RBAC (Express + JWT + bcrypt)
 * 3. Persistencia Centralizada (PostgreSQL en Neon Cloud via pg.Pool)
 * =============================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { verificarToken, permitirRoles } = require('./authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_default';

// ─── MIDDLEWARES GLOBALES ───────────────────────────────────────────────────

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Servir archivos estáticos del frontend si se accede directo por el puerto 3000
app.use(express.static('../'));
app.get('/', (req, res) => res.redirect('/html/index.html'));

// ─── HELPERS DE RESPUESTA UNIFORME ──────────────────────────────────────────

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, msg, status = 400) => res.status(status).json({ ok: false, error: msg });

// ─── 1. AUTENTICACIÓN Y ROLES (RBAC / JWT) ───────────────────────────────────

/**
 * POST /api/auth/login
 * Permite iniciar sesión con email (o DNI) y contraseña (hasheada con bcrypt).
 * Devuelve un token JWT con duración de 8 horas y la información del usuario.
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password, dni } = req.body;

  if ((!email && !dni) || !password) {
    return fail(res, 'Debe ingresar email (o DNI) y contraseña', 400);
  }

  try {
    // Buscar usuario por email o por DNI
    let query = 'SELECT id_usuario, email, password_hash, rol, nombre, apellido, estado FROM usuarios WHERE email = $1';
    let param = email;

    if (!email && dni) {
      // Si mandaron DNI, buscar a través de alumnos, tutores o profesores
      query = `
        SELECT u.id_usuario, u.email, u.password_hash, u.rol, u.nombre, u.apellido, u.estado 
        FROM usuarios u
        LEFT JOIN alumnos a ON a.id_usuario = u.id_usuario
        LEFT JOIN tutores t ON t.id_usuario = u.id_usuario
        LEFT JOIN profesores p ON p.id_usuario = u.id_usuario
        WHERE a.dni = $1 OR t.dni = $1 OR p.dni = $1
        LIMIT 1
      `;
      param = dni;
    }

    const result = await db.query(query, [param]);

    if (result.rows.length === 0) {
      return fail(res, 'Credenciales inválidas', 401);
    }

    const usuario = result.rows[0];

    if (usuario.estado !== 'ACTIVO') {
      return fail(res, 'El usuario se encuentra inactivo. Consulte con administración.', 403);
    }

    // Verificar hash de contraseña con bcrypt
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      return fail(res, 'Credenciales inválidas', 401);
    }

    // Generar el token JWT
    const token = jwt.sign(
      {
        id_usuario: usuario.id_usuario,
        rol: usuario.rol,
        email: usuario.email,
        nombre: `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim()
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    ok(res, {
      mensaje: 'Autenticación exitosa',
      token,
      usuario: {
        id: usuario.id_usuario,
        email: usuario.email,
        rol: usuario.rol,
        nombre: usuario.nombre,
        apellido: usuario.apellido
      }
    });

  } catch (error) {
    console.error('[API /auth/login] Error:', error);
    fail(res, 'Error al procesar el inicio de sesión', 500);
  }
});

/**
 * GET /api/auth/perfil
 * Devuelve el perfil del usuario autenticado actual a partir del token JWT.
 */
app.get('/api/auth/perfil', verificarToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id_usuario, email, rol, nombre, apellido, estado, creado_en FROM usuarios WHERE id_usuario = $1',
      [req.usuario.id_usuario]
    );

    if (result.rows.length === 0) return fail(res, 'Usuario no encontrado', 404);
    ok(res, result.rows[0]);
  } catch (error) {
    console.error('[API /auth/perfil] Error:', error);
    fail(res, 'Error al recuperar perfil', 500);
  }
});

// ─── GESTIÓN DE USUARIOS (CRUD CON POSTGRESQL) ──────────────────────────────

/**
 * GET /api/usuarios
 * Lista todos los usuarios registrados con su DNI, rol y nivel académico asociado.
 */
app.get('/api/usuarios', async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id_usuario as id,
        u.nombre,
        u.apellido,
        u.email,
        u.rol,
        u.estado,
        u.creado_en,
        COALESCE(a.dni, p.dni, t.dni, 'S/D') as dni,
        CASE 
          WHEN u.rol = 'ESTUDIANTE' THEN COALESCE(n_a.nombre, 'Primario')
          WHEN u.rol = 'DOCENTE' THEN 'Secundario'
          ELSE 'General'
        END as nivel
      FROM usuarios u
      LEFT JOIN alumnos a ON a.id_usuario = u.id_usuario
      LEFT JOIN cursos c_a ON c_a.id_curso = a.id_curso
      LEFT JOIN niveles n_a ON n_a.id_nivel = c_a.id_nivel
      LEFT JOIN profesores p ON p.id_usuario = u.id_usuario
      LEFT JOIN tutores t ON t.id_usuario = u.id_usuario
      ORDER BY u.id_usuario DESC;
    `;
    const result = await db.query(query);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /usuarios] Error al listar:', error);
    fail(res, 'Error al recuperar usuarios de la base de datos', 500);
  }
});

/**
 * POST /api/usuarios
 * Registra un nuevo usuario con contraseña hasheada en PostgreSQL
 * y crea su perfil correspondiente (alumno, profesor o tutor).
 */
app.post('/api/usuarios', async (req, res) => {
  const { nombre, apellido, dni, password, rol, nivel = 'primaria' } = req.body;

  if (!nombre || !apellido || !dni || !password || !rol) {
    return fail(res, 'Faltan campos obligatorios: nombre, apellido, dni, password y rol', 400);
  }

  // Normalizar rol
  const rolUpper = rol.toUpperCase();
  const rolBd = rolUpper === 'ALUMNO' ? 'ESTUDIANTE' : rolUpper === 'DOCENTE' ? 'DOCENTE' : rolUpper === 'FAMILIA' || rolUpper === 'TUTOR' ? 'PADRE' : rolUpper;

  if (!['ADMIN', 'DOCENTE', 'PADRE', 'ESTUDIANTE'].includes(rolBd)) {
    return fail(res, `Rol inválido: ${rol}`, 400);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Verificar si ya existe un usuario o registro con ese DNI o email
    const emailGenerado = `${dni}@novasys.edu.ar`;
    const checkEmail = await client.query('SELECT id_usuario FROM usuarios WHERE email = $1', [emailGenerado]);
    if (checkEmail.rows.length > 0) {
      await client.query('ROLLBACK');
      return fail(res, 'Ya existe una cuenta registrada con ese DNI / correo', 409);
    }

    // 2. Hashear la contraseña con bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Insertar usuario principal
    const userRes = await client.query(
      `INSERT INTO usuarios (email, password_hash, rol, nombre, apellido, estado)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVO')
       RETURNING id_usuario, email, rol, nombre, apellido, estado, creado_en`,
      [emailGenerado, passwordHash, rolBd, nombre, apellido]
    );

    const nuevoUsuario = userRes.rows[0];

    // 4. Crear registro en la tabla específica según el rol
    if (rolBd === 'ESTUDIANTE') {
      const idCurso = nivel.toLowerCase() === 'secundaria' ? 3 : 1; // 1° Grado o 1° Año
      const legajoAuto = `A${String(nuevoUsuario.id_usuario).padStart(3, '0')}`;
      await client.query(
        `INSERT INTO alumnos (legajo, dni, nombre, apellido, id_curso, id_usuario)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [legajoAuto, dni, nombre, apellido, idCurso, nuevoUsuario.id_usuario]
      );
    } else if (rolBd === 'DOCENTE') {
      const legajoDocente = `D${String(nuevoUsuario.id_usuario).padStart(3, '0')}`;
      await client.query(
        `INSERT INTO profesores (legajo, dni, nombre, apellido, especialidad, id_usuario)
         VALUES ($1, $2, $3, $4, 'Docencia General', $5)`,
        [legajoDocente, dni, nombre, apellido, nuevoUsuario.id_usuario]
      );
    } else if (rolBd === 'PADRE') {
      await client.query(
        `INSERT INTO tutores (dni, nombre, apellido, telefono, id_usuario)
         VALUES ($1, $2, $3, 'Sin registrar', $4)`,
        [dni, nombre, apellido, nuevoUsuario.id_usuario]
      );
    }

    await client.query('COMMIT');

    ok(res, {
      mensaje: `Usuario ${nombre} ${apellido} registrado con éxito en PostgreSQL`,
      usuario: {
        ...nuevoUsuario,
        dni,
        nivel
      }
    }, 201);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[API /usuarios POST] Error:', error);
    fail(res, error.message || 'Error al guardar usuario en la base de datos', 500);
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario por su ID
 */
app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM usuarios WHERE id_usuario = $1 RETURNING id_usuario, nombre, apellido',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return fail(res, 'Usuario no encontrado', 404);
    }

    ok(res, { mensaje: `Usuario ${result.rows[0].nombre} ${result.rows[0].apellido} eliminado con éxito` });
  } catch (error) {
    console.error('[API /usuarios DELETE] Error:', error);
    fail(res, 'Error al eliminar usuario', 500);
  }
});

// ─── 2. DASHBOARD / MÉTRICAS GENERALES ───────────────────────────────────────

/**
 * GET /api/dashboard
 * Reporta los conteos generales en tiempo real consultando PostgreSQL.
 */
app.get('/api/dashboard', async (req, res) => {
  try {
    const [alumnosRes, docentesRes, materiasRes, deportesRes] = await Promise.all([
      db.query("SELECT COUNT(*) FROM alumnos WHERE estado = 'ACTIVO'"),
      db.query("SELECT COUNT(*) FROM profesores"),
      db.query("SELECT COUNT(*) FROM materias"),
      db.query("SELECT COUNT(*) FROM inscripciones_deporte")
    ]);

    ok(res, {
      alumnosActivos: parseInt(alumnosRes.rows[0].count, 10),
      docentesRegistrados: parseInt(docentesRes.rows[0].count, 10),
      materiasDisponibles: parseInt(materiasRes.rows[0].count, 10),
      inscripcionesDeportes: parseInt(deportesRes.rows[0].count, 10)
    });
  } catch (error) {
    console.error('[API /dashboard] Error:', error);
    fail(res, 'Error al cargar métricas del dashboard', 500);
  }
});

// ─── 3. PROFESORES / DOCENTES (HU-04) ───────────────────────────────────────

/**
 * GET /api/docentes
 * Lista docentes con su carga horaria calculada y sus materias a cargo.
 */
app.get('/api/docentes', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id_profesor as id,
        p.legajo,
        p.dni,
        p.nombre,
        p.apellido,
        p.especialidad,
        p.telefono,
        u.email,
        COALESCE(SUM(m.carga_horaria), 0)::int as "cargaHorariaTotal",
        COALESCE(
          json_agg(
            json_build_object(
              'id_materia', m.id_materia,
              'codigo', m.codigo,
              'nombre', m.nombre,
              'carga_horaria', m.carga_horaria
            )
          ) FILTER (WHERE m.id_materia IS NOT NULL),
          '[]'
        ) as "materiasACargo"
      FROM profesores p
      LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
      LEFT JOIN asignaciones_docente ad ON ad.id_profesor = p.id_profesor
      LEFT JOIN materias m ON m.id_materia = ad.id_materia
      GROUP BY p.id_profesor, p.legajo, p.dni, p.nombre, p.apellido, p.especialidad, p.telefono, u.email
      ORDER BY p.apellido, p.nombre;
    `;
    const result = await db.query(query);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /docentes] Error:', error);
    fail(res, 'Error al listar docentes', 500);
  }
});

/**
 * GET /api/docentes/:id
 */
app.get('/api/docentes/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.id_profesor as id, p.legajo, p.dni, p.nombre, p.apellido, p.especialidad, p.telefono, u.email
       FROM profesores p
       LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
       WHERE p.id_profesor = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return fail(res, 'Docente no encontrado', 404);
    ok(res, result.rows[0]);
  } catch (error) {
    console.error('[API /docentes/:id] Error:', error);
    fail(res, 'Error al obtener docente', 500);
  }
});

// ─── 4. MATERIAS Y ASIGNACIONES (HU-04) ──────────────────────────────────────

/**
 * GET /api/materias
 * Lista materias con su nivel y profesor asignado actualmente (si tiene).
 */
app.get('/api/materias', async (req, res) => {
  try {
    const query = `
      SELECT 
        m.id_materia as id,
        m.codigo,
        m.nombre,
        m.carga_horaria as "cargaHoraria",
        n.nombre as nivel,
        ad.id_asignacion,
        p.id_profesor as "docenteId",
        CONCAT(p.nombre, ' ', p.apellido) as "docenteNombre"
      FROM materias m
      JOIN niveles n ON n.id_nivel = m.id_nivel
      LEFT JOIN asignaciones_docente ad ON ad.id_materia = m.id_materia
      LEFT JOIN profesores p ON p.id_profesor = ad.id_profesor
      ORDER BY m.nombre;
    `;
    const result = await db.query(query);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /materias] Error:', error);
    fail(res, 'Error al listar materias', 500);
  }
});

/**
 * POST /api/asignaciones
 * Asigna una materia a un profesor (HU-04: Límite 200 hs y unicidad por materia).
 */
app.post('/api/asignaciones', async (req, res) => {
  const { id_profesor, id_materia, id_curso = 1 } = req.body;

  if (!id_profesor || !id_materia) {
    return fail(res, 'Faltan campos obligatorios: id_profesor e id_materia');
  }

  try {
    // 1. Verificar si la materia ya está asignada
    const checkAsignada = await db.query(
      'SELECT id_asignacion, id_profesor FROM asignaciones_docente WHERE id_materia = $1',
      [id_materia]
    );

    if (checkAsignada.rows.length > 0) {
      return fail(res, 'Esta materia ya tiene un docente titular asignado. Desasígnela primero.');
    }

    // 2. Verificar límite de carga horaria (máx 200 hs)
    const horasDocenteRes = await db.query(`
      SELECT COALESCE(SUM(m.carga_horaria), 0)::int as total
      FROM asignaciones_docente ad
      JOIN materias m ON m.id_materia = ad.id_materia
      WHERE ad.id_profesor = $1
    `, [id_profesor]);

    const materiaRes = await db.query('SELECT carga_horaria, nombre FROM materias WHERE id_materia = $1', [id_materia]);
    if (materiaRes.rows.length === 0) return fail(res, 'Materia no encontrada', 404);

    const horasActuales = horasDocenteRes.rows[0].total;
    const horasNueva = materiaRes.rows[0].carga_horaria;

    if (horasActuales + horasNueva > 200) {
      return fail(res, `Supera el límite de 200 hs anuales permitidas (Actual: ${horasActuales}hs + ${horasNueva}hs = ${horasActuales + horasNueva}hs)`);
    }

    // 3. Insertar asignación
    const insertRes = await db.query(`
      INSERT INTO asignaciones_docente (id_profesor, id_materia, id_curso)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id_profesor, id_materia, id_curso]);

    ok(res, {
      mensaje: 'Materia asignada correctamente con éxito',
      asignacion: insertRes.rows[0]
    }, 201);

  } catch (error) {
    console.error('[API /asignaciones] Error:', error);
    fail(res, error.message || 'Error al asignar materia', 500);
  }
});

/**
 * DELETE /api/asignaciones/:id_materia
 * Desasigna una materia.
 */
app.delete('/api/asignaciones/:id_materia', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM asignaciones_docente WHERE id_materia = $1 RETURNING *',
      [req.params.id_materia]
    );

    if (result.rows.length === 0) {
      return fail(res, 'No se encontró asignación activa para esa materia', 404);
    }

    ok(res, { mensaje: 'Asignación eliminada correctamente' });
  } catch (error) {
    console.error('[API DELETE /asignaciones] Error:', error);
    fail(res, 'Error al desasignar materia', 500);
  }
});

// ─── 5. ALUMNOS ─────────────────────────────────────────────────────────────

app.get('/api/alumnos', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT a.id_alumno as id, a.legajo, a.dni, a.nombre, a.apellido, a.correo as email, a.estado,
             c.nombre as curso, n.nombre as nivel
      FROM alumnos a
      LEFT JOIN cursos c ON c.id_curso = a.id_curso
      LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      ORDER BY a.apellido, a.nombre
    `);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /alumnos] Error:', error);
    fail(res, 'Error al obtener alumnos', 500);
  }
});

// ─── 6. DEPORTES Y TRANSPORTE (HU-02 Y HU-03) ───────────────────────────────

/**
 * GET /api/deportes
 * Catálogo completo de deportes extracurriculares
 */
app.get('/api/deportes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT d.*, n.nombre as nivel_nombre,
             COUNT(i.id_inscripcion)::int as inscriptos_actuales
      FROM deportes d
      LEFT JOIN niveles n ON n.id_nivel = d.id_nivel
      LEFT JOIN inscripciones_deporte i ON i.id_deporte = d.id_deporte
      GROUP BY d.id_deporte, n.nombre
      ORDER BY d.nombre
    `);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /deportes] Error:', error);
    fail(res, 'Error al listar deportes', 500);
  }
});

/**
 * GET /api/alumnos/:id/deportes
 * Obtiene los deportes inscriptos de un alumno
 */
app.get('/api/alumnos/:id/deportes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT d.*, i.id_inscripcion, i.fecha_inscripcion
      FROM inscripciones_deporte i
      JOIN deportes d ON d.id_deporte = i.id_deporte
      WHERE i.id_alumno = $1
    `, [req.params.id]);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /alumnos/:id/deportes] Error:', error);
    fail(res, 'Error al obtener deportes del alumno', 500);
  }
});

/**
 * POST /api/deportes/inscribir
 * Valida máx 2 deportes y sin superposición antes de guardar en PostgreSQL
 */
app.post('/api/deportes/inscribir', async (req, res) => {
  const { id_alumno, id_deporte } = req.body;
  if (!id_alumno || !id_deporte) return fail(res, 'Faltan id_alumno e id_deporte');

  try {
    // 1. Cuántos deportes tiene actualmente el alumno
    const actuales = await db.query(`
      SELECT d.* FROM inscripciones_deporte i
      JOIN deportes d ON d.id_deporte = i.id_deporte
      WHERE i.id_alumno = $1
    `, [id_alumno]);

    if (actuales.rows.length >= 2) {
      return fail(res, 'El alumno ya alcanzó el máximo de 2 deportes extracurriculares permitidos.');
    }

    // 2. Verificar que no esté ya inscripto
    if (actuales.rows.some(d => d.id_deporte === Number(id_deporte))) {
      return fail(res, 'El alumno ya está inscripto en este deporte.');
    }

    // 3. Obtener datos del nuevo deporte
    const depNuevoRes = await db.query('SELECT * FROM deportes WHERE id_deporte = $1', [id_deporte]);
    if (depNuevoRes.rows.length === 0) return fail(res, 'Deporte no encontrado', 404);
    const nuevo = depNuevoRes.rows[0];

    // 4. Validar superposición de horario con los que ya tiene
    for (const d of actuales.rows) {
      if (d.dia_semana === nuevo.dia_semana) {
        if (nuevo.hora_inicio < d.hora_fin && nuevo.hora_fin > d.hora_inicio) {
          return fail(res, `Superposición horaria: Se solapa los días ${d.dia_semana} con ${d.nombre} (${d.hora_inicio} a ${d.hora_fin})`);
        }
      }
    }

    // 5. Inscribir en base de datos
    await db.query(`
      INSERT INTO inscripciones_deporte (id_alumno, id_deporte)
      VALUES ($1, $2)
    `, [id_alumno, id_deporte]);

    ok(res, { mensaje: `Inscripción exitosa a ${nuevo.nombre}` }, 201);

  } catch (error) {
    console.error('[API /deportes/inscribir] Error:', error);
    fail(res, error.message || 'Error al inscribir deporte', 500);
  }
});

/**
 * DELETE /api/deportes/desinscribir
 */
app.delete('/api/deportes/desinscribir', async (req, res) => {
  const { id_alumno, id_deporte } = req.body;
  try {
    await db.query(
      'DELETE FROM inscripciones_deporte WHERE id_alumno = $1 AND id_deporte = $2',
      [id_alumno, id_deporte]
    );
    ok(res, { mensaje: 'Desinscripción de deporte realizada' });
  } catch (error) {
    console.error('[API /deportes/desinscribir] Error:', error);
    fail(res, 'Error al desinscribir de deporte', 500);
  }
});

/**
 * POST /api/transporte/asignar (HU-03: 1 ruta activa por alumno)
 */
app.post('/api/transporte/asignar', async (req, res) => {
  const { id_alumno, recorrido_numero, zona, parada } = req.body;
  if (!id_alumno || !recorrido_numero || !zona || !parada) {
    return fail(res, 'Faltan campos obligatorios para transporte');
  }

  try {
    // Si ya tiene una ruta asignada, se actualiza a la nueva (garantizando 1 única activa)
    const result = await db.query(`
      INSERT INTO inscripciones_transporte (id_alumno, recorrido_numero, zona, parada)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id_alumno) 
      DO UPDATE SET recorrido_numero = EXCLUDED.recorrido_numero,
                    zona = EXCLUDED.zona,
                    parada = EXCLUDED.parada,
                    fecha_inscripcion = CURRENT_TIMESTAMP
      RETURNING *
    `, [id_alumno, recorrido_numero, zona, parada]);

    ok(res, {
      mensaje: `Transporte actualizado: Zona ${zona} (Recorrido ${recorrido_numero})`,
      transporte: result.rows[0]
    });
  } catch (error) {
    console.error('[API /transporte/asignar] Error:', error);
    fail(res, 'Error al asignar transporte escolar', 500);
  }
});

// ─── 404 CATCH-ALL ──────────────────────────────────────────────────────────

app.use((req, res) => fail(res, `Ruta no encontrada en la API: ${req.method} ${req.path}`, 404));

// ─── INICIO DEL SERVIDOR ────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 NovaSYS API (PostgreSQL + JWT) corriendo en http://localhost:${PORT}`);
  console.log('📡 Base de datos conectada: Neon Cloud PostgreSQL');
  console.log('🔐 Autenticación: JWT activo con RBAC');
  console.log('\nEndpoints principales listos:');
  console.log('  POST   /api/auth/login');
  console.log('  GET    /api/auth/perfil');
  console.log('  GET    /api/dashboard');
  console.log('  GET    /api/docentes');
  console.log('  GET    /api/materias');
  console.log('  POST   /api/asignaciones');
  console.log('  DELETE /api/asignaciones/:id_materia');
  console.log('  GET    /api/deportes');
  console.log('  POST   /api/deportes/inscribir');
  console.log('  POST   /api/transporte/asignar\n');
});