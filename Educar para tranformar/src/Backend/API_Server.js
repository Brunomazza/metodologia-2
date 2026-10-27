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
    let query = 'SELECT id_usuario, email, password_hash, rol, nombre, apellido, edad, genero, estado FROM usuarios WHERE email = $1';
    let param = email;

    if (!email && dni) {
      // Si mandaron DNI, buscar a través de alumnos, tutores o profesores
      query = `
        SELECT u.id_usuario, u.email, u.password_hash, u.rol, u.nombre, u.apellido, u.edad, u.genero, u.estado 
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
        apellido: usuario.apellido,
        edad: usuario.edad,
        genero: usuario.genero
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
      'SELECT id_usuario, email, rol, nombre, apellido, edad, genero, estado, creado_en FROM usuarios WHERE id_usuario = $1',
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
 * GET /api/tutores
 * Lista todos los tutores/padres registrados con la cantidad de alumnos a cargo
 */
app.get('/api/tutores', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.id_tutor,
        t.dni,
        t.nombre,
        t.apellido,
        t.telefono,
        u.email,
        COUNT(ta.id_alumno)::int as "hijosACargo"
      FROM tutores t
      JOIN usuarios u ON u.id_usuario = t.id_usuario
      LEFT JOIN tutor_alumno ta ON ta.id_tutor = t.id_tutor
      GROUP BY t.id_tutor, t.dni, t.nombre, t.apellido, t.telefono, u.email
      ORDER BY t.apellido, t.nombre;
    `;
    const result = await db.query(query);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /tutores] Error:', error);
    fail(res, 'Error al listar tutores', 500);
  }
});

/**
 * GET /api/tutores/:id/alumnos
 * Lista los alumnos a cargo de un tutor específico.
 * Soporta ?byUser=true cuando :id es el id_usuario del tutor logueado.
 */
app.get('/api/tutores/:id/alumnos', async (req, res) => {
  try {
    const isByUser = req.query.byUser === 'true';
    const tutorQuery = isByUser
      ? 'SELECT t.id_tutor, t.nombre, t.apellido, t.dni, t.telefono, u.email FROM tutores t JOIN usuarios u ON u.id_usuario = t.id_usuario WHERE t.id_usuario = $1'
      : 'SELECT t.id_tutor, t.nombre, t.apellido, t.dni, t.telefono, u.email FROM tutores t JOIN usuarios u ON u.id_usuario = t.id_usuario WHERE t.id_tutor = $1';

    const tutorRes = await db.query(tutorQuery, [req.params.id]);
    if (tutorRes.rows.length === 0) {
      return fail(res, 'Tutor no encontrado', 404);
    }
    const tutor = tutorRes.rows[0];

    const hijosQuery = `
      SELECT 
        a.id_alumno,
        a.id_usuario,
        a.legajo,
        a.dni,
        a.nombre,
        a.apellido,
        u.edad,
        u.genero,
        c.nombre as curso,
        ci.nombre as ciclo,
        n.nombre as nivel,
        c.division,
        ta.parentesco
      FROM tutor_alumno ta
      JOIN alumnos a ON a.id_alumno = ta.id_alumno
      LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
      LEFT JOIN cursos c ON c.id_curso = a.id_curso
      LEFT JOIN ciclos ci ON ci.id_ciclo = c.id_ciclo
      LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      WHERE ta.id_tutor = $1
      ORDER BY a.apellido, a.nombre;
    `;
    const hijosRes = await db.query(hijosQuery, [tutor.id_tutor]);
    ok(res, {
      tutor,
      hijos: hijosRes.rows
    });
  } catch (error) {
    console.error('[API /tutores/:id/alumnos] Error:', error);
    fail(res, 'Error al obtener alumnos del tutor', 500);
  }
});

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
        u.edad,
        u.genero,
        u.estado,
        u.creado_en,
        COALESCE(a.dni, p.dni, t.dni, 'S/D') as dni,
        CASE 
          WHEN u.rol = 'ESTUDIANTE' THEN COALESCE(n_a.nombre, 'Primario')
          WHEN u.rol = 'DOCENTE' THEN COALESCE(p.especialidad, 'Secundario')
          ELSE 'General'
        END as nivel,
        c_a.nombre as curso,
        ci_a.nombre as ciclo,
        p.id_profesor,
        p.especialidad as "docenteEspecialidad",
        CASE
          WHEN u.rol = 'ESTUDIANTE' THEN NULLIF(TRIM(CONCAT(tut.nombre, ' ', tut.apellido)), '')
          ELSE NULL
        END as "tutorNombre",
        COALESCE(
          (
            SELECT json_agg(json_build_object('id', m.id_materia, 'nombre', m.nombre, 'codigo', m.codigo, 'cargaHoraria', m.carga_horaria))
            FROM asignaciones_docente ad
            JOIN materias m ON m.id_materia = ad.id_materia
            WHERE ad.id_profesor = p.id_profesor
          ), '[]'
        ) as "materiasDictadas"
      FROM usuarios u
      LEFT JOIN alumnos a ON a.id_usuario = u.id_usuario
      LEFT JOIN cursos c_a ON c_a.id_curso = a.id_curso
      LEFT JOIN ciclos ci_a ON ci_a.id_ciclo = c_a.id_ciclo
      LEFT JOIN niveles n_a ON n_a.id_nivel = c_a.id_nivel
      LEFT JOIN profesores p ON p.id_usuario = u.id_usuario
      LEFT JOIN tutores t ON t.id_usuario = u.id_usuario
      LEFT JOIN tutor_alumno ta ON ta.id_alumno = a.id_alumno
      LEFT JOIN tutores tut ON tut.id_tutor = ta.id_tutor
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
 * REGLA DE NEGOCIO: Todo alumno debe tener al menos un tutor responsable.
 */
