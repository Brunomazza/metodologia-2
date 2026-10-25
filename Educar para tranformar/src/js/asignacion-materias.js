/**
 * ════════════════════════════════════════════════════════════════════════════
 *  asignacion-materias.js
 *  HU-04: Asignación de Materias y Cursos a Docentes
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  ARQUITECTURA HÍBRIDA:
 *  - Persiste en localStorage para funcionar sin servidor (presentación).
 *  - Cada función sigue la misma firma que usaría una llamada REST a la API,
 *    lo que facilita migrar a fetch('/api/...') en el futuro.
 *
 *  CLAVES EN localStorage:
 *    · "hu04_materias"   → Array<Materia>
 *    · "hu04_docentes"   → Array<Docente>
 *    · "hu04_asignaciones" → Array<Asignacion>
 */

// ─── REGLA DE NEGOCIO: máximo de horas asignables por docente en un ciclo ────
const MAX_HORAS_DOCENTE = 200;

// ─── CATÁLOGO INICIAL DE MATERIAS (semilla de datos) ─────────────────────────
// Se usa solo la primera vez que no hay datos guardados en localStorage.
const MATERIAS_SEMILLA = [
    { id: 'M001', codigo: 'M001', nombre: 'Programación I',       nivel: 'secundaria', cargaHoraria: 80,  cicloLectivo: 2027 },
    { id: 'M002', codigo: 'M002', nombre: 'Base de Datos I',      nivel: 'secundaria', cargaHoraria: 64,  cicloLectivo: 2027 },
    { id: 'M003', codigo: 'M003', nombre: 'Programación II',      nivel: 'secundaria', cargaHoraria: 80,  cicloLectivo: 2027 },
    { id: 'M004', codigo: 'M004', nombre: 'Matemática',           nivel: 'primaria',   cargaHoraria: 96,  cicloLectivo: 2027 },
    { id: 'M005', codigo: 'M005', nombre: 'Lengua y Literatura',  nivel: 'secundaria', cargaHoraria: 80,  cicloLectivo: 2027 },
    { id: 'M006', codigo: 'M006', nombre: 'Física',               nivel: 'secundaria', cargaHoraria: 64,  cicloLectivo: 2027 },
    { id: 'M007', codigo: 'M007', nombre: 'Inglés',               nivel: 'primaria',   cargaHoraria: 48,  cicloLectivo: 2027 },
];

// ─── CATÁLOGO INICIAL DE DOCENTES (semilla de datos) ─────────────────────────
const DOCENTES_SEMILLA = [
    { id: 'D001', legajo: 'D001', nombre: 'Ana',    apellido: 'López',     email: 'ana.lopez@novasys.edu',     nivel: 'secundaria', estado: 'activo' },
    { id: 'D002', legajo: 'D002', nombre: 'Carlos', apellido: 'Martínez',  email: 'carlos.martinez@novasys.edu', nivel: 'secundaria', estado: 'activo' },
    { id: 'D003', legajo: 'D003', nombre: 'Laura',  apellido: 'García',    email: 'laura.garcia@novasys.edu',  nivel: 'primaria',   estado: 'activo' },
    { id: 'D004', legajo: 'D004', nombre: 'Miguel', apellido: 'Torres',    email: 'miguel.torres@novasys.edu', nivel: 'secundaria', estado: 'activo' },
];

// ─── HELPERS DE PERSISTENCIA ──────────────────────────────────────────────────

/** Lee datos de localStorage con fallback al arreglo semilla. */
function leer(clave, semilla) {
    try {
        const raw = localStorage.getItem(clave);
        if (raw) return JSON.parse(raw);
        // Primera ejecución: guardar semilla y devolverla
        localStorage.setItem(clave, JSON.stringify(semilla));
        return semilla;
    } catch {
        return semilla;
    }
}

/** Persiste un arreglo en localStorage. */
function guardar(clave, datos) {
    localStorage.setItem(clave, JSON.stringify(datos));
}

// ─── ACCESO A DATOS (API-ready: se pueden reemplazar por fetch) ───────────────

/** Retorna todas las materias del ciclo lectivo activo. */
export function getMaterias() {
    return leer('hu04_materias', MATERIAS_SEMILLA);
}

/** Retorna todos los docentes activos. */
export function getDocentes() {
    return leer('hu04_docentes', DOCENTES_SEMILLA);
}

/** Retorna el docente con el id dado, o null si no existe. */
export function getDocenteById(id) {
    return getDocentes().find(d => d.id === id) || null;
}

/** Retorna todas las asignaciones vigentes. */
export function getAsignaciones() {
    return leer('hu04_asignaciones', []);
}

/**
 * Retorna las IDs de materias asignadas a un docente específico.
 * @param {string} docenteId
 * @returns {string[]}
 */
export function getMateriasPorDocente(docenteId) {
    return getAsignaciones()
        .filter(a => a.docenteId === docenteId)
        .map(a => a.materiaId);
}

/**
 * Retorna los objetos Materia completos asignados a un docente.
 * @param {string} docenteId
 * @returns {object[]}
 */
export function getMateriasCompletasPorDocente(docenteId) {
    const materias   = getMaterias();
    const asignadas  = getMateriasPorDocente(docenteId);
    return materias.filter(m => asignadas.includes(m.id));
}

/**
 * Retorna el ID del docente asignado a una materia, o null si no tiene.
 * @param {string} materiaId
 */
export function getDocentePorMateria(materiaId) {
    const asig = getAsignaciones().find(a => a.materiaId === materiaId);
    return asig ? asig.docenteId : null;
}

