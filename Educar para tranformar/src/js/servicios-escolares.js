/**
 * servicios-escolares.js
 * Lógica de negocio para HU-02 (Deportes Extracurriculares) y HU-03 (Transporte Escolar)
 * Persiste en localStorage y está preparada para conectarse a una API REST.
 */

// ─── CATÁLOGO DE DEPORTES (HU-02) ────────────────────────────────────────────
export const DEPORTES_CATALOGO = [
    { id: 'natacion',  nombre: 'Natación',  icono: 'pool',               color: 'primary',   dias: ['Martes','Jueves'],           horaInicio: '14:00', horaFin: '15:30', lugar: 'Complejo Acuático'   },
    { id: 'futbol',    nombre: 'Fútbol',    icono: 'sports_soccer',      color: 'success',   dias: ['Lunes','Miércoles'],          horaInicio: '15:00', horaFin: '16:30', lugar: 'Predio Deportivo'    },
    { id: 'basquet',   nombre: 'Básquet',   icono: 'sports_basketball',  color: 'warning',   dias: ['Lunes','Miércoles'],          horaInicio: '14:00', horaFin: '15:30', lugar: 'Gimnasio Principal'  },
    { id: 'atletismo', nombre: 'Atletismo', icono: 'directions_run',     color: 'info',      dias: ['Viernes'],                   horaInicio: '14:00', horaFin: '16:00', lugar: 'Pista Reglamentaria' },
    { id: 'ajedrez',   nombre: 'Ajedrez',   icono: 'chess',              color: 'secondary', dias: ['Viernes'],                   horaInicio: '14:00', horaFin: '15:30', lugar: 'Taller de Lógica'   }
];

// ─── CATÁLOGO DE RUTAS DE TRANSPORTE (HU-03) ─────────────────────────────────
export const RUTAS_CATALOGO = [
    { id: 'zona-norte', nombre: 'Zona Norte', icono: 'north',  color: 'primary', descripcion: 'Del Viso, Pilar Centro, Manzanares',           horarioIda: '07:15', horarioVuelta: '17:00' },
    { id: 'zona-sur',   nombre: 'Zona Sur',   icono: 'south',  color: 'danger',  descripcion: 'Moreno, General Rodríguez, Luján',              horarioIda: '07:00', horarioVuelta: '17:15' },
    { id: 'zona-este',  nombre: 'Zona Este',  icono: 'east',   color: 'success', descripcion: 'San Miguel, Malvinas Argentinas, José C. Paz',  horarioIda: '07:30', horarioVuelta: '17:00' },
    { id: 'zona-oeste', nombre: 'Zona Oeste', icono: 'west',   color: 'warning', descripcion: 'Ituzaingó, Castelar, Merlo',                    horarioIda: '07:20', horarioVuelta: '17:10' }
];

const MAX_DEPORTES = 2;

// ─── PERSISTENCIA ─────────────────────────────────────────────────────────────
export function getDeportesAlumno(alumnoId) {
    try { return JSON.parse(localStorage.getItem(`deportes_${alumnoId}`)) || []; }
    catch { return []; }
}

export function getRutaAlumno(alumnoId) {
    return localStorage.getItem(`transporte_${alumnoId}`) || null;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function toMinutos(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
}

function haySuperposicion(a, b) {
    const diasComunes = a.dias.filter(d => b.dias.includes(d));
    if (!diasComunes.length) return false;
    return toMinutos(a.horaInicio) < toMinutos(b.horaFin) &&
           toMinutos(b.horaInicio) < toMinutos(a.horaFin);
}

// ─── HU-02: DEPORTES ──────────────────────────────────────────────────────────
export function inscribirDeporte(alumnoId, deporteId) {
    const actuales = getDeportesAlumno(alumnoId);
    const nuevo = DEPORTES_CATALOGO.find(d => d.id === deporteId);
    if (!nuevo)                        return { ok: false, mensaje: 'Deporte no encontrado.' };
    if (actuales.includes(deporteId))  return { ok: false, mensaje: 'Ya estás inscripto en este deporte.' };
    if (actuales.length >= MAX_DEPORTES) return { ok: false, mensaje: `Máximo ${MAX_DEPORTES} deportes por alumno.` };

    for (const id of actuales) {
        const act = DEPORTES_CATALOGO.find(d => d.id === id);
        if (act && haySuperposicion(act, nuevo))
            return { ok: false, mensaje: `Conflicto de horario con ${act.nombre} (coinciden en días y hora).` };
    }

    localStorage.setItem(`deportes_${alumnoId}`, JSON.stringify([...actuales, deporteId]));
    return { ok: true, mensaje: `Inscripción a ${nuevo.nombre} realizada con éxito. ✓` };
}

export function desinscribirDeporte(alumnoId, deporteId) {
    const actuales = getDeportesAlumno(alumnoId);
    const deporte  = DEPORTES_CATALOGO.find(d => d.id === deporteId);
    if (!actuales.includes(deporteId)) return { ok: false, mensaje: 'No estás inscripto en este deporte.' };
    localStorage.setItem(`deportes_${alumnoId}`, JSON.stringify(actuales.filter(id => id !== deporteId)));
    return { ok: true, mensaje: `Desinscripción de ${deporte?.nombre} realizada.` };
}

// ─── HU-03: TRANSPORTE ────────────────────────────────────────────────────────
export function asignarTransporte(alumnoId, rutaId) {
    const ruta = RUTAS_CATALOGO.find(r => r.id === rutaId);
    if (!ruta) return { ok: false, mensaje: 'Ruta no encontrada.' };
    localStorage.setItem(`transporte_${alumnoId}`, rutaId);
    return { ok: true, mensaje: `Transporte asignado: ${ruta.nombre}.` };
}

export function quitarTransporte(alumnoId) {
    localStorage.removeItem(`transporte_${alumnoId}`);
    return { ok: true, mensaje: 'Servicio de transporte dado de baja.' };
}