app.post('/api/usuarios', async (req, res) => {
  const { 
    nombre, apellido, dni, password, rol, nivel = 'primaria',
    edad, genero,
    id_curso,
    id_tutor, tutor_dni, tutor_nombre, tutor_apellido, tutor_telefono 
  } = req.body;

  if (!nombre || !apellido || !dni || !password || !rol) {
    return fail(res, 'Faltan campos obligatorios: nombre, apellido, dni, password y rol', 400);
  }

  // Normalizar rol
  const rolUpper = rol.toUpperCase();
  const rolBd = rolUpper === 'ALUMNO' ? 'ESTUDIANTE' : rolUpper === 'DOCENTE' ? 'DOCENTE' : rolUpper === 'FAMILIA' || rolUpper === 'TUTOR' ? 'PADRE' : rolUpper;

  if (!['ADMIN', 'DOCENTE', 'PADRE', 'ESTUDIANTE'].includes(rolBd)) {
    return fail(res, `Rol inválido: ${rol}`, 400);
  }

  // Si es estudiante, validar que se haya enviado tutor existente o nuevo
  if (rolBd === 'ESTUDIANTE') {
    if (!id_tutor && (!tutor_dni || !tutor_nombre || !tutor_apellido)) {
      return fail(res, 'Todo alumno debe tener al menos un padre/tutor responsable registrado.', 400);
    }
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

    // 3. Insertar usuario principal con edad y género (validando rango positivo)
    let edadVal = null;
    if (edad !== undefined && edad !== null && String(edad).trim() !== '') {
      edadVal = parseInt(edad, 10);
      if (isNaN(edadVal) || edadVal < 2 || edadVal > 120) {
        await client.query('ROLLBACK');
        return fail(res, 'La edad debe ser un número entero válido entre 2 y 120 años', 400);
      }
    }
    const generoVal = genero || null;

    const userRes = await client.query(
      `INSERT INTO usuarios (email, password_hash, rol, nombre, apellido, edad, genero, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVO')
       RETURNING id_usuario, email, rol, nombre, apellido, edad, genero, estado, creado_en`,
      [emailGenerado, passwordHash, rolBd, nombre, apellido, edadVal, generoVal]
    );

    const nuevoUsuario = userRes.rows[0];

    // 4. Crear registro en la tabla específica según el rol
    if (rolBd === 'ESTUDIANTE') {
      // Si viene id_curso directamente, usar ese; si no, inferir por nivel
      let idCurso = id_curso || null;
      if (!idCurso) {
        const nivelNorm = (nivel || '').toLowerCase();
        if (nivelNorm === 'inicial' || nivelNorm === 'jardin') {
          const cIni = await client.query('SELECT id_curso FROM cursos WHERE id_nivel = 1 ORDER BY anio_escolar LIMIT 1');
          idCurso = cIni.rows.length > 0 ? cIni.rows[0].id_curso : null;
        } else if (nivelNorm === 'secundaria' || nivelNorm === 'secundario') {
          const cSec = await client.query('SELECT id_curso FROM cursos WHERE id_nivel = 3 ORDER BY anio_escolar LIMIT 1');
          idCurso = cSec.rows.length > 0 ? cSec.rows[0].id_curso : null;
        } else {
          const cPri = await client.query('SELECT id_curso FROM cursos WHERE id_nivel = 2 ORDER BY anio_escolar LIMIT 1');
          idCurso = cPri.rows.length > 0 ? cPri.rows[0].id_curso : null;
        }
      }

      const legajoAuto = `A${String(nuevoUsuario.id_usuario).padStart(3, '0')}`;
      const alumnoRes = await client.query(
        `INSERT INTO alumnos (legajo, dni, nombre, apellido, id_curso, id_usuario)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_alumno`,
        [legajoAuto, dni, nombre, apellido, idCurso, nuevoUsuario.id_usuario]
      );
      const nuevoAlumnoId = alumnoRes.rows[0].id_alumno;

      // Vincular con Tutor (existente o nuevo)
      let finalTutorId = id_tutor;

      if (!finalTutorId && tutor_dni) {
        // Verificar si el tutor ya existe por DNI
        const checkTutor = await client.query('SELECT id_tutor FROM tutores WHERE dni = $1', [tutor_dni]);
        if (checkTutor.rows.length > 0) {
          finalTutorId = checkTutor.rows[0].id_tutor;
        } else {
          // Crear usuario para el nuevo tutor
          const emailTutor = `${tutor_dni}@novasys.edu.ar`;
          const passTutorHash = await bcrypt.hash('1234', 10);
          const uTutorRes = await client.query(
            `INSERT INTO usuarios (email, password_hash, rol, nombre, apellido, estado)
             VALUES ($1, $2, 'PADRE', $3, $4, 'ACTIVO')
             ON CONFLICT (email) DO UPDATE SET rol = 'PADRE'
             RETURNING id_usuario`,
            [emailTutor, passTutorHash, tutor_nombre, tutor_apellido]
          );

          const tutorRes = await client.query(
            `INSERT INTO tutores (dni, nombre, apellido, telefono, id_usuario)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id_tutor`,
            [tutor_dni, tutor_nombre, tutor_apellido, tutor_telefono || 'Sin registrar', uTutorRes.rows[0].id_usuario]
          );
          finalTutorId = tutorRes.rows[0].id_tutor;
        }
      }

      if (finalTutorId) {
        await client.query(
          `INSERT INTO tutor_alumno (id_tutor, id_alumno, parentesco)
           VALUES ($1, $2, 'PADRE')
           ON CONFLICT DO NOTHING`,
          [finalTutorId, nuevoAlumnoId]
        );
      }

    } else if (rolBd === 'DOCENTE') {
      const legajoDocente = `D${String(nuevoUsuario.id_usuario).padStart(3, '0')}`;
      const nivelNorm = (nivel || '').toLowerCase();
      const espDocente = (nivelNorm === 'inicial' || nivelNorm === 'jardin')
        ? 'Nivel Inicial (Jardín)'
        : (nivelNorm === 'primaria' || nivelNorm === 'primario')
          ? 'Nivel Primario'
          : 'Nivel Secundario';

      await client.query(
        `INSERT INTO profesores (legajo, dni, nombre, apellido, especialidad, id_usuario)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [legajoDocente, dni, nombre, apellido, espDocente, nuevoUsuario.id_usuario]
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
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      'SELECT id_usuario, rol, nombre, apellido FROM usuarios WHERE id_usuario = $1',
      [req.params.id]
    );

    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return fail(res, 'Usuario no encontrado', 404);
    }

    const u = userRes.rows[0];

    // 1. Si es estudiante, eliminar su registro de alumno (cascada en calificaciones y tutor_alumno)
    if (u.rol === 'ESTUDIANTE' || u.rol === 'ALUMNO') {
      await client.query('DELETE FROM alumnos WHERE id_usuario = $1', [u.id_usuario]);
    }

    // 2. Si es tutor/padre, eliminar de tutores (cascada en tutor_alumno)
    if (u.rol === 'PADRE' || u.rol === 'TUTOR') {
      await client.query('DELETE FROM tutores WHERE id_usuario = $1', [u.id_usuario]);
    }

    // 3. Si es docente, eliminar asignaciones y registro de profesor
    if (u.rol === 'DOCENTE') {
      await client.query(
        'DELETE FROM asignaciones_docente WHERE id_profesor IN (SELECT id_profesor FROM profesores WHERE id_usuario = $1)',
        [u.id_usuario]
      );
      await client.query('DELETE FROM profesores WHERE id_usuario = $1', [u.id_usuario]);
    }

    // 4. Eliminar el usuario principal
    await client.query('DELETE FROM usuarios WHERE id_usuario = $1', [u.id_usuario]);

    await client.query('COMMIT');
    ok(res, { mensaje: `Usuario ${u.nombre} ${u.apellido} y sus registros vinculados eliminados con éxito` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[API /usuarios DELETE] Error:', error);
    fail(res, 'Error al eliminar usuario: ' + error.message, 500);
  } finally {
    client.release();
  }
});

// ─── 2. DASHBOARD / MÉTRICAS GENERALES ───────────────────────────────────────

/**
 * GET /api/dashboard
 * Reporta los conteos generales en tiempo real consultando PostgreSQL.
 */
app.get('/api/dashboard', async (req, res) => {
  try {
    const [alumnosRes, docentesRes, materiasRes, deportesRes, preinscripRes] = await Promise.all([
      db.query("SELECT COUNT(*) FROM alumnos WHERE estado = 'ACTIVO'"),
      db.query("SELECT COUNT(*) FROM profesores"),
      db.query("SELECT COUNT(*) FROM materias"),
      db.query("SELECT COUNT(*) FROM inscripciones_deporte"),
      db.query("SELECT COUNT(*) FROM preinscripciones")
    ]);

    ok(res, {
      alumnosActivos: parseInt(alumnosRes.rows[0].count, 10),
      docentesRegistrados: parseInt(docentesRes.rows[0].count, 10),
      materiasDisponibles: parseInt(materiasRes.rows[0].count, 10),
      inscripcionesDeportes: parseInt(deportesRes.rows[0].count, 10),
      preinscripciones: parseInt(preinscripRes.rows[0].count, 10)
    });
  } catch (error) {
    console.error('[API /dashboard] Error:', error);
    fail(res, 'Error al cargar métricas del dashboard', 500);
  }
});

// ─── 3. NIVELES, CICLOS Y CURSOS ─────────────────────────────────────────────

/**
 * GET /api/niveles
 * Lista todos los niveles educativos.
 */
app.get('/api/niveles', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM niveles ORDER BY id_nivel');
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /niveles] Error:', error);
    fail(res, 'Error al listar niveles', 500);
  }
});

/**
 * GET /api/ciclos
 * Lista todos los ciclos con su nivel.
 */
app.get('/api/ciclos', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.id_ciclo, c.nombre, c.descripcion, n.nombre as nivel
      FROM ciclos c
      JOIN niveles n ON n.id_nivel = c.id_nivel
      ORDER BY c.id_nivel, c.id_ciclo
    `);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /ciclos] Error:', error);
    fail(res, 'Error al listar ciclos', 500);
  }
});

/**
 * GET /api/cursos
 * Lista todos los cursos con nivel, ciclo, cantidad de alumnos y materias.
 */
