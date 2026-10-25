/**
 * test-db.js - Script de verificación de conexión a PostgreSQL
 * 
 * Ejecución: node test-db.js
 */

const db = require('./db');

async function testConnection() {
  console.log('🔄 Intentando conectar a PostgreSQL...');
  console.log(`📡 URL configurada: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@') : 'NO DEFINIDA'}`);

  try {
    const res = await db.query('SELECT NOW() as fecha_actual, current_database() as base_datos, version() as version_pg');
    console.log('✅ ¡Conexión exitosa a PostgreSQL!');
    console.log(`   Base de datos: ${res.rows[0].base_datos}`);
    console.log(`   Fecha del servidor: ${res.rows[0].fecha_actual}`);
    console.log(`   Versión: ${res.rows[0].version_pg.split(' on ')[0]}`);

    // Consultamos si las tablas ya fueron creadas
    const tablas = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`\n📋 Tablas encontradas en 'public' (${tablas.rows.length}):`);
    if (tablas.rows.length === 0) {
      console.log('   ⚠️  Aún no se ejecutó el script schema.sql en la base de datos.');
    } else {
      tablas.rows.forEach(t => console.log(`   - ${t.table_name}`));
    }

  } catch (error) {
    console.error('\n❌ Error al conectar a PostgreSQL:');
    console.error(`   Mensaje: ${error.message}`);
    console.error('\n💡 Consejos:');
    console.error('   1. Verificá que el archivo .env tenga la variable DATABASE_URL correcta.');
    console.error('   2. Si usás Neon, asegurate de incluir "?sslmode=require" al final.');
  } finally {
    await db.pool.end();
  }
}

testConnection();
