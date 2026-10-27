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

const API_BASE = 'https://metodologia-2.onrender.com/api';
const MAX_HORAS_DOCENTE = 200;

// Caché en memoria para acceso rápido y renderizado fluido
let _docentes = [];
let _materias = [];
let _asignaciones = [];

/**
 * Carga o refresca docentes, materias y asignaciones desde la base de datos PostgreSQL
 */
export async function sincronizarConServidor() {
  try {
    const [resDocentes, resMaterias, resAsig] = await Promise.all([
      fetch(`${API_BASE}/docentes`),
      fetch(`${API_BASE}/materias`),
      fetch(`${API_BASE}/asignaciones`)
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
            id_nivel: m.id_nivel || (niv.includes('ini') ? 1 : niv.includes('prim') ? 2 : 3),
            id_curso: m.id_curso || null,
            cursoNombre: m.cursoNombre || null,
            cicloLectivo: 2027,
            docenteId: m.docenteId || null,
            docenteNombre: m.docenteNombre || null,
            id_asignacion: m.id_asignacion || null
          };
        });
      }
    }

    if (resAsig.ok) {
      const dataAsig = await resAsig.json();
      if (dataAsig.ok) {
        _asignaciones = dataAsig.data;
      }
    }

    return { ok: true, docentes: _docentes, materias: _materias, asignaciones: _asignaciones };
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

/** Devuelve todas las asignaciones de un docente específico */
export function getAsignacionesPorDocente(docenteId) {
  return _asignaciones.filter(a => Number(a.docenteId) === Number(docenteId));
}

/** Devuelve los IDs de materias asignadas a un docente */
export function getMateriasPorDocente(docenteId) {
  return _asignaciones
    .filter(a => Number(a.docenteId) === Number(docenteId))
    .map(a => a.materiaId);
}

/** Devuelve los objetos Materia completos asignados a un docente */
export function getMateriasCompletasPorDocente(docenteId) {
  const asigs = getAsignacionesPorDocente(docenteId);
  return asigs.map(a => ({
    id: a.materiaId,
    codigo: a.materiaCodigo,
    nombre: a.materiaNombre,
    cargaHoraria: a.cargaHoraria || 4,
    nivel: a.nivel,
    id_curso: a.cursoId,
    cursoNombre: a.cursoNombre,
    id_asignacion: a.id_asignacion
  }));
}

/** Devuelve el ID del docente asignado a una materia (opcionalmente en un curso específico) */
export function getDocentePorMateria(materiaId, cursoId = null) {
  const asig = _asignaciones.find(a => 
    Number(a.materiaId) === Number(materiaId) &&
    (cursoId === null || Number(a.cursoId) === Number(cursoId))
  );
  return asig ? asig.docenteId : null;
}

/**
 * Calcula la carga horaria acumulada y el porcentaje sobre el límite de 200h
 */
export function getCargaHorariaDocente(docenteId) {
  const asigs = getAsignacionesPorDocente(docenteId);
  const horasUsadas = asigs.reduce((acc, a) => acc + (a.cargaHoraria || 0), 0);
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
  return _asignaciones;
}

/**
 * Asigna una materia a un docente en PostgreSQL mediante la API
 */
export async function asignarMateria(docenteId, materiaId, cursoId = null) {
  try {
    const token = localStorage.getItem('token');
    const body = {
      id_profesor: Number(docenteId),
      id_materia: Number(materiaId)
    };
    if (cursoId) body.id_curso = Number(cursoId);

    const res = await fetch(`${API_BASE}/asignaciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify(body)
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
 * Asigna un bloque pedagógico de materias de un curso a un maestro titular
 * (Jardín: actividades de sala; Primaria 1°-3°: troncales de grado; Primaria 4°-6°: pareja pedagógica).
 */
export async function asignarBloqueDocente(docenteId, cursoId, materiasIds) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/asignaciones/bloque`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        id_profesor: Number(docenteId),
        id_curso: Number(cursoId),
        materias_ids: materiasIds.map(Number)
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, mensaje: data.error || 'No se pudo asignar el bloque pedagógico' };
    }

    await sincronizarConServidor();
    return { ok: true, mensaje: data.data.mensaje || 'Bloque pedagógico asignado con éxito. ✓' };

  } catch (error) {
    console.error('Error al asignar bloque pedagógico:', error);
    return { ok: false, mensaje: 'Error al conectar con el servidor: ' + error.message };
  }
}

/**
 * Quita la asignación de una materia en PostgreSQL
 */
export async function desasignarMateria(docenteId, materiaId, cursoId = null) {
  try {
    const token = localStorage.getItem('token');
    const url = cursoId ? `${API_BASE}/asignaciones/${materiaId}?cursoId=${cursoId}` : `${API_BASE}/asignaciones/${materiaId}`;
    const res = await fetch(url, {
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
 * Quita una asignación por su id_asignacion primario en PostgreSQL
 */
export async function desasignarAsignacion(idAsignacion) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/asignaciones/id/${idAsignacion}`, {
      method: 'DELETE',
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, mensaje: data.error || 'No se pudo eliminar la asignación' };
    }

    await sincronizarConServidor();
    return { ok: true, mensaje: 'Asignación eliminada correctamente en PostgreSQL.' };

  } catch (error) {
    console.error('Error al eliminar asignación:', error);
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