app.get('/api/cursos', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        cu.id_curso,
        cu.nombre,
        cu.anio_escolar,
        cu.division,
        n.id_nivel,
        n.nombre as nivel,
        ci.id_ciclo,
        ci.nombre as ciclo,
        COUNT(DISTINCT a.id_alumno)::int as total_alumnos,
        COUNT(DISTINCT cm.id_materia)::int as total_materias
      FROM cursos cu
      JOIN niveles n ON n.id_nivel = cu.id_nivel
      LEFT JOIN ciclos ci ON ci.id_ciclo = cu.id_ciclo
      LEFT JOIN alumnos a ON a.id_curso = cu.id_curso AND a.estado = 'ACTIVO'
      LEFT JOIN curso_materia cm ON cm.id_curso = cu.id_curso
      GROUP BY cu.id_curso, cu.nombre, cu.anio_escolar, cu.division,
               n.id_nivel, n.nombre, ci.id_ciclo, ci.nombre
      ORDER BY n.id_nivel, cu.anio_escolar, cu.division
    `);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /cursos] Error:', error);
    fail(res, 'Error al listar cursos', 500);
  }
});

/**
 * GET /api/cursos/:id
 * Detalle de un curso.
 */
app.get('/api/cursos/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        cu.id_curso, cu.nombre, cu.anio_escolar, cu.division,
        n.id_nivel, n.nombre as nivel,
        ci.id_ciclo, ci.nombre as ciclo, ci.descripcion as ciclo_descripcion
      FROM cursos cu
      JOIN niveles n ON n.id_nivel = cu.id_nivel
      LEFT JOIN ciclos ci ON ci.id_ciclo = cu.id_ciclo
      WHERE cu.id_curso = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return fail(res, 'Curso no encontrado', 404);
    ok(res, result.rows[0]);
  } catch (error) {
    console.error('[API /cursos/:id] Error:', error);
    fail(res, 'Error al obtener curso', 500);
  }
});

/**
 * GET /api/cursos/:id/materias
 * Lista las materias del plan de estudios de un curso específico,
 * incluyendo el docente asignado a cada una (si tiene).
 */
app.get('/api/cursos/:id/materias', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        m.id_materia,
        m.codigo,
        m.nombre,
        m.carga_horaria as "cargaHoraria",
        ad.id_asignacion,
        p.id_profesor as "docenteId",
        NULLIF(TRIM(CONCAT(p.nombre, ' ', p.apellido)), '') as "docenteNombre"
      FROM curso_materia cm
      JOIN materias m ON m.id_materia = cm.id_materia
      LEFT JOIN asignaciones_docente ad
             ON ad.id_materia = m.id_materia AND ad.id_curso = cm.id_curso
      LEFT JOIN profesores p ON p.id_profesor = ad.id_profesor
      WHERE cm.id_curso = $1
      ORDER BY m.nombre
    `, [req.params.id]);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /cursos/:id/materias] Error:', error);
    fail(res, 'Error al obtener materias del curso', 500);
  }
});

/**
 * GET /api/cursos/:id/alumnos
 * Lista los alumnos de un curso.
 */
app.get('/api/cursos/:id/alumnos', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        a.id_alumno, a.legajo, a.dni, a.nombre, a.apellido,
        a.fecha_nacimiento, a.correo, a.estado,
        u.edad, u.genero,
        NULLIF(TRIM(CONCAT(t.nombre, ' ', t.apellido)), '') as tutor_nombre,
        t.telefono as tutor_telefono,
        ta.parentesco
      FROM alumnos a
      LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
      LEFT JOIN tutor_alumno ta ON ta.id_alumno = a.id_alumno
      LEFT JOIN tutores t ON t.id_tutor = ta.id_tutor
      WHERE a.id_curso = $1
      ORDER BY a.apellido, a.nombre
    `, [req.params.id]);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /cursos/:id/alumnos] Error:', error);
    fail(res, 'Error al obtener alumnos del curso', 500);
  }
});

/**
 * GET /api/alumnos
 * Lista todos los alumnos registrados en el sistema institucional con curso, división y tutor.
 */
app.get('/api/alumnos', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        a.id_alumno as id,
        a.id_alumno,
        a.legajo,
        a.dni,
        a.nombre,
        a.apellido,
        a.fecha_nacimiento,
        a.domicilio,
        a.telefono,
        a.correo,
        a.estado,
        cu.id_curso,
        cu.nombre as curso_nombre,
        cu.division,
        cu.anio_escolar,
        n.id_nivel,
        n.nombre as nivel,
        ci.id_ciclo,
        ci.nombre as ciclo,
        u.edad,
        u.genero,
        t.id_tutor,
        NULLIF(TRIM(CONCAT(t.nombre, ' ', t.apellido)), '') as tutor_nombre,
        t.telefono as tutor_telefono,
        t.dni as tutor_dni,
        ta.parentesco
      FROM alumnos a
      LEFT JOIN cursos cu ON cu.id_curso = a.id_curso
      LEFT JOIN niveles n ON n.id_nivel = cu.id_nivel
      LEFT JOIN ciclos ci ON ci.id_ciclo = cu.id_ciclo
      LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
      LEFT JOIN tutor_alumno ta ON ta.id_alumno = a.id_alumno
      LEFT JOIN tutores t ON t.id_tutor = ta.id_tutor
      ORDER BY n.id_nivel, cu.anio_escolar, cu.division, a.apellido, a.nombre
    `);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API GET /alumnos] Error:', error);
    fail(res, 'Error al listar alumnos', 500);
  }
});

/**
 * PUT /api/alumnos/:id/curso
 * Permite cambiar el curso o la división de un alumno en la base de datos.
 */
app.put('/api/alumnos/:id/curso', async (req, res) => {
  const { id_curso } = req.body;
  const idAlumno = parseInt(req.params.id, 10);
  if (isNaN(idAlumno) || !id_curso) {
    return fail(res, 'ID de alumno o id_curso inválido', 400);
  }
  try {
    const cursoCheck = await db.query('SELECT * FROM cursos WHERE id_curso = $1', [id_curso]);
    if (cursoCheck.rows.length === 0) return fail(res, 'Curso inexistente', 404);

    await db.query('UPDATE alumnos SET id_curso = $1 WHERE id_alumno = $2', [id_curso, idAlumno]);
    ok(res, { mensaje: 'Curso y división actualizados con éxito', curso: cursoCheck.rows[0] });
  } catch (error) {
    console.error('[API PUT /alumnos/:id/curso] Error:', error);
    fail(res, 'Error al reasignar curso del alumno', 500);
  }
});

/**
 * GET /api/cursos/:id/docentes
 * Lista los docentes que tienen materias asignadas en ese curso.
 */
app.get('/api/cursos/:id/docentes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        p.id_profesor, p.legajo, p.nombre, p.apellido, p.especialidad,
        u.email,
        json_agg(
          json_build_object(
            'id_materia', m.id_materia,
            'nombre', m.nombre,
            'codigo', m.codigo
          )
        ) as materias_en_curso
      FROM asignaciones_docente ad
      JOIN profesores p ON p.id_profesor = ad.id_profesor
      LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
      JOIN materias m ON m.id_materia = ad.id_materia
      WHERE ad.id_curso = $1
      GROUP BY p.id_profesor, p.legajo, p.nombre, p.apellido, p.especialidad, u.email
      ORDER BY p.apellido
    `, [req.params.id]);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /cursos/:id/docentes] Error:', error);
    fail(res, 'Error al obtener docentes del curso', 500);
  }
});

/**
 * POST /api/cursos
 * Crea un nuevo curso.
 */
app.post('/api/cursos', async (req, res) => {
  const { nombre, id_nivel, id_ciclo, anio_escolar, division = 'A' } = req.body;
  if (!nombre || !id_nivel) return fail(res, 'Faltan campos: nombre, id_nivel', 400);
  try {
    const result = await db.query(`
      INSERT INTO cursos (nombre, id_nivel, id_ciclo, anio_escolar, division)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [nombre, id_nivel, id_ciclo || null, anio_escolar || null, division]);
    ok(res, result.rows[0], 201);
  } catch (error) {
    console.error('[API POST /cursos] Error:', error);
    fail(res, 'Error al crear curso', 500);
  }
});

/**
 * POST /api/cursos/:id/materias
 * Agrega una materia al plan de estudios de un curso.
 */
app.post('/api/cursos/:id/materias', async (req, res) => {
  const { id_materia } = req.body;
  if (!id_materia) return fail(res, 'Falta id_materia', 400);
  try {
    await db.query(
      'INSERT INTO curso_materia (id_curso, id_materia) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, id_materia]
    );
    ok(res, { mensaje: 'Materia agregada al plan de estudios del curso' }, 201);
  } catch (error) {
    console.error('[API POST /cursos/:id/materias] Error:', error);
    fail(res, 'Error al agregar materia al curso', 500);
  }
});

/**
 * DELETE /api/cursos/:id/materias/:id_materia
 * Quita una materia del plan de estudios de un curso.
 */
