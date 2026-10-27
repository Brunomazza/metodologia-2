const http = require('http');

async function runTests() {
  console.log('=== TEST SUITE: TUTOR PORTAL & HIJO.HTML UNIFIED VIEW ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Auth Login Tutor Carolina Vargas (DNI 87654321 / 1234)
  try {
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: '87654321', password: '1234' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.ok, '1. Login de Carolina Vargas con DNI 87654321');
    const token = loginData.data?.token;
    const tutorIdUsuario = loginData.data?.usuario?.id || loginData.data?.usuario?.id_usuario;
    assert(!!token, '1.1 Token JWT generado correctamente');
    assert(loginData.data?.usuario?.rol === 'PADRE', '1.2 Rol es PADRE/TUTOR');

    // 2. Alumnos vinculados al tutor
    const hijosRes = await fetch(`http://localhost:3000/api/tutores/${tutorIdUsuario}/alumnos?byUser=true`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const hijosData = await hijosRes.json();
    assert(hijosRes.status === 200 && hijosData.ok, '2. Obtener alumnos a cargo del tutor');
    const hijos = hijosData.data?.hijos || [];
    assert(hijos.length === 2, `2.1 Cantidad de alumnos a cargo es 2 (obtenidos: ${hijos.length})`);
    const joaquin = hijos.find(h => h.id_alumno === 6);
    assert(!!joaquin, '2.2 Alumno Joaquín Bordón (id: 6) está vinculado al tutor');

    // 3. Ficha oficial del alumno
    const alRes = await fetch('http://localhost:3000/api/alumnos/6');
    const alData = await alRes.json();
    assert(alRes.status === 200 && alData.ok, '3. GET /api/alumnos/6 responde ok');
    assert(alData.data?.nombre === 'Joaquín' && alData.data?.apellido === 'Bordón', '3.1 Nombre correcto: Joaquín Bordón');
    assert(alData.data?.curso === '6° Grado', '3.2 Curso es 6° Grado');
    assert(alData.data?.tutorNombre === 'Carolina Vargas', '3.3 Tutor asignado es Carolina Vargas');

    // 4. Materias del curso del alumno (Plan de estudios)
    const matRes = await fetch(`http://localhost:3000/api/cursos/${alData.data.id_curso}/materias`);
    const matData = await matRes.json();
    assert(matRes.status === 200 && matData.ok, '4. GET /api/cursos/9/materias responde ok');
    const materias = matData.data || [];
    assert(materias.length === 6, `4.1 Plan de estudios tiene 6 materias oficiales (obtenidas: ${materias.length})`);
    const matConDocente = materias.find(m => m.docenteNombre !== null);
    assert(!!matConDocente, `4.2 Materias muestran docente/maestro titular asignado (${matConDocente?.nombre}: ${matConDocente?.docenteNombre})`);

    // 5. Boletín oficial de calificaciones
    const calRes = await fetch('http://localhost:3000/api/alumnos/6/calificaciones');
    const calData = await calRes.json();
    assert(calRes.status === 200 && calData.ok, '5. GET /api/alumnos/6/calificaciones responde ok');
    const boletin = calData.data?.boletin || [];
    assert(boletin.length === 6, `5.1 Boletín tiene 6 materias computadas (obtenidas: ${boletin.length})`);

    // 6. Servicios escolares: Inscripción a Deporte
    // Desinscribir primero para garantizar idempotencia
    await fetch('http://localhost:3000/api/deportes/desinscribir', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id_alumno: 6, id_deporte: 1 })
    });

    const depRes = await fetch('http://localhost:3000/api/deportes/inscribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id_alumno: 6, id_deporte: 1 }) // 1 = Fútbol
    });
    const depData = await depRes.json();
    assert(depRes.ok && depData.ok, '6. Inscribir alumno 6 en Deporte Fútbol');

    // Consultar deportes del alumno
    const depCheck = await fetch('http://localhost:3000/api/alumnos/6/deportes');
    const depCheckData = await depCheck.json();
    assert(depCheckData.data?.some(d => d.id_deporte === 1), '6.1 Deporte Fútbol figura inscripto en PostgreSQL');

    // 7. Servicios escolares: Asignación de Transporte
    const transRes = await fetch('http://localhost:3000/api/transporte/asignar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        id_alumno: 6,
        recorrido_numero: 1,
        zona: 'Norte',
        parada: 'Del Viso, Pilar Centro'
      })
    });
    const transData = await transRes.json();
    assert(transRes.status === 200 && transData.ok, '7. Asignar transporte Zona Norte a alumno 6');

    // Consultar transporte del alumno
    const transCheck = await fetch('http://localhost:3000/api/alumnos/6/transporte');
    const transCheckData = await transCheck.json();
    assert(transCheckData.data?.recorrido_numero === 1, '7.1 Transporte Ruta 1 (Zona Norte) activo en PostgreSQL');

    // 8. Verificación de archivos estáticos del servidor web
    const hijoHtmlRes = await fetch('http://localhost:3000/html/hijo.html');
    assert(hijoHtmlRes.status === 200, '8. hijo.html servible por el servidor web');

    const dashFamiliaRes = await fetch('http://localhost:3000/html/dashboard-familia.html');
    assert(dashFamiliaRes.status === 200, '8.1 dashboard-familia.html servible por el servidor web');

  } catch (err) {
    console.error('Error durante la ejecución del test:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
