/**
 * run-schema.js - Ejecuta schema.sql en la base de datos PostgreSQL
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runSchema() {
  console.log('⏳ Leyendo schema.sql...');
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('🔄 Conectando a PostgreSQL y ejecutando schema.sql...');
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ ¡schema.sql ejecutado con éxito!');

    // Verificación
    const [c, ci, m, cm, u, a, p, cal] = await Promise.all([
      client.query('SELECT count(*) FROM cursos'),
      client.query('SELECT count(*) FROM ciclos'),
      client.query('SELECT count(*) FROM materias'),
      client.query('SELECT count(*) FROM curso_materia'),
      client.query('SELECT count(*) FROM usuarios'),
      client.query('SELECT count(*) FROM alumnos'),
      client.query('SELECT count(*) FROM profesores'),
      client.query('SELECT count(*) FROM calificaciones')
    ]);

    console.log('\n📊 Estado de la base de datos tras la inicialización:');
    console.log(`   - Cursos: ${c.rows[0].count}`);
    console.log(`   - Ciclos: ${ci.rows[0].count}`);
    console.log(`   - Materias en catálogo: ${m.rows[0].count}`);
    console.log(`   - Asignaciones de materias a cursos (Plan de estudios): ${cm.rows[0].count}`);
    console.log(`   - Usuarios: ${u.rows[0].count}`);
    console.log(`   - Alumnos: ${a.rows[0].count}`);
    console.log(`   - Profesores: ${p.rows[0].count}`);
    console.log(`   - Calificaciones registradas: ${cal.rows[0].count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error al ejecutar schema.sql:', error.message);
  } finally {
    client.release();
    await db.pool.end();
  }
}

runSchema();