app.delete('/api/cursos/:id/materias/:id_materia', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM curso_materia WHERE id_curso = $1 AND id_materia = $2',
      [req.params.id, req.params.id_materia]
    );
    ok(res, { mensaje: 'Materia removida del plan de estudios' });
  } catch (error) {
    console.error('[API DELETE /cursos/:id/materias] Error:', error);
    fail(res, 'Error al quitar materia del curso', 500);
  }
});


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
        u.edad,
        u.genero,
        COALESCE(SUM(m.carga_horaria), 0)::int as "cargaHorariaTotal",
        COALESCE(
          json_agg(
            json_build_object(
              'id_materia', m.id_materia,
              'codigo', m.codigo,
              'nombre', m.nombre,
              'carga_horaria', m.carga_horaria,
              'id_curso', cu.id_curso,
              'curso_nombre', cu.nombre,
              'curso_division', cu.division,
              'nivel_nombre', n.nombre
            )
          ) FILTER (WHERE m.id_materia IS NOT NULL),
          '[]'
        ) as "materiasACargo"
      FROM profesores p
      LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
      LEFT JOIN asignaciones_docente ad ON ad.id_profesor = p.id_profesor
      LEFT JOIN materias m ON m.id_materia = ad.id_materia
      LEFT JOIN cursos cu ON cu.id_curso = ad.id_curso
      LEFT JOIN niveles n ON n.id_nivel = m.id_nivel
      GROUP BY p.id_profesor, p.legajo, p.dni, p.nombre, p.apellido, p.especialidad, p.telefono, u.email, u.edad, u.genero
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

/**
 * GET /api/docentes/:id/alumnos
 * Retorna ÚNICAMENTE los alumnos que cursan materias asignadas a este docente.
 * Soporta ?byUser=true para consultar por id_usuario de sesión.
 */
app.get('/api/docentes/:id/alumnos', async (req, res) => {
  try {
    const byUser = req.query.byUser === 'true';
    let idProfesor = null;

    if (byUser) {
      const profRes = await db.query('SELECT id_profesor FROM profesores WHERE id_usuario = $1', [req.params.id]);
      if (profRes.rows.length === 0) {
        return ok(res, []);
      }
      idProfesor = profRes.rows[0].id_profesor;
    } else {
      idProfesor = parseInt(req.params.id, 10);
      if (isNaN(idProfesor)) {
        return fail(res, 'ID de docente inválido', 400);
      }
    }

    // Obtener alumnos que cursen en los cursos donde este docente dicta materias
    const query = `
      WITH docente_materias_cursos AS (
        SELECT DISTINCT 
          ad.id_profesor,
          m.id_materia,
          m.codigo as materia_codigo,
          m.nombre as materia_nombre,
          COALESCE(ad.id_curso, cm.id_curso) as id_curso
        FROM asignaciones_docente ad
        JOIN materias m ON m.id_materia = ad.id_materia
        LEFT JOIN curso_materia cm ON cm.id_materia = m.id_materia
        WHERE ad.id_profesor = $1
      )
      SELECT 
        a.id_alumno as id,
        a.id_alumno,
        a.legajo,
        a.dni,
        a.nombre,
        a.apellido,
        a.estado,
        u.edad,
        u.genero,
        c.id_curso,
        c.nombre as curso,
        c.division,
        n.nombre as nivel,
        ci.nombre as ciclo,
        json_agg(
          DISTINCT jsonb_build_object(
            'id_materia', dmc.id_materia,
            'codigo', dmc.materia_codigo,
            'nombre', dmc.materia_nombre
          )
        ) as materias_con_docente
      FROM docente_materias_cursos dmc
      JOIN alumnos a ON a.id_curso = dmc.id_curso
      LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
      LEFT JOIN cursos c ON c.id_curso = a.id_curso
      LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      LEFT JOIN ciclos ci ON ci.id_ciclo = c.id_ciclo
      GROUP BY a.id_alumno, a.legajo, a.dni, a.nombre, a.apellido, a.estado, u.edad, u.genero, c.id_curso, c.nombre, c.division, n.nombre, ci.nombre
      ORDER BY c.nombre, a.apellido, a.nombre;
    `;

    const result = await db.query(query, [idProfesor]);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /docentes/:id/alumnos] Error:', error);
    fail(res, 'Error al listar alumnos del docente', 500);
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
        m.id_nivel,
        ad.id_asignacion,
        ad.id_curso,
        c.nombre as "cursoNombre",
        p.id_profesor as "docenteId",
        CONCAT(p.nombre, ' ', p.apellido) as "docenteNombre"
      FROM materias m
      JOIN niveles n ON n.id_nivel = m.id_nivel
      LEFT JOIN asignaciones_docente ad ON ad.id_materia = m.id_materia
      LEFT JOIN cursos c ON c.id_curso = ad.id_curso
      LEFT JOIN profesores p ON p.id_profesor = ad.id_profesor
      ORDER BY m.id_nivel, m.nombre;
    `;
    const result = await db.query(query);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /materias] Error:', error);
    fail(res, 'Error al listar materias', 500);
  }
});

/**
 * POST /api/materias
 * Crea una nueva materia en el catálogo oficial
 */
app.post('/api/materias', async (req, res) => {
  const { codigo, nombre, cargaHoraria, nivel = 'secundaria' } = req.body;
  if (!codigo || !nombre || !cargaHoraria) {
    return fail(res, 'Faltan campos obligatorios: codigo, nombre y cargaHoraria');
  }

  try {
    const nLower = (nivel || '').toLowerCase();
    const idNivel = (nLower === 'inicial' || nLower === 'jardin') ? 1 : (nLower === 'primaria') ? 2 : 3;
    const result = await db.query(
      `INSERT INTO materias (codigo, nombre, carga_horaria, id_nivel)
       VALUES ($1, $2, $3, $4)
       RETURNING id_materia as id, codigo, nombre, carga_horaria as "cargaHoraria"`,
      [codigo.toUpperCase(), nombre, cargaHoraria, idNivel]
    );
    ok(res, { mensaje: 'Materia agregada exitosamente', materia: result.rows[0] }, 201);
  } catch (error) {
    console.error('[API POST /materias] Error:', error);
    if (error.code === '23505') {
      return fail(res, 'Ya existe una materia con ese código', 409);
    }
    fail(res, 'Error al registrar la materia en la base de datos', 500);
  }
});

/**
 * GET /api/asignaciones
 * Retorna todas las asignaciones de docentes con datos de curso, materia y docente.
 */
app.get('/api/asignaciones', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        ad.id_asignacion,
        ad.id_profesor as "docenteId",
        p.legajo,
        p.nombre as "docenteNombre",
        p.apellido as "docenteApellido",
        ad.id_materia as "materiaId",
        m.codigo as "materiaCodigo",
        m.nombre as "materiaNombre",
        m.carga_horaria as "cargaHoraria",
        n.nombre as nivel,
        ad.id_curso as "cursoId",
        c.nombre as "cursoNombre",
        ad.fecha_asignacion as "fechaAsignacion"
      FROM asignaciones_docente ad
      JOIN profesores p ON p.id_profesor = ad.id_profesor
      JOIN materias m ON m.id_materia = ad.id_materia
      JOIN niveles n ON n.id_nivel = m.id_nivel
      LEFT JOIN cursos c ON c.id_curso = ad.id_curso
      ORDER BY c.id_curso NULLS LAST, m.nombre;
    `);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API GET /asignaciones] Error:', error);
    fail(res, 'Error al listar asignaciones', 500);
  }
});

/**
 * POST /api/asignaciones
 * Asigna una materia a un profesor (HU-04: Límite 200 hs y unicidad por materia).
 */