// ─── HU-04: ASIGNACIÓN ───────────────────────────────────────────────────────

/**
 * Asigna una materia a un docente aplicando todas las reglas de negocio.
 *
 * Reglas validadas:
 *  1. La materia no debe estar ya asignada a otro docente.
 *  2. El docente no puede tener ya esa misma materia asignada (duplicado).
 *  3. La suma de carga horaria del docente no puede superar MAX_HORAS_DOCENTE.
 *
 * @param {string} docenteId
 * @param {string} materiaId
 * @returns {{ ok: boolean, mensaje: string }}
 */
export function asignarMateria(docenteId, materiaId) {
    const materias    = getMaterias();
    const docentes    = getDocentes();
    const asignaciones = getAsignaciones();

    // Buscar entidades involucradas
    const materia = materias.find(m => m.id === materiaId);
    const docente = docentes.find(d => d.id === docenteId);

    if (!materia) return { ok: false, mensaje: 'Materia no encontrada en el catálogo.' };
    if (!docente) return { ok: false, mensaje: 'Docente no encontrado.' };

    // Regla 1: ¿La materia ya tiene un docente asignado (distinto)?
    const yaAsignada = asignaciones.find(a => a.materiaId === materiaId);
    if (yaAsignada && yaAsignada.docenteId !== docenteId) {
        const otro = docentes.find(d => d.id === yaAsignada.docenteId);
        return {
            ok: false,
            mensaje: `Esta materia ya está asignada a ${otro ? otro.nombre + ' ' + otro.apellido : 'otro docente'}.`
        };
    }

    // Regla 2: ¿El docente ya tiene esta materia?
    const duplicado = asignaciones.find(a => a.docenteId === docenteId && a.materiaId === materiaId);
    if (duplicado) return { ok: false, mensaje: 'Este docente ya tiene asignada esa materia.' };

    // Regla 3: Control de carga horaria total
    const horasActuales = getMateriasCompletasPorDocente(docenteId)
        .reduce((sum, m) => sum + m.cargaHoraria, 0);
    if (horasActuales + materia.cargaHoraria > MAX_HORAS_DOCENTE) {
        return {
            ok: false,
            mensaje: `Límite de carga horaria superado. ${docente.nombre} tiene ${horasActuales}h asignadas y el máximo es ${MAX_HORAS_DOCENTE}h.`
        };
    }

    // Todas las reglas pasaron → guardar la asignación
    const nuevaAsignacion = {
        id:          `${docenteId}-${materiaId}`,   // ID compuesto único
        docenteId,
        materiaId,
        fechaAsignacion: new Date().toISOString().split('T')[0]  // YYYY-MM-DD
    };

    asignaciones.push(nuevaAsignacion);
    guardar('hu04_asignaciones', asignaciones);

    return { ok: true, mensaje: `${materia.nombre} asignada a ${docente.nombre} ${docente.apellido} correctamente. ✓` };
}

/**
 * Quita la asignación de una materia a un docente.
 * @param {string} docenteId
 * @param {string} materiaId
 * @returns {{ ok: boolean, mensaje: string }}
 */
export function desasignarMateria(docenteId, materiaId) {
    const asignaciones  = getAsignaciones();
    const materia       = getMaterias().find(m => m.id === materiaId);

    const idx = asignaciones.findIndex(a => a.docenteId === docenteId && a.materiaId === materiaId);
    if (idx === -1) return { ok: false, mensaje: 'Esa asignación no existe.' };

    asignaciones.splice(idx, 1);
    guardar('hu04_asignaciones', asignaciones);

    return { ok: true, mensaje: `${materia?.nombre || materiaId} desasignada correctamente.` };
}

/**
 * Agrega una nueva materia al catálogo.
 * @param {{ codigo, nombre, nivel, cargaHoraria, cicloLectivo }} datos
 * @returns {{ ok: boolean, mensaje: string, materia?: object }}
 */
export function agregarMateria(datos) {
    const { codigo, nombre, nivel, cargaHoraria, cicloLectivo } = datos;

    // Validar campos obligatorios
    if (!codigo || !nombre || !nivel || !cargaHoraria || !cicloLectivo) {
        return { ok: false, mensaje: 'Faltan campos obligatorios: código, nombre, nivel, carga horaria y ciclo lectivo.' };
    }

    const materias = getMaterias();

    // No puede haber dos materias con el mismo código
    if (materias.find(m => m.codigo.toLowerCase() === codigo.toLowerCase())) {
        return { ok: false, mensaje: `Ya existe una materia con el código "${codigo}".` };
    }

    const nueva = {
        id: codigo.toUpperCase(),
        codigo: codigo.toUpperCase(),
        nombre,
        nivel,
        cargaHoraria: Number(cargaHoraria),
        cicloLectivo:  Number(cicloLectivo)
    };

    materias.push(nueva);
    guardar('hu04_materias', materias);
    return { ok: true, mensaje: `Materia "${nombre}" creada correctamente.`, materia: nueva };
}

/**
 * Calcula las horas totales asignadas a un docente.
 * Útil para mostrar la barra de progreso de carga horaria.
 * @param {string} docenteId
 * @returns {{ horasUsadas: number, horasMax: number, porcentaje: number }}
 */
export function getCargaHorariaDocente(docenteId) {
    const horasUsadas = getMateriasCompletasPorDocente(docenteId)
        .reduce((sum, m) => sum + m.cargaHoraria, 0);
    return {
        horasUsadas,
        horasMax:    MAX_HORAS_DOCENTE,
        porcentaje:  Math.round((horasUsadas / MAX_HORAS_DOCENTE) * 100)
    };
}
