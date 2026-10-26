const db = require('./db');

async function fixSequences() {
  await db.query(`
    INSERT INTO deportes (id_deporte, nombre, id_nivel, dia_semana, hora_inicio, hora_fin, cupo_maximo, id_profesor)
    VALUES (5, 'Atletismo', 2, 'Viernes', '14:00:00', '16:00:00', 25, 1)
    ON CONFLICT (id_deporte) DO NOTHING;
  `);

  const tablas = [
    { tabla: 'usuarios', col: 'id_usuario' },
    { tabla: 'alumnos', col: 'id_alumno' },
    { tabla: 'profesores', col: 'id_profesor' },
    { tabla: 'tutores', col: 'id_tutor' },
    { tabla: 'materias', col: 'id_materia' },
    { tabla: 'cursos', col: 'id_curso' },
    { tabla: 'deportes', col: 'id_deporte' }
  ];

  for (const t of tablas) {
    try {
      const q = "SELECT setval(pg_get_serial_sequence('" + t.tabla + "', '" + t.col + "'), COALESCE(MAX(" + t.col + "), 1)) FROM " + t.tabla;
      const res = await db.query(q);
      console.log("Secuencia de " + t.tabla + "." + t.col + " sincronizada al valor: " + res.rows[0].setval);
    } catch (e) {
      console.error("Error en " + t.tabla + ":", e.message);
    }
  }

  await db.pool.end();
  console.log("¡Todas las secuencias de PostgreSQL quedaron sincronizadas!");
}

fixSequences();