app.post('/api/asignaciones', async (req, res) => {
  const { id_profesor, id_materia, id_curso } = req.body;

  if (!id_profesor || !id_materia) {
    return fail(res, 'Faltan campos obligatorios: id_profesor e id_materia');
  }

  try {
    // 1. Determinar id_curso correcto: si no se envía, obtener el curso real de curso_materia
    let cursoId = (id_curso !== undefined && id_curso !== null && String(id_curso).trim() !== '') ? parseInt(id_curso, 10) : null;
    if (!cursoId) {
      const cmRes = await db.query('SELECT id_curso FROM curso_materia WHERE id_materia = $1 ORDER BY id_curso LIMIT 1', [id_materia]);
      cursoId = cmRes.rows.length > 0 ? cmRes.rows[0].id_curso : null;
    }

    // 2. Verificar si la materia ya está asignada en este curso específico
    const checkAsignada = await db.query(
      cursoId 
        ? 'SELECT id_asignacion, id_profesor FROM asignaciones_docente WHERE id_materia = $1 AND id_curso = $2'
        : 'SELECT id_asignacion, id_profesor FROM asignaciones_docente WHERE id_materia = $1',
      cursoId ? [id_materia, cursoId] : [id_materia]
    );

    if (checkAsignada.rows.length > 0) {
      return fail(res, 'Esta materia ya tiene un docente titular asignado para este curso. Desasígnela primero.');
    }

    // 3. Verificar correspondencia de nivel docente vs materia
    const profNivelRes = await db.query('SELECT especialidad, nombre, apellido FROM profesores WHERE id_profesor = $1', [id_profesor]);
    const matNivelRes = await db.query('SELECT m.nombre, m.id_nivel, n.nombre as nivel_nombre FROM materias m JOIN niveles n ON n.id_nivel = m.id_nivel WHERE m.id_materia = $1', [id_materia]);
    
    if (profNivelRes.rows.length === 0) return fail(res, 'Docente no encontrado', 404);
    if (matNivelRes.rows.length === 0) return fail(res, 'Materia no encontrada', 404);

    const prof = profNivelRes.rows[0];
    const mat = matNivelRes.rows[0];
    const espProf = (prof.especialidad || '').toLowerCase();
    const idNivelMat = mat.id_nivel; // 1: Inicial, 2: Primario, 3: Secundario

    let nivelDocenteEsperado = null;
    let nombreNivelDocente = '';
    if (espProf.includes('inicial') || espProf.includes('jard')) {
      nivelDocenteEsperado = 1;
      nombreNivelDocente = 'Nivel Inicial';
    } else if (espProf.includes('primar')) {
      nivelDocenteEsperado = 2;
      nombreNivelDocente = 'Nivel Primario';
    } else if (espProf.includes('secundar')) {
      nivelDocenteEsperado = 3;
      nombreNivelDocente = 'Nivel Secundario';
    }

    if (nivelDocenteEsperado !== null && nivelDocenteEsperado !== idNivelMat) {
      return fail(res, `Incompatibilidad de nivel: El docente '${prof.nombre} ${prof.apellido}' está registrado en '${prof.especialidad || nombreNivelDocente}' y no puede dictar la materia '${mat.nombre}' que corresponde a '${mat.nivel_nombre}'.`);
    }

    // 4. Verificar límite de carga horaria (máx 200 hs)
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

    // 5. Insertar asignación
    const insertRes = await db.query(`
      INSERT INTO asignaciones_docente (id_profesor, id_materia, id_curso)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id_profesor, id_materia, cursoId]);

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
 * POST /api/asignaciones/bloque
 * Asigna un bloque de materias troncales de un curso a un maestro titular
 * (Jardín: actividades de sala; Primaria 1°-3°: troncales de grado; Primaria 4°-6°: pareja pedagógica).
 */
app.post('/api/asignaciones/bloque', async (req, res) => {
  const { id_profesor, id_curso, materias_ids } = req.body;

  if (!id_profesor || !id_curso || !Array.isArray(materias_ids) || materias_ids.length === 0) {
    return fail(res, 'Faltan campos obligatorios: id_profesor, id_curso y materias_ids');
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Validar docente y curso
    const profRes = await client.query('SELECT especialidad, nombre, apellido FROM profesores WHERE id_profesor = $1', [id_profesor]);
    const cursoRes = await client.query('SELECT c.nombre as curso_nombre, c.id_nivel, n.nombre as nivel_nombre FROM cursos c JOIN niveles n ON n.id_nivel = c.id_nivel WHERE c.id_curso = $1', [id_curso]);

    if (profRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return fail(res, 'Docente no encontrado', 404);
    }
    if (cursoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return fail(res, 'Curso no encontrado', 404);
    }

    const prof = profRes.rows[0];
    const curso = cursoRes.rows[0];
    const espProf = (prof.especialidad || '').toLowerCase();
    let nivelDocenteEsperado = null;
    if (espProf.includes('inicial') || espProf.includes('jard')) nivelDocenteEsperado = 1;
    else if (espProf.includes('primar')) nivelDocenteEsperado = 2;
    else if (espProf.includes('secundar')) nivelDocenteEsperado = 3;

    if (nivelDocenteEsperado !== null && nivelDocenteEsperado !== curso.id_nivel) {
      await client.query('ROLLBACK');
      return fail(res, `Incompatibilidad de nivel: El docente '${prof.nombre} ${prof.apellido}' pertenece a '${prof.especialidad}' y el curso seleccionado es de '${curso.nivel_nombre}'.`, 400);
    }

    const asignadas = [];
    for (const id_materia of materias_ids) {
      await client.query('DELETE FROM asignaciones_docente WHERE id_materia = $1 AND id_curso = $2', [id_materia, id_curso]);
      const insRes = await client.query(`
        INSERT INTO asignaciones_docente (id_profesor, id_materia, id_curso)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [id_profesor, id_materia, id_curso]);
      asignadas.push(insRes.rows[0]);
    }

    await client.query('COMMIT');
    ok(res, {
      mensaje: `Bloque pedagógico asignado con éxito a ${prof.nombre} ${prof.apellido} en ${curso.curso_nombre}`,
      asignadas
    }, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[API /asignaciones/bloque] Error:', err);
    fail(res, err.message || 'Error al asignar bloque', 500);
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/asignaciones/:id_materia
 * Desasigna una materia (opcionalmente filtrando por cursoId).
 */
app.delete('/api/asignaciones/:id_materia', async (req, res) => {
  try {
    const cursoId = req.query.cursoId ? parseInt(req.query.cursoId, 10) : null;
    let query = 'DELETE FROM asignaciones_docente WHERE id_materia = $1 RETURNING *';
    let params = [req.params.id_materia];

    if (cursoId) {
      query = 'DELETE FROM asignaciones_docente WHERE id_materia = $1 AND id_curso = $2 RETURNING *';
      params = [req.params.id_materia, cursoId];
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return fail(res, 'No se encontró asignación activa para esa materia', 404);
    }

    ok(res, { mensaje: 'Asignación eliminada correctamente' });
  } catch (error) {
    console.error('[API DELETE /asignaciones] Error:', error);
    fail(res, 'Error al desasignar materia', 500);
  }
});

/**
 * DELETE /api/asignaciones/id/:id
 * Elimina una asignación por su id_asignacion primario.
 */
app.delete('/api/asignaciones/id/:id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM asignaciones_docente WHERE id_asignacion = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return fail(res, 'Asignación no encontrada', 404);
    }
    ok(res, { mensaje: 'Asignación eliminada correctamente' });
  } catch (error) {
    console.error('[API DELETE /asignaciones/id/:id] Error:', error);
    fail(res, 'Error al eliminar asignación', 500);
  }
});

// ─── 5. ALUMNOS ─────────────────────────────────────────────────────────────

