const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000 || 5500;

// Configuración robusta de CORS
app.use(cors({
    origin: '*', // Permite peticiones desde cualquier lugar
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('../'));

// ─── DATOS DE EJEMPLO EN MEMORIA ────────────────────────────────────────────

let alumnos = [
  { id: 1, legajo: "A001", nombre: "Lucas", apellido: "Fernández", email: "lucas.fernandez@mail.com", estado: "activo" },
  { id: 2, legajo: "A002", nombre: "Camila", apellido: "Romero",    email: "camila.romero@mail.com",    estado: "activo" },
  { id: 3, legajo: "A003", nombre: "Mateo",  apellido: "García",    email: "mateo.garcia@mail.com",     estado: "inactivo" },
];

let docentes = [
  { id: 1, legajo: "D001", nombre: "Ana",    apellido: "López",    email: "ana.lopez@mail.com",    materiasACargo: [1, 2], estado: "activo" },
  { id: 2, legajo: "D002", nombre: "Carlos", apellido: "Martínez", email: "carlos.martinez@mail.com", materiasACargo: [3],    estado: "activo" },
];

let materias = [
  { id: 1, codigo: "M001", nombre: "Programación I",   cargaHoraria: 80, cicloLectivo: 2025, docenteId: 1 },
  { id: 2, codigo: "M002", nombre: "Base de Datos I",  cargaHoraria: 64, cicloLectivo: 2025, docenteId: 1 },
  { id: 3, codigo: "M003", nombre: "Programación III", cargaHoraria: 96, cicloLectivo: 2025, docenteId: 2 },
];

let inscripciones = [
  { id: 1, alumnoId: 1, materiaId: 1, cicloLectivo: 2025, estado: "cursando" },
  { id: 2, alumnoId: 1, materiaId: 2, cicloLectivo: 2025, estado: "cursando" },
  { id: 3, alumnoId: 2, materiaId: 3, cicloLectivo: 2025, estado: "cursando" },
];

// Helpers de IDs autoincrementales
const nextId = (arr) => (arr.length === 0 ? 1 : Math.max(...arr.map((x) => x.id)) + 1);

// ─── HELPER RESPUESTA ───────────────────────────────────────────────────────

const ok   = (res, data, status = 200) => res.status(status).json({ ok: true,  data });
const fail = (res, msg,  status = 400) => res.status(status).json({ ok: false, error: msg });

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

app.get("/api/dashboard", (req, res) => {
  const cicloActual = 2025;
  ok(res, {
    alumnosActivos:         alumnos.filter((a) => a.estado === "activo").length,
    docentesRegistrados:    docentes.length,
    materiasDisponibles:    materias.length,
    inscripcionesPeriodo:   inscripciones.filter((i) => i.cicloLectivo === cicloActual).length,
  });
});

// ─── ALUMNOS ────────────────────────────────────────────────────────────────

// GET /api/alumnos?nombre=&estado=
app.get("/api/alumnos", (req, res) => {
  let resultado = [...alumnos];
  if (req.query.nombre) {
    const q = req.query.nombre.toLowerCase();
    resultado = resultado.filter(
      (a) => a.nombre.toLowerCase().includes(q) || a.apellido.toLowerCase().includes(q)
    );
  }
  if (req.query.estado) {
    resultado = resultado.filter((a) => a.estado === req.query.estado);
  }
  ok(res, resultado);
});

// GET /api/alumnos/:id
app.get("/api/alumnos/:id", (req, res) => {
  const alumno = alumnos.find((a) => a.id === Number(req.params.id));
  if (!alumno) return fail(res, "Alumno no encontrado", 404);
  ok(res, alumno);
});

// POST /api/alumnos
app.post("/api/alumnos", (req, res) => {
  const { legajo, nombre, apellido, email, estado = "activo" } = req.body;
  if (!legajo || !nombre || !apellido || !email)
    return fail(res, "Faltan campos obligatorios: legajo, nombre, apellido, email");
  if (alumnos.find((a) => a.legajo === legajo))
    return fail(res, "Ya existe un alumno con ese legajo");
  const nuevo = { id: nextId(alumnos), legajo, nombre, apellido, email, estado };
  alumnos.push(nuevo);
  ok(res, nuevo, 201);
});

// PUT /api/alumnos/:id
app.put("/api/alumnos/:id", (req, res) => {
  const idx = alumnos.findIndex((a) => a.id === Number(req.params.id));
  if (idx === -1) return fail(res, "Alumno no encontrado", 404);
  alumnos[idx] = { ...alumnos[idx], ...req.body, id: alumnos[idx].id };
  ok(res, alumnos[idx]);
});

// DELETE /api/alumnos/:id
app.delete("/api/alumnos/:id", (req, res) => {
  const idx = alumnos.findIndex((a) => a.id === Number(req.params.id));
  if (idx === -1) return fail(res, "Alumno no encontrado", 404);
  const eliminado = alumnos.splice(idx, 1)[0];
  ok(res, { mensaje: "Alumno eliminado", alumno: eliminado });
});

// ─── DOCENTES ───────────────────────────────────────────────────────────────

app.get("/api/docentes", (req, res) => {
  let resultado = [...docentes];
  if (req.query.nombre) {
    const q = req.query.nombre.toLowerCase();
    resultado = resultado.filter(
      (d) => d.nombre.toLowerCase().includes(q) || d.apellido.toLowerCase().includes(q)
    );
  }
  if (req.query.estado) {
    resultado = resultado.filter((d) => d.estado === req.query.estado);
  }
  ok(res, resultado);
});

app.get("/api/docentes/:id", (req, res) => {
  const docente = docentes.find((d) => d.id === Number(req.params.id));
  if (!docente) return fail(res, "Docente no encontrado", 404);
  ok(res, docente);
});

app.post("/api/docentes", (req, res) => {
  const { legajo, nombre, apellido, email, materiasACargo = [], estado = "activo" } = req.body;
  if (!legajo || !nombre || !apellido || !email)
    return fail(res, "Faltan campos obligatorios: legajo, nombre, apellido, email");
  if (docentes.find((d) => d.legajo === legajo))
    return fail(res, "Ya existe un docente con ese legajo");
  const nuevo = { id: nextId(docentes), legajo, nombre, apellido, email, materiasACargo, estado };
  docentes.push(nuevo);
  ok(res, nuevo, 201);
});

app.put("/api/docentes/:id", (req, res) => {
  const idx = docentes.findIndex((d) => d.id === Number(req.params.id));
  if (idx === -1) return fail(res, "Docente no encontrado", 404);
  docentes[idx] = { ...docentes[idx], ...req.body, id: docentes[idx].id };
  ok(res, docentes[idx]);
});

app.delete("/api/docentes/:id", (req, res) => {
  const idx = docentes.findIndex((d) => d.id === Number(req.params.id));
  if (idx === -1) return fail(res, "Docente no encontrado", 404);
  const eliminado = docentes.splice(idx, 1)[0];
  ok(res, { mensaje: "Docente eliminado", docente: eliminado });
});

// ─── MATERIAS ───────────────────────────────────────────────────────────────

app.get("/api/materias", (req, res) => {
  let resultado = [...materias];
  if (req.query.nombre) {
    const q = req.query.nombre.toLowerCase();
    resultado = resultado.filter((m) => m.nombre.toLowerCase().includes(q));
  }
  if (req.query.cicloLectivo) {
    resultado = resultado.filter((m) => m.cicloLectivo === Number(req.query.cicloLectivo));
  }
  ok(res, resultado);
});

app.get("/api/materias/:id", (req, res) => {
  const materia = materias.find((m) => m.id === Number(req.params.id));
  if (!materia) return fail(res, "Materia no encontrada", 404);
  ok(res, materia);
});

app.post("/api/materias", (req, res) => {
  const { codigo, nombre, cargaHoraria, cicloLectivo, docenteId } = req.body;
  if (!codigo || !nombre || !cargaHoraria || !cicloLectivo)
    return fail(res, "Faltan campos obligatorios: codigo, nombre, cargaHoraria, cicloLectivo");
  if (materias.find((m) => m.codigo === codigo))
    return fail(res, "Ya existe una materia con ese código");
  const nuevo = { id: nextId(materias), codigo, nombre, cargaHoraria, cicloLectivo, docenteId: docenteId || null };
  materias.push(nuevo);
  ok(res, nuevo, 201);
});

app.put("/api/materias/:id", (req, res) => {
  const idx = materias.findIndex((m) => m.id === Number(req.params.id));
  if (idx === -1) return fail(res, "Materia no encontrada", 404);
  materias[idx] = { ...materias[idx], ...req.body, id: materias[idx].id };
  ok(res, materias[idx]);
});

app.delete("/api/materias/:id", (req, res) => {
  const idx = materias.findIndex((m) => m.id === Number(req.params.id));
  if (idx === -1) return fail(res, "Materia no encontrada", 404);
  const eliminada = materias.splice(idx, 1)[0];
  ok(res, { mensaje: "Materia eliminada", materia: eliminada });
});

// ─── INSCRIPCIONES ──────────────────────────────────────────────────────────

app.get("/api/inscripciones", (req, res) => {
  let resultado = [...inscripciones];
  if (req.query.alumnoId)
    resultado = resultado.filter((i) => i.alumnoId === Number(req.query.alumnoId));
  if (req.query.materiaId)
    resultado = resultado.filter((i) => i.materiaId === Number(req.query.materiaId));
  if (req.query.cicloLectivo)
    resultado = resultado.filter((i) => i.cicloLectivo === Number(req.query.cicloLectivo));
  ok(res, resultado);
});

app.get("/api/inscripciones/:id", (req, res) => {
  const ins = inscripciones.find((i) => i.id === Number(req.params.id));
  if (!ins) return fail(res, "Inscripción no encontrada", 404);
  ok(res, ins);
});

app.post("/api/inscripciones", (req, res) => {
  const { alumnoId, materiaId, cicloLectivo, estado = "cursando" } = req.body;
  if (!alumnoId || !materiaId || !cicloLectivo)
    return fail(res, "Faltan campos obligatorios: alumnoId, materiaId, cicloLectivo");
  if (!alumnos.find((a) => a.id === alumnoId))
    return fail(res, "Alumno no encontrado");
  if (!materias.find((m) => m.id === materiaId))
    return fail(res, "Materia no encontrada");
  const yaInscripto = inscripciones.find(
    (i) => i.alumnoId === alumnoId && i.materiaId === materiaId && i.cicloLectivo === cicloLectivo
  );
  if (yaInscripto) return fail(res, "El alumno ya está inscripto en esa materia para ese ciclo lectivo");
  const nueva = { id: nextId(inscripciones), alumnoId, materiaId, cicloLectivo, estado };
  inscripciones.push(nueva);
  ok(res, nueva, 201);
});

app.delete("/api/inscripciones/:id", (req, res) => {
  const idx = inscripciones.findIndex((i) => i.id === Number(req.params.id));
  if (idx === -1) return fail(res, "Inscripción no encontrada", 404);
  const eliminada = inscripciones.splice(idx, 1)[0];
  ok(res, { mensaje: "Inscripción eliminada", inscripcion: eliminada });
});

const sesionesActivas = new Set();

// usuarios de prueba (después reemplazás con DB)
const usuarios = [
  { id: 1, dni: "12345678", password: "1234", rol: "alumno", nivel: "primaria", nombre: "Lucas" },
  { id: 2, dni: "87654321", password: "1234", rol: "docente", nivel: "secundaria", nombre: "Ana" },
  { id: 3, dni: "11111111", password: "1234", rol: "familia",  nombre: "Jose" }
];

app.post("/api/auth/login", (req, res) => {
  const { dni, password, rol, nivel } = req.body;

  const usuario = usuarios.find((u) => {
    if (u.dni !== dni || u.password !== password || u.rol !== rol) return false;
    if (rol === "familia") return true; // tutores no tienen nivel
    return u.nivel === nivel;
  });

  if (!usuario) return fail(res, "Credenciales inválidas", 401);

  if (sesionesActivas.has(dni)) {
    return fail(res, "Este usuario ya tiene una sesión activa", 409);
  }

  sesionesActivas.add(dni);
  ok(res, { usuario, mensaje: "Login exitoso" });
});

app.post("/api/auth/logout", (req, res) => {
  const { dni } = req.body;
  if (!dni) return fail(res, "Falta el DNI");
  sesionesActivas.delete(dni);
  ok(res, { mensaje: "Sesión cerrada correctamente" });
});

// ─── 404 CATCH-ALL ──────────────────────────────────────────────────────────

app.use((req, res) => fail(res, `Ruta no encontrada: ${req.method} ${req.path}`, 404));







// ─── INICIO ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n NovaSYS API corriendo en http://localhost:${PORT}`);
  console.log("\nEndpoints disponibles:");
  console.log("  GET    /api/dashboard");
  console.log("  GET|POST              /api/alumnos");
  console.log("  GET|PUT|DELETE        /api/alumnos/:id");
  console.log("  GET|POST              /api/docentes");
  console.log("  GET|PUT|DELETE        /api/docentes/:id");
  console.log("  GET|POST              /api/materias");
  console.log("  GET|PUT|DELETE        /api/materias/:id");
  console.log("  GET|POST              /api/inscripciones");
  console.log("  GET|DELETE            /api/inscripciones/:id\n");
});