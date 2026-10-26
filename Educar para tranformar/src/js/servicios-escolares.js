/**
 * =============================================================================
 * servicios-escolares.js - HU-02 (Deportes) y HU-03 (Transporte Escolar)
 * Metodología de Sistemas II - UTN TUP
 * 
 * Conexión completa a PostgreSQL en Neon Cloud mediante API REST:
 * - GET    /api/alumnos/:id/deportes
 * - POST   /api/deportes/inscribir
 * - DELETE /api/deportes/desinscribir
 * - GET    /api/alumnos/:id/transporte
 * - POST   /api/transporte/asignar
 * - DELETE /api/transporte/:id_alumno
 * =============================================================================
 */

const API_BASE = 'http://localhost:3000/api';

// ─── CATÁLOGO OFICIAL DE DEPORTES (HU-02) ────────────────────────────────────
export const DEPORTES_CATALOGO = [
    { id: 'futbol',    dbId: 1, nombre: 'Fútbol',    icono: 'sports_soccer',      color: 'success',   dias: ['Lunes','Miércoles'],          horaInicio: '15:00', horaFin: '16:30', lugar: 'Predio Deportivo'    },
    { id: 'natacion',  dbId: 2, nombre: 'Natación',  icono: 'pool',               color: 'primary',   dias: ['Martes','Jueves'],           horaInicio: '15:30', horaFin: '17:00', lugar: 'Complejo Acuático'   },
    { id: 'basquet',   dbId: 3, nombre: 'Básquet',   icono: 'sports_basketball',  color: 'warning',   dias: ['Lunes','Miércoles'],          horaInicio: '17:00', horaFin: '18:30', lugar: 'Gimnasio Principal'  },
    { id: 'ajedrez',   dbId: 4, nombre: 'Ajedrez',   icono: 'chess',              color: 'secondary', dias: ['Viernes'],                   horaInicio: '15:00', horaFin: '16:30', lugar: 'Taller de Lógica'   },
    { id: 'atletismo', dbId: 5, nombre: 'Atletismo', icono: 'directions_run',     color: 'info',      dias: ['Viernes'],                   horaInicio: '14:00', horaFin: '16:00', lugar: 'Pista Reglamentaria' }
];

// ─── CATÁLOGO DE RUTAS DE TRANSPORTE (HU-03) ─────────────────────────────────
export const RUTAS_CATALOGO = [
    { id: 'zona-norte', recorrido: 1, zona: 'Norte', nombre: 'Zona Norte', icono: 'north',  color: 'primary', descripcion: 'Del Viso, Pilar Centro, Manzanares',           horarioIda: '07:15', horarioVuelta: '17:00' },
    { id: 'zona-sur',   recorrido: 2, zona: 'Sur',   nombre: 'Zona Sur',   icono: 'south',  color: 'danger',  descripcion: 'Moreno, General Rodríguez, Luján',              horarioIda: '07:00', horarioVuelta: '17:15' },
    { id: 'zona-este',  recorrido: 3, zona: 'Este',  nombre: 'Zona Este',  icono: 'east',   color: 'success', descripcion: 'San Miguel, Malvinas Argentinas, José C. Paz',  horarioIda: '07:30', horarioVuelta: '17:00' },
    { id: 'zona-oeste', recorrido: 4, zona: 'Oeste', nombre: 'Zona Oeste', icono: 'west',   color: 'warning', descripcion: 'Ituzaingó, Castelar, Merlo',                    horarioIda: '07:20', horarioVuelta: '17:10' }
];

const MAX_DEPORTES = 2;

// ─── SINCRONIZACIÓN CON POSTGRESQL ──────────────────────────────────────────

/**
 * Carga desde PostgreSQL las inscripciones a deportes y transporte del alumno
 */
export async function sincronizarServiciosAlumno(alumnoId) {
    try {
        const [resDep, resTrans] = await Promise.all([
            fetch(`${API_BASE}/alumnos/${alumnoId}/deportes`),
            fetch(`${API_BASE}/alumnos/${alumnoId}/transporte`)
        ]);

        if (resDep.ok) {
            const dataDep = await resDep.json();
            if (dataDep.ok && Array.isArray(dataDep.data)) {
                // Mapear los ids de la base de datos a los ids string del catálogo
                const idsDeportes = dataDep.data.map(d => {
                    const cat = DEPORTES_CATALOGO.find(c => c.dbId === d.id_deporte);
                    return cat ? cat.id : null;
                }).filter(Boolean);

                localStorage.setItem(`deportes_${alumnoId}`, JSON.stringify(idsDeportes));
            }
        }

        if (resTrans.ok) {
            const dataTrans = await resTrans.json();
            if (dataTrans.ok && dataTrans.data) {
                const rutaEncontrada = RUTAS_CATALOGO.find(r => r.recorrido === dataTrans.data.recorrido_numero);
                if (rutaEncontrada) {
                    localStorage.setItem(`transporte_${alumnoId}`, rutaEncontrada.id);
                }
            } else {
                localStorage.removeItem(`transporte_${alumnoId}`);
            }
        }
    } catch (e) {
        console.warn('[Servicios Escolares] Servidor no disponible, usando localStorage:', e.message);
    }
}

// ─── LECTURA LOCAL ────────────────────────────────────────────────────────────

export function getDeportesAlumno(alumnoId) {
    try { return JSON.parse(localStorage.getItem(`deportes_${alumnoId}`)) || []; }
    catch { return []; }
}

export function getRutaAlumno(alumnoId) {
    return localStorage.getItem(`transporte_${alumnoId}`) || null;
}

// ─── HU-02: DEPORTES ──────────────────────────────────────────────────────────

export async function inscribirDeporte(alumnoId, deporteId) {
    const nuevo = DEPORTES_CATALOGO.find(d => d.id === deporteId);
    if (!nuevo) return { ok: false, mensaje: 'Deporte no encontrado en el catálogo.' };

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/deportes/inscribir`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
                id_alumno: alumnoId,
                id_deporte: nuevo.dbId
            })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
            return { ok: false, mensaje: data.error || 'No se pudo realizar la inscripción al deporte' };
        }

        // Actualizar caché local
        const actuales = getDeportesAlumno(alumnoId);
        if (!actuales.includes(deporteId)) {
            localStorage.setItem(`deportes_${alumnoId}`, JSON.stringify([...actuales, deporteId]));
        }

        return { ok: true, mensaje: `Inscripción a ${nuevo.nombre} guardada en PostgreSQL. ✓` };

    } catch (e) {
        console.error('Error al inscribir deporte:', e);
        return { ok: false, mensaje: 'Error al conectar con la base de datos: ' + e.message };
    }
}

export async function desinscribirDeporte(alumnoId, deporteId) {
    const deporte = DEPORTES_CATALOGO.find(d => d.id === deporteId);
    if (!deporte) return { ok: false, mensaje: 'Deporte no encontrado.' };

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/deportes/desinscribir`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
                id_alumno: alumnoId,
                id_deporte: deporte.dbId
            })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
            return { ok: false, mensaje: data.error || 'No se pudo desinscribir' };
        }

        // Actualizar caché local
        const actuales = getDeportesAlumno(alumnoId);
        localStorage.setItem(`deportes_${alumnoId}`, JSON.stringify(actuales.filter(id => id !== deporteId)));

        return { ok: true, mensaje: `Desinscripción de ${deporte.nombre} completada en PostgreSQL.` };

    } catch (e) {
        console.error('Error al desinscribir:', e);
        return { ok: false, mensaje: 'Error al conectar con el servidor: ' + e.message };
    }
}

// ─── HU-03: TRANSPORTE ────────────────────────────────────────────────────────

export async function asignarTransporte(alumnoId, rutaId) {
    const ruta = RUTAS_CATALOGO.find(r => r.id === rutaId);
    if (!ruta) return { ok: false, mensaje: 'Ruta no encontrada.' };

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/transporte/asignar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
                id_alumno: alumnoId,
                recorrido_numero: ruta.recorrido,
                zona: ruta.zona,
                parada: ruta.descripcion
            })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
            return { ok: false, mensaje: data.error || 'No se pudo asignar el transporte' };
        }

        // Actualizar caché local
        localStorage.setItem(`transporte_${alumnoId}`, rutaId);

        return { ok: true, mensaje: `Transporte ${ruta.nombre} asignado con éxito en PostgreSQL. ✓` };

    } catch (e) {
        console.error('Error al asignar transporte:', e);
        return { ok: false, mensaje: 'Error al conectar con el servidor: ' + e.message };
    }
}

export async function quitarTransporte(alumnoId) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/transporte/${alumnoId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': token ? `Bearer ${token}` : ''
            }
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
            return { ok: false, mensaje: data.error || 'No se pudo dar de baja el transporte' };
        }

        localStorage.removeItem(`transporte_${alumnoId}`);
        return { ok: true, mensaje: 'Servicio de transporte dado de baja en PostgreSQL.' };

    } catch (e) {
        console.error('Error al quitar transporte:', e);
        return { ok: false, mensaje: 'Error al conectar con el servidor: ' + e.message };
    }
}