app.get('/api/alumnos', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        a.id_alumno as id, a.legajo, a.dni, a.nombre, a.apellido,
        a.correo as email, a.estado,
        u.edad, u.genero,
        c.id_curso, c.nombre as curso, c.anio_escolar, c.division,
        n.nombre as nivel,
        ci.nombre as ciclo
      FROM alumnos a
      LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
      LEFT JOIN cursos c ON c.id_curso = a.id_curso
      LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      LEFT JOIN ciclos ci ON ci.id_ciclo = c.id_ciclo
      ORDER BY a.apellido, a.nombre
    `);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API /alumnos] Error:', error);
    fail(res, 'Error al obtener alumnos', 500);
  }
});

/**
 * GET /api/alumnos/:id
 * Obtiene el detalle de un alumno por id_alumno o por id_usuario (?byUser=true)
 */
app.get('/api/alumnos/:id', async (req, res) => {
  try {
    const byUser = req.query.byUser === 'true';
    let param = req.params.id;

    if (!param || param === 'undefined' || param === 'null') {
      return fail(res, 'ID de alumno no especificado o inválido', 400);
    }

    if (isNaN(parseInt(param, 10))) {
      const findRes = await db.query('SELECT id_alumno FROM alumnos WHERE LOWER(nombre) = LOWER($1) LIMIT 1', [param]);
      if (findRes.rows.length > 0) {
        param = findRes.rows[0].id_alumno;
      } else {
        return fail(res, 'Alumno no encontrado', 404);
      }
    }

    const query = `
      SELECT
        a.id_alumno as id,
        a.id_alumno,
        a.id_usuario,
        a.legajo,
        a.dni,
        a.nombre,
        a.apellido,
        a.fecha_nacimiento,
        a.correo as email,
        a.estado,
        u.edad,
        u.genero,
        c.id_curso,
        c.nombre as curso,
        c.anio_escolar,
        c.division,
        n.id_nivel,
        n.nombre as nivel,
        ci.id_ciclo,
        ci.nombre as ciclo,
        NULLIF(TRIM(CONCAT(t.nombre, ' ', t.apellido)), '') as "tutorNombre",
        t.telefono as "tutorTelefono"
      FROM alumnos a
      LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
      LEFT JOIN cursos c ON c.id_curso = a.id_curso
      LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
      LEFT JOIN ciclos ci ON ci.id_ciclo = c.id_ciclo
      LEFT JOIN tutor_alumno ta ON ta.id_alumno = a.id_alumno
      LEFT JOIN tutores t ON t.id_tutor = ta.id_tutor
      WHERE ${byUser ? 'a.id_usuario = $1' : 'a.id_alumno = $1'}
      LIMIT 1;
    `;
    const result = await db.query(query, [param]);
    if (result.rows.length === 0) {
      return fail(res, 'Alumno no encontrado', 404);
    }
    ok(res, result.rows[0]);
  } catch (error) {
    console.error('[API /alumnos/:id] Error:', error);
    fail(res, 'Error al obtener datos del alumno', 500);
  }
});

/**
 * GET /api/alumnos/:id/calificaciones
 * Obtiene el boletín de calificaciones de un alumno:
 * Lista todas las materias correspondientes a su curso y sus notas en cada trimestre,
 * calculando el promedio final y el estado académico por materia.
 */
app.get('/api/alumnos/:id/calificaciones', async (req, res) => {
  try {
    const byUser = req.query.byUser === 'true';
    let idParam = req.params.id;

    if (!idParam || idParam === 'undefined' || idParam === 'null') {
      return fail(res, 'ID de alumno no especificado o inválido', 400);
    }

    if (isNaN(parseInt(idParam, 10))) {
      const findRes = await db.query('SELECT id_alumno FROM alumnos WHERE LOWER(nombre) = LOWER($1) LIMIT 1', [idParam]);
      if (findRes.rows.length > 0) {
        idParam = findRes.rows[0].id_alumno;
      } else {
        return fail(res, 'Alumno no encontrado', 404);
      }
    }

    // 1. Obtener alumno y su curso
    const alRes = await db.query(
      `SELECT a.id_alumno, a.nombre, a.apellido, a.legajo, a.id_curso,
              c.nombre as curso, c.anio_escolar, n.nombre as nivel, ci.nombre as ciclo
       FROM alumnos a
       LEFT JOIN cursos c ON c.id_curso = a.id_curso
       LEFT JOIN niveles n ON n.id_nivel = c.id_nivel
       LEFT JOIN ciclos ci ON ci.id_ciclo = c.id_ciclo
       WHERE ${byUser ? 'a.id_usuario = $1' : 'a.id_alumno = $1'}`,
      [idParam]
    );

    if (alRes.rows.length === 0) {
      return fail(res, 'Alumno no encontrado', 404);
    }

    const alumno = alRes.rows[0];
    const idAlumnoReal = alumno.id_alumno;

    // 2. Obtener materias del plan de estudios de este curso y las calificaciones registradas
    const query = `
      SELECT 
        m.id_materia,
        m.codigo,
        m.nombre as materia,
        m.carga_horaria,
        MAX(CASE WHEN cal.trimestre = 1 THEN cal.nota END) as t1,
        MAX(CASE WHEN cal.trimestre = 2 THEN cal.nota END) as t2,
        MAX(CASE WHEN cal.trimestre = 3 THEN cal.nota END) as t3,
        MAX(CASE WHEN cal.trimestre = 1 THEN cal.observacion END) as obs1,
        MAX(CASE WHEN cal.trimestre = 2 THEN cal.observacion END) as obs2,
        MAX(CASE WHEN cal.trimestre = 3 THEN cal.observacion END) as obs3
      FROM curso_materia cm
      JOIN materias m ON m.id_materia = cm.id_materia
      LEFT JOIN calificaciones cal ON cal.id_materia = m.id_materia AND cal.id_alumno = $1
      WHERE cm.id_curso = $2
      GROUP BY m.id_materia, m.codigo, m.nombre, m.carga_horaria
      ORDER BY m.nombre;
    `;

    const calRes = await db.query(query, [idAlumnoReal, alumno.id_curso]);

    const boletin = calRes.rows.map(r => {
      const n1 = r.t1 !== null ? parseFloat(r.t1) : null;
      const n2 = r.t2 !== null ? parseFloat(r.t2) : null;
      const n3 = r.t3 !== null ? parseFloat(r.t3) : null;

      const notasValidas = [n1, n2, n3].filter(n => n !== null);
      let promedio = null;
      let estado = 'Cursando';

      if (notasValidas.length > 0) {
        promedio = +(notasValidas.reduce((acc, curr) => acc + curr, 0) / notasValidas.length).toFixed(2);
        if (promedio >= 7.00) {
          estado = 'Promocionado';
        } else if (promedio >= 4.00) {
          estado = 'Regular';
        } else {
          estado = 'En Riesgo';
        }
      }

      return {
        id_materia: r.id_materia,
        codigo: r.codigo,
        materia: r.materia,
        carga_horaria: r.carga_horaria,
        trimestre_1: n1,
        trimestre_2: n2,
        trimestre_3: n3,
        promedio,
        estado,
        observaciones: [r.obs1, r.obs2, r.obs3].filter(Boolean)
      };
    });

    ok(res, {
      alumno: {
        id_alumno: alumno.id_alumno,
        nombre: alumno.nombre,
        apellido: alumno.apellido,
        legajo: alumno.legajo,
        curso: alumno.curso,
        nivel: alumno.nivel,
        ciclo: alumno.ciclo
      },
      boletin
    });

  } catch (error) {
    console.error('[API /alumnos/:id/calificaciones] Error:', error);
    fail(res, 'Error al obtener calificaciones del alumno', 500);
  }
});

/**
 * POST /api/calificaciones
 * Permite a docentes y administradores registrar o actualizar una nota en PostgreSQL.
 */
app.post('/api/calificaciones', async (req, res) => {
  const { id_alumno, id_materia, trimestre, nota, observacion } = req.body;

  if (!id_alumno || !id_materia || !trimestre || nota === undefined) {
    return fail(res, 'Faltan campos obligatorios: id_alumno, id_materia, trimestre y nota', 400);
  }

  const trimNum = parseInt(trimestre, 10);
  const notaNum = parseFloat(nota);

  if (isNaN(trimNum) || trimNum < 1 || trimNum > 3) {
    return fail(res, 'El trimestre debe ser 1, 2 o 3', 400);
  }

  if (isNaN(notaNum) || notaNum < 1 || notaNum > 10) {
    return fail(res, 'La nota debe estar entre 1 y 10', 400);
  }

  try {
    // VALIDACIÓN: Verificar que el alumno realmente cursa esta materia en su plan de estudios institucional
    const checkPlan = await db.query(`
      SELECT m.nombre as materia_nombre, c.nombre as curso_nombre
      FROM curso_materia cm
      JOIN alumnos a ON a.id_curso = cm.id_curso
      JOIN materias m ON m.id_materia = cm.id_materia
      JOIN cursos c ON c.id_curso = a.id_curso
      WHERE a.id_alumno = $1 AND cm.id_materia = $2
    `, [id_alumno, id_materia]);

    if (checkPlan.rows.length === 0) {
      const alInfo = await db.query('SELECT a.nombre, a.apellido, c.nombre as curso FROM alumnos a LEFT JOIN cursos c ON c.id_curso = a.id_curso WHERE a.id_alumno = $1', [id_alumno]);
      const matInfo = await db.query('SELECT nombre FROM materias WHERE id_materia = $1', [id_materia]);
      const nomAl = alInfo.rows[0] ? `${alInfo.rows[0].nombre} ${alInfo.rows[0].apellido} (${alInfo.rows[0].curso || 'Sin curso'})` : 'El estudiante';
      const nomMat = matInfo.rows[0] ? matInfo.rows[0].nombre : 'la materia';

      return fail(res, `No se puede calificar: ${nomAl} no cursa la materia '${nomMat}' en su plan de estudios.`, 400);
    }

    const result = await db.query(`
      INSERT INTO calificaciones (id_alumno, id_materia, trimestre, nota, observacion)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id_alumno, id_materia, trimestre)
      DO UPDATE SET
        nota = EXCLUDED.nota,
        observacion = EXCLUDED.observacion,
        fecha = CURRENT_TIMESTAMP
      RETURNING *;
    `, [id_alumno, id_materia, trimNum, notaNum, observacion || null]);

    ok(res, {
      mensaje: 'Calificación guardada exitosamente en PostgreSQL',
      calificacion: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('[API POST /calificaciones] Error:', error);
    fail(res, error.message || 'Error al guardar calificación', 500);
  }
});

/**
 * GET /api/calificaciones/planilla
 * Obtiene la lista completa de alumnos de un curso con sus notas en una materia específica.
 * Query params: id_curso, id_materia
 */
app.get('/api/calificaciones/planilla', async (req, res) => {
  const { id_curso, id_materia } = req.query;

  if (!id_curso || !id_materia) {
    return fail(res, 'Faltan parámetros obligatorios: id_curso e id_materia', 400);
  }

  const cId = parseInt(id_curso, 10);
  const mId = parseInt(id_materia, 10);

  if (isNaN(cId) || isNaN(mId)) {
    return fail(res, 'id_curso e id_materia deben ser números enteros', 400);
  }

  try {
    // 1. Obtener datos del curso y materia
    const [cRes, mRes] = await Promise.all([
      db.query('SELECT id_curso, nombre, anio_escolar, division FROM cursos WHERE id_curso = $1', [cId]),
      db.query('SELECT id_materia, codigo, nombre, carga_horaria FROM materias WHERE id_materia = $1', [mId])
    ]);

    if (cRes.rows.length === 0) return fail(res, 'Curso no encontrado', 404);
    if (mRes.rows.length === 0) return fail(res, 'Materia no encontrada', 404);

    const curso = cRes.rows[0];
    const materia = mRes.rows[0];

    // 2. Obtener alumnos del curso con sus calificaciones en esta materia
    const query = `
      SELECT 
        a.id_alumno,
        a.legajo,
        a.dni,
        a.nombre,
        a.apellido,
        u.edad,
        u.genero,
        MAX(CASE WHEN cal.trimestre = 1 THEN cal.nota END) as t1,
        MAX(CASE WHEN cal.trimestre = 2 THEN cal.nota END) as t2,
        MAX(CASE WHEN cal.trimestre = 3 THEN cal.nota END) as t3,
        MAX(CASE WHEN cal.trimestre = 1 THEN cal.observacion END) as obs1,
        MAX(CASE WHEN cal.trimestre = 2 THEN cal.observacion END) as obs2,
        MAX(CASE WHEN cal.trimestre = 3 THEN cal.observacion END) as obs3
      FROM alumnos a
      LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario
      JOIN curso_materia cm ON cm.id_curso = a.id_curso AND cm.id_materia = $2
      LEFT JOIN calificaciones cal ON cal.id_alumno = a.id_alumno AND cal.id_materia = $2
      WHERE a.id_curso = $1
      GROUP BY a.id_alumno, a.legajo, a.dni, a.nombre, a.apellido, u.edad, u.genero
      ORDER BY a.apellido, a.nombre;
    `;

    const result = await db.query(query, [cId, mId]);

    const alumnos = result.rows.map(r => {
      const n1 = r.t1 !== null ? parseFloat(r.t1) : null;
      const n2 = r.t2 !== null ? parseFloat(r.t2) : null;
      const n3 = r.t3 !== null ? parseFloat(r.t3) : null;
      const notasValidas = [n1, n2, n3].filter(n => n !== null);

      let promedio = null;
      let estado = 'Cursando';

      if (notasValidas.length > 0) {
        promedio = +(notasValidas.reduce((acc, curr) => acc + curr, 0) / notasValidas.length).toFixed(2);
        if (promedio >= 7.00) {
          estado = 'Promocionado';
        } else if (promedio >= 4.00) {
          estado = 'Regular';
        } else {
          estado = 'En Riesgo';
        }
      }

      return {
        id_alumno: r.id_alumno,
        legajo: r.legajo,
        dni: r.dni,
        nombre: r.nombre,
        apellido: r.apellido,
        edad: r.edad,
        genero: r.genero,
        trimestre_1: n1,
        trimestre_2: n2,
        trimestre_3: n3,
        observacion_1: r.obs1,
        observacion_2: r.obs2,
        observacion_3: r.obs3,
        promedio,
        estado
      };
    });

    ok(res, {
      curso,
      materia,
      totalAlumnos: alumnos.length,
      alumnos
    });
  } catch (error) {
    console.error('[API /calificaciones/planilla] Error:', error);
    fail(res, 'Error al obtener planilla de calificaciones', 500);
  }
});

/**
 * POST /api/calificaciones/lote
 * Permite guardar o actualizar múltiples calificaciones en una sola transacción atómica.
 */
app.post('/api/calificaciones/lote', async (req, res) => {
  const { calificaciones } = req.body;

  if (!Array.isArray(calificaciones) || calificaciones.length === 0) {
    return fail(res, 'El cuerpo debe incluir un arreglo "calificaciones" no vacío', 400);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const resultados = [];
    for (const item of calificaciones) {
      const { id_alumno, id_materia, trimestre, nota, observacion } = item;

      if (!id_alumno || !id_materia || !trimestre || nota === undefined) {
        throw new Error('Cada registro de calificación debe incluir id_alumno, id_materia, trimestre y nota');
      }

      const trimNum = parseInt(trimestre, 10);
      const notaNum = parseFloat(nota);

      if (isNaN(trimNum) || trimNum < 1 || trimNum > 3) {
        throw new Error(`Trimestre inválido (${trimestre}) para alumno ${id_alumno}`);
      }
      if (isNaN(notaNum) || notaNum < 1 || notaNum > 10) {
        throw new Error(`Nota inválida (${nota}) para alumno ${id_alumno}. Debe estar entre 1 y 10.`);
      }

      const upsertQuery = `
        INSERT INTO calificaciones (id_alumno, id_materia, trimestre, nota, observacion)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id_alumno, id_materia, trimestre)
        DO UPDATE SET
          nota = EXCLUDED.nota,
          observacion = EXCLUDED.observacion,
          fecha = CURRENT_TIMESTAMP
        RETURNING *;
      `;

      const r = await client.query(upsertQuery, [
        id_alumno,
        id_materia,
        trimNum,
        notaNum,
        observacion || null
      ]);
      resultados.push(r.rows[0]);
    }

    await client.query('COMMIT');

    ok(res, {
      mensaje: `Se guardaron ${resultados.length} calificaciones exitosamente en PostgreSQL`,
      guardadas: resultados.length,
      calificaciones: resultados
    }, 201);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[API /calificaciones/lote] Error:', error);
    fail(res, error.message || 'Error al guardar calificaciones en lote', 400);
  } finally {
    client.release();
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
  let id = req.params.id;
  if (id === 'tomas') id = 1;
  if (id === 'sofia') id = 2;
  id = parseInt(id, 10);
  if (isNaN(id)) return fail(res, 'ID de alumno inválido', 400);

  try {
    const result = await db.query(`
      SELECT d.*, i.id_inscripcion, i.fecha_inscripcion
      FROM inscripciones_deporte i
      JOIN deportes d ON d.id_deporte = i.id_deporte
      WHERE i.id_alumno = $1
    `, [id]);
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
  let { id_alumno, id_deporte } = req.body;
  if (!id_alumno || !id_deporte) return fail(res, 'Faltan id_alumno e id_deporte');

  if (id_alumno === 'tomas') id_alumno = 1;
  if (id_alumno === 'sofia') id_alumno = 2;
  id_alumno = parseInt(id_alumno, 10);
  id_deporte = parseInt(id_deporte, 10);

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
    if (actuales.rows.some(d => d.id_deporte === id_deporte)) {
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
  let { id_alumno, id_deporte } = req.body;
  if (id_alumno === 'tomas') id_alumno = 1;
  if (id_alumno === 'sofia') id_alumno = 2;
  id_alumno = parseInt(id_alumno, 10);
  id_deporte = parseInt(id_deporte, 10);

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
  let { id_alumno, recorrido_numero, zona, parada } = req.body;
  if (!id_alumno || !recorrido_numero || !zona || !parada) {
    return fail(res, 'Faltan campos obligatorios para transporte');
  }

  // Normalizar id_alumno si viene alias
  if (id_alumno === 'tomas') id_alumno = 1;
  if (id_alumno === 'sofia') id_alumno = 2;
  id_alumno = parseInt(id_alumno, 10);
  recorrido_numero = parseInt(recorrido_numero, 10);

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
      mensaje: `Transporte asignado: Zona ${zona} (Recorrido ${recorrido_numero})`,
      transporte: result.rows[0]
    });
  } catch (error) {
    console.error('[API /transporte/asignar] Error:', error);
    fail(res, 'Error al asignar transporte escolar', 500);
  }
});

/**
 * GET /api/alumnos/:id/transporte
 */
app.get('/api/alumnos/:id/transporte', async (req, res) => {
  let id = req.params.id;
  if (id === 'tomas') id = 1;
  if (id === 'sofia') id = 2;
  id = parseInt(id, 10);
  if (isNaN(id)) return fail(res, 'ID de alumno inválido', 400);

  try {
    const result = await db.query(
      'SELECT * FROM inscripciones_transporte WHERE id_alumno = $1',
      [id]
    );
    ok(res, result.rows[0] || null);
  } catch (error) {
    console.error('[API /alumnos/:id/transporte] Error:', error);
    fail(res, 'Error al obtener transporte del alumno', 500);
  }
});

/**
 * DELETE /api/transporte/:id_alumno
 */
app.delete('/api/transporte/:id_alumno', async (req, res) => {
  let id = req.params.id_alumno;
  if (id === 'tomas') id = 1;
  if (id === 'sofia') id = 2;
  id = parseInt(id, 10);
  if (isNaN(id)) return fail(res, 'ID de alumno inválido', 400);

  try {
    await db.query('DELETE FROM inscripciones_transporte WHERE id_alumno = $1', [id]);
    ok(res, { mensaje: 'Servicio de transporte dado de baja correctamente' });
  } catch (error) {
    console.error('[API DELETE /transporte] Error:', error);
    fail(res, 'Error al cancelar transporte', 500);
  }
});

// ─── 7. PREINSCRIPCIONES (WEB PÚBLICA 2027) ─────────────────────────────────

/**
 * POST /api/preinscripciones
 * Registra una solicitud de preinscripción desde el formulario público web.
 */
app.post('/api/preinscripciones', async (req, res) => {
  const b = req.body || {};
  const nombreAlumno = (b.nombreAlumno || b.nombre_alumno || `${b.nombre || ''} ${b.apellido || ''}`).trim();
  const nivelIngresa = b.nivelIngresa || b.nivel || 'Primario';
  const edadAlumno = b.edadAlumno || b.edad_alumno || null;
  const dniAlumno = b.dniAlumno || b.dni_alumno || b.dni || '';
  const tipoSangre = b.tipoSangre || b.tipo_sangre || null;
  const domicilioAlumno = b.domicilioAlumno || b.domicilio_alumno || null;
  const telefonoEmergencia = b.telefonoEmergencia || b.telefono_emergencia || null;

  const nombreTutor = (b.nombreTutor || b.nombre_tutor || '').trim();
  const vinculo = b.vinculo || 'Tutor Legal';
  const edadTutor = b.edadTutor || b.edad_tutor || null;
  const dniTutor = b.dniTutor || b.dni_tutor || 'S/D';
  const domicilioTutor = b.domicilioTutor || b.domicilio_tutor || null;
  const telefonoTutor = b.telefonoTutor || b.telefono_tutor || b.telefono || 'S/T';

  if (!nombreAlumno || !dniAlumno || !nombreTutor) {
    return fail(res, 'Faltan datos obligatorios para la preinscripción (Nombre del alumno, DNI y Tutor responsable)', 400);
  }

  const codigo = `PRE-2027-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    const result = await db.query(`
      INSERT INTO preinscripciones (
        codigo_tramite, nombre_alumno, nivel, edad_alumno, dni_alumno, tipo_sangre,
        domicilio_alumno, telefono_emergencia,
        nombre_tutor, vinculo, edad_tutor, dni_tutor, domicilio_tutor, telefono_tutor, estado
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Pendiente')
      RETURNING *;
    `, [
      codigo, nombreAlumno, nivelIngresa,
      parseInt(edadAlumno, 10) || null, dniAlumno, tipoSangre || null,
      domicilioAlumno || null, telefonoEmergencia || null,
      nombreTutor, vinculo, parseInt(edadTutor, 10) || null,
      dniTutor, domicilioTutor || null, telefonoTutor
    ]);

    ok(res, {
      mensaje: '¡Preinscripción enviada con éxito! Nos comunicaremos a la brevedad para coordinar la visita presencial.',
      codigo_tramite: codigo,
      preinscripcion: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('[API POST /preinscripciones] Error:', error);
    fail(res, error.message || 'Error al registrar preinscripción en la base de datos', 500);
  }
});

