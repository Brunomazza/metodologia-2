const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initNoticias() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS noticias (
      id_noticia SERIAL PRIMARY KEY,
      titulo VARCHAR(255) NOT NULL,
      categoria VARCHAR(50) NOT NULL DEFAULT 'Institucional',
      fecha DATE NOT NULL DEFAULT CURRENT_DATE,
      imagen_url VARCHAR(500) NOT NULL DEFAULT '../img/portada1.jpg',
      descripcion TEXT NOT NULL,
      cuerpo TEXT,
      activo BOOLEAN DEFAULT TRUE,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const count = await pool.query('SELECT COUNT(*) FROM noticias');
  if (parseInt(count.rows[0].count, 10) === 0) {
    await pool.query(`
      INSERT INTO noticias (titulo, categoria, fecha, imagen_url, descripcion, cuerpo) VALUES
      (
        'Apertura Oficial de Inscripciones 2027', 
        'Institucional', 
        '2026-06-15', 
        '../img/portada1.jpg', 
        'Con gran entusiasmo anunciamos el inicio de nuestro proceso de matriculación para el primer ciclo lectivo de nuestra institución.',
        '<p>Con gran entusiasmo anunciamos el inicio de nuestro proceso de matriculación para el primer ciclo lectivo de nuestra institución.</p><p>Nuestro equipo directivo y docente ha preparado un itinerario de admisiones transparente, inclusivo y enfocado en el acompañamiento a las familias en cada etapa. Los cupos son limitados con el fin de mantener un ratio alumno-docente óptimo que garantice atención personalizada.</p><p>Para solicitar una entrevista diagnóstica o recorrer las instalaciones edilicias, complete el formulario de preinscripción en nuestro portal web.</p>'
      ),
      (
        'Finalizan obras del Complejo Acuático', 
        'Deportes', 
        '2026-06-08', 
        '../img/Pileta natacion.jpg',
        'Nuestra pileta olímpica climatizada ya está en la fase final de pruebas. Un espacio de primer nivel para nuestros futuros alumnos.',
        '<p>Nuestra pileta olímpica climatizada ya está en la fase final de pruebas. Un espacio de primer nivel para nuestros futuros alumnos.</p><p>La infraestructura cuenta con climatización geotérmica de última generación, carriles homologados de competición y vestuarios de estándar profesional adaptados para todas las edades y niveles de habilidad.</p><p>La natación formará parte integral de la currícula deportiva desde el nivel inicial hasta el secundario.</p>'
      ),
      (
        'Alianza estratégica con Cambridge', 
        'Académico', 
        '2026-05-25', 
        '../img/ninosEstudiando.jpg',
        'Firmamos un convenio para que nuestro programa de inglés cuente con certificación internacional desde la primaria.',
        '<p>Firmamos un convenio para que nuestro programa de inglés cuente con certificación internacional desde la primaria.</p><p>Este convenio brindará a nuestros alumnos la posibilidad de rendir exámenes oficiales con reconocimiento global (Starters, Movers, Flyers, KET y PET), fortaleciendo sus competencias lingüísticas en un mundo interconectado.</p><p>Los docentes a cargo contarán con actualización pedagógica continua brindada directamente por examinadores internacionales.</p>'
      );
    `);
    console.log('Tabla noticias creada y poblada con noticias iniciales.');
  } else {
    console.log('Tabla noticias ya existe con registros:', count.rows[0].count);
  }
  process.exit(0);
}

initNoticias().catch(e => {
  console.error('Error al inicializar noticias:', e);
  process.exit(1);
});
