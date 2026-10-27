const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seedDivisiones() {
  const existingB = await pool.query("SELECT * FROM cursos WHERE division = 'B'");
  if (existingB.rows.length > 0) {
    console.log('Ya existen cursos de división B:', existingB.rows.length);
    process.exit(0);
  }

  const cursosA = await pool.query("SELECT * FROM cursos WHERE division = 'A' ORDER BY id_curso");
  for (const c of cursosA.rows) {
    const res = await pool.query(
      'INSERT INTO cursos (id_nivel, id_ciclo, nombre, anio_escolar, division) VALUES ($1, $2, $3, $4, $5) RETURNING id_curso',
      [c.id_nivel, c.id_ciclo, c.nombre, c.anio_escolar, 'B']
    );
    const newId = res.rows[0].id_curso;

    // Copiar materias de curso_materia
    const mats = await pool.query('SELECT id_materia FROM curso_materia WHERE id_curso = $1', [c.id_curso]);
    for (const m of mats.rows) {
      await pool.query('INSERT INTO curso_materia (id_curso, id_materia) VALUES ($1, $2)', [newId, m.id_materia]);
    }
  }

  // También agregar división C para 1° Grado, 5° Grado y 1° Año
  const cClaves = [4, 8, 10];
  for (const idA of cClaves) {
    const c = cursosA.rows.find(x => x.id_curso === idA);
    if (c) {
      const res = await pool.query(
        'INSERT INTO cursos (id_nivel, id_ciclo, nombre, anio_escolar, division) VALUES ($1, $2, $3, $4, $5) RETURNING id_curso',
        [c.id_nivel, c.id_ciclo, c.nombre, c.anio_escolar, 'C']
      );
      const newId = res.rows[0].id_curso;
      const mats = await pool.query('SELECT id_materia FROM curso_materia WHERE id_curso = $1', [c.id_curso]);
      for (const m of mats.rows) {
        await pool.query('INSERT INTO curso_materia (id_curso, id_materia) VALUES ($1, $2)', [newId, m.id_materia]);
      }
    }
  }

  const total = await pool.query('SELECT COUNT(*) FROM cursos');
  console.log('¡Divisiones A, B y C creadas exitosamente! Total cursos en BD:', total.rows[0].count);
  process.exit(0);
}

seedDivisiones().catch(e => {
  console.error(e);
  process.exit(1);
});