/**
 * GET /api/preinscripciones
 * Lista todas las solicitudes de preinscripción para administración.
 */
app.get('/api/preinscripciones', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM preinscripciones ORDER BY fecha_registro DESC');
    ok(res, result.rows);
  } catch (error) {
    console.error('[API GET /preinscripciones] Error:', error);
    fail(res, 'Error al listar preinscripciones', 500);
  }
});

// ─── 11. NOTICIAS Y NOVEDADES INSTITUCIONALES ───────────────────────────────

/**
 * GET /api/noticias
 * Lista todas las noticias activas ordenadas por fecha descendente.
 * Admite filtro opcional por categoría (?categoria=Deportes).
 */
app.get('/api/noticias', async (req, res) => {
  try {
    const { categoria } = req.query;
    let query = "SELECT id_noticia, titulo, categoria, TO_CHAR(fecha, 'YYYY-MM-DD') as fecha, imagen_url, descripcion, cuerpo, activo, creado_en FROM noticias WHERE activo = TRUE";
    const params = [];
    if (categoria && categoria !== 'todas') {
      params.push(categoria);
      query += ` AND LOWER(categoria) = LOWER($${params.length})`;
    }
    query += ' ORDER BY fecha DESC, id_noticia DESC';
    const result = await db.query(query, params);
    ok(res, result.rows);
  } catch (error) {
    console.error('[API GET /noticias] Error:', error);
    fail(res, 'Error al obtener noticias de la base de datos', 500);
  }
});

