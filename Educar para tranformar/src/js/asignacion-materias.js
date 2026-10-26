/**
 * =============================================================================
 * asignacion-materias.js - HU-04: Asignación de Materias y Cursos a Docentes
 * Metodología de Sistemas II - UTN TUP
 * 
 * Conexión completa a la API REST de PostgreSQL en Neon Cloud:
 * - GET    /api/docentes
 * - GET    /api/materias
 * - POST   /api/asignaciones
 * - DELETE /api/asignaciones/:id_materia
 * - POST   /api/materias
 * =============================================================================
 */

const API_BASE = 'http://localhost:3000/api';
const MAX_HORAS_DOCENTE = 200;

// Caché en memoria para acceso rápido y renderizado fluido
let _docentes = [];
let _materias = [];

/**
 * Carga o refresca docentes y materias desde la base de datos PostgreSQL
 */
export async function sincronizarConServidor() {
  try {
    const [resDocentes, resMaterias] = await Promise.all([
      fetch(`${API_BASE}/docentes`),
      fetch(`${API_BASE}/materias`)
    ]);

    if (resDocentes.ok) {
      const dataDoc = await resDocentes.json();
      if (dataDoc.ok) {
        _docentes = dataDoc.data.map(d => {
          const esp = (d.especialidad || '').toLowerCase();
          return {
            id: d.id,
            legajo: d.legajo,
            nombre: d.nombre,
            apellido: d.apellido,
            email: d.email || `${d.legajo.toLowerCase()}@novasys.edu.ar`,
            edad: d.edad || null,
            genero: d.genero || null,
            nivel: (esp.includes('inicial') || esp.includes('jard')) ? 'inicial' : (esp.includes('primar') ? 'primaria' : 'secundaria'),
            cargaHorariaTotal: d.cargaHorariaTotal || 0,
            materiasACargo: (d.materiasACargo || []).map(m => m.id_materia)
          };
        });
      }
    }

    if (resMaterias.ok) {
      const dataMat = await resMaterias.json();
      if (dataMat.ok) {
        _materias = dataMat.data.map(m => {
          const niv = (m.nivel || '').toLowerCase();
          return {
            id: m.id,
            codigo: m.codigo,
            nombre: m.nombre,
            cargaHoraria: m.cargaHoraria || 4,
            nivel: (niv.includes('ini') || niv.includes('jard')) ? 'inicial' : (niv.includes('prim') ? 'primaria' : 'secundaria'),
            cicloLectivo: 2027,
            docenteId: m.docenteId || null,
            docenteNombre: m.docenteNombre || null,
            id_asignacion: m.id_asignacion || null
          };
        });
      }
    }

    return { ok: true, docentes: _docentes, materias: _materias };
  } catch (error) {
    console.warn('[HU-04] Servidor local no disponible, utilizando caché/fallback local:', error.message);
    return { ok: false, error: error.message };
  }
}

/** Devuelve la lista de materias en memoria */
export function getMaterias() {
  return _materias;
}

/** Devuelve la lista de docentes en memoria */
export function getDocentes() {
  return _docentes;
}

/** Devuelve un docente por su ID */
export function getDocenteById(id) {
  return _docentes.find(d => Number(d.id) === Number(id));
}

/** Devuelve los IDs de materias asignadas a un docente */
export function getMateriasPorDocente(docenteId) {
  return _materias
    .filter(m => Number(m.docenteId) === Number(docenteId))
    .map(m => m.id);
}

/** Devuelve los objetos Materia completos asignados a un docente */
export function getMateriasCompletasPorDocente(docenteId) {
  return _materias.filter(m => Number(m.docenteId) === Number(docenteId));
}

/** Devuelve el ID del docente asignado a una materia (o null) */
export function getDocentePorMateria(materiaId) {
  const m = _materias.find(mat => Number(mat.id) === Number(materiaId));
  return m ? m.docenteId : null;
}

/**
 * Calcula la carga horaria acumulada y el porcentaje sobre el límite de 200h
 */
export function getCargaHorariaDocente(docenteId) {
  const materiasDocente = getMateriasCompletasPorDocente(docenteId);
  const horasUsadas = materiasDocente.reduce((acc, m) => acc + (m.cargaHoraria || 0), 0);
  const porcentaje = Math.min(100, Math.round((horasUsadas / MAX_HORAS_DOCENTE) * 100));

  return {
    horasUsadas,
    horasMax: MAX_HORAS_DOCENTE,
    horasDisponibles: Math.max(0, MAX_HORAS_DOCENTE - horasUsadas),
    porcentaje
  };
}

/** Devuelve todas las asignaciones activas */
export function getAsignaciones() {
  return _materias
    .filter(m => m.docenteId !== null)
    .map(m => ({
      id: `${m.docenteId}-${m.id}`,
      docenteId: m.docenteId,
      materiaId: m.id,
      docenteNombre: m.docenteNombre
    }));
}

/**
 * Asigna una materia a un docente en PostgreSQL mediante la API
 */
export async function asignarMateria(docenteId, materiaId) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/asignaciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        id_profesor: Number(docenteId),
        id_materia: Number(materiaId)
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, mensaje: data.error || 'No se pudo asignar la materia' };
    }

    // Refrescar datos en memoria desde PostgreSQL
    await sincronizarConServidor();
    return { ok: true, mensaje: 'Materia asignada correctamente en PostgreSQL. ✓' };

  } catch (error) {
    console.error('Error al asignar materia:', error);
    return { ok: false, mensaje: 'Error al conectar con el servidor: ' + error.message };
  }
}

/**
 * Quita la asignación de una materia en PostgreSQL
 */
export async function desasignarMateria(docenteId, materiaId) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/asignaciones/${materiaId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, mensaje: data.error || 'No se pudo desasignar la materia' };
    }

    // Refrescar datos en memoria desde PostgreSQL
    await sincronizarConServidor();
    return { ok: true, mensaje: 'Materia desasignada correctamente en PostgreSQL.' };

  } catch (error) {
    console.error('Error al desasignar materia:', error);
    return { ok: false, mensaje: 'Error al conectar con el servidor: ' + error.message };
  }
}

/**
 * Agrega una nueva materia en PostgreSQL
 */
export async function agregarMateria(datos) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/materias`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        codigo: datos.codigo,
        nombre: datos.nombre,
        cargaHoraria: Number(datos.cargaHoraria),
        nivel: datos.nivel
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, mensaje: data.error || 'Error al agregar la materia' };
    }

    await sincronizarConServidor();
    return { ok: true, mensaje: `Materia "${datos.nombre}" agregada con éxito en PostgreSQL.`, materia: data.data.materia };

  } catch (error) {
    console.error('Error al agregar materia:', error);
    return { ok: false, mensaje: 'Error al conectar con el servidor: ' + error.message };
  }
}