/**
 * POST /api/noticias
 * Publica una nueva noticia institucional en PostgreSQL.
 * Guarda únicamente la ruta o URL de la imagen.
 */
app.post('/api/noticias', async (req, res) => {
  try {
    const { titulo, categoria, fecha, imagen_url, descripcion, cuerpo } = req.body;
    if (!titulo || !descripcion) {
      return fail(res, 'El título y la descripción son obligatorios', 400);
    }

    const cat = categoria || 'Institucional';
    const fec = fecha || new Date().toISOString().split('T')[0];
    const img = imagen_url || '../img/portada1.jpg';
    const crp = cuerpo || `<p>${descripcion}</p>`;

    const query = `
      INSERT INTO noticias (titulo, categoria, fecha, imagen_url, descripcion, cuerpo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id_noticia, titulo, categoria, TO_CHAR(fecha, 'YYYY-MM-DD') as fecha, imagen_url, descripcion, cuerpo, activo, creado_en
    `;
    const result = await db.query(query, [titulo.trim(), cat, fec, img.trim(), descripcion.trim(), crp.trim()]);
    ok(res, {
      mensaje: '¡Noticia publicada con éxito en la base de datos!',
      noticia: result.rows[0]
    }, 201);
  } catch (error) {
    console.error('[API POST /noticias] Error:', error);
    fail(res, 'Error al guardar la noticia en la base de datos: ' + error.message, 500);
  }
});

/**
 * DELETE /api/noticias/:id
 * Elimina una noticia por su id_noticia.
 */
app.delete('/api/noticias/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 'ID de noticia inválido', 400);

    const result = await db.query('DELETE FROM noticias WHERE id_noticia = $1 RETURNING id_noticia', [id]);
    if (result.rowCount === 0) {
      return fail(res, 'Noticia no encontrada', 404);
    }
    ok(res, { mensaje: 'Noticia eliminada correctamente de la base de datos' });
  } catch (error) {
    console.error('[API DELETE /noticias/:id] Error:', error);
    fail(res, 'Error al eliminar noticia: ' + error.message, 500);
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
  console.log('  GET    /api/niveles');
  console.log('  GET    /api/ciclos');
  console.log('  GET    /api/cursos');
  console.log('  GET    /api/cursos/:id/materias');
  console.log('  GET    /api/cursos/:id/alumnos');
  console.log('  GET    /api/cursos/:id/docentes');
  console.log('  GET    /api/docentes');
  console.log('  GET    /api/materias');
  console.log('  POST   /api/asignaciones');
  console.log('  DELETE /api/asignaciones/:id_materia');
  console.log('  GET    /api/deportes');
  console.log('  POST   /api/deportes/inscribir');
  console.log('  POST   /api/transporte/asignar\n');
});