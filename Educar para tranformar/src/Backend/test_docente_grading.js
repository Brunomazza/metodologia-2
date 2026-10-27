const assert = require('assert');

async function testDocenteGrading() {
  console.log('--- TEST INTEGRACIÓN: PLANILLA Y CARGA DE CALIFICACIONES DOCENTE ---');

  // 1. Obtener la planilla para Curso 9 (6° Grado Primaria), Materia 7 (Matemática 2° Ciclo)
  console.log('1. Probando GET /api/calificaciones/planilla?id_curso=9&id_materia=7...');
  const resPlanilla = await fetch('http://localhost:3000/api/calificaciones/planilla?id_curso=9&id_materia=7');
  const dataPlanilla = await resPlanilla.json();

  assert.strictEqual(resPlanilla.status, 200, 'Status debe ser 200');
  assert.strictEqual(dataPlanilla.ok, true, 'data.ok debe ser true');
  assert(dataPlanilla.data.alumnos.length > 0, 'Debe haber al menos un alumno en la planilla');
  console.log(`   ✅ Planilla obtenida: Curso "${dataPlanilla.data.curso.nombre}", Materia "${dataPlanilla.data.materia.nombre}", ${dataPlanilla.data.totalAlumnos} alumnos.`);

  // 2. Guardar lote de calificaciones (Trimestres 1 y 2 para alumno 6)
  console.log('2. Probando POST /api/calificaciones/lote...');
  const resLote = await fetch('http://localhost:3000/api/calificaciones/lote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      calificaciones: [
        {
          id_alumno: 6,
          id_materia: 7,
          trimestre: 1,
          nota: 9.50,
          observacion: 'Excelente comprensión y resolución'
        },
        {
          id_alumno: 6,
          id_materia: 7,
          trimestre: 2,
          nota: 8.50,
          observacion: 'Muy buen trabajo grupal'
        }
      ]
    })
  });

  const dataLote = await resLote.json();
  assert.strictEqual(resLote.status, 201, 'Status debe ser 201');
  assert.strictEqual(dataLote.ok, true, 'dataLote.ok debe ser true');
  assert.strictEqual(dataLote.data.guardadas, 2, 'Se deben haber guardado 2 notas');
  console.log(`   ✅ Lote guardado: ${dataLote.data.mensaje}`);

  // 3. Verificar que la planilla ahora devuelve las notas actualizadas
  console.log('3. Verificando persistencia en planilla...');
  const resPlanilla2 = await fetch('http://localhost:3000/api/calificaciones/planilla?id_curso=9&id_materia=7');
  const dataPlanilla2 = await resPlanilla2.json();
  const alumno6 = dataPlanilla2.data.alumnos.find(a => a.id_alumno === 6);

  assert(alumno6, 'Alumno 6 debe existir en la planilla');
  assert.strictEqual(alumno6.trimestre_1, 9.5, 'Trimestre 1 debe ser 9.5');
  assert.strictEqual(alumno6.trimestre_2, 8.5, 'Trimestre 2 debe ser 8.5');
  assert.strictEqual(alumno6.promedio, 9, 'Promedio debe ser 9.00');
  assert.strictEqual(alumno6.estado, 'Promocionado', 'Estado debe ser Promocionado');
  console.log(`   ✅ Planilla actualizada para alumno 6: T1=${alumno6.trimestre_1}, T2=${alumno6.trimestre_2}, Promedio=${alumno6.promedio}, Condición=${alumno6.estado}`);

  // 4. Verificar que el boletín del alumno (portal alumno y portal tutor) refleja exactamente estas calificaciones
  console.log('4. Verificando impacto en boletín general del estudiante (/api/alumnos/6/calificaciones)...');
  const resBoletin = await fetch('http://localhost:3000/api/alumnos/6/calificaciones');
  const dataBoletin = await resBoletin.json();

  assert.strictEqual(resBoletin.status, 200, 'Status boletin debe ser 200');
  const mat7 = dataBoletin.data.boletin.find(m => m.id_materia === 7);
  assert(mat7, 'Materia 7 debe estar en el boletin del alumno');
  assert.strictEqual(mat7.trimestre_1, 9.5, 'Trimestre 1 en boletin debe ser 9.5');
  assert.strictEqual(mat7.trimestre_2, 8.5, 'Trimestre 2 en boletin debe ser 8.5');
  assert.strictEqual(mat7.promedio, 9, 'Promedio en boletin debe ser 9');
  assert.strictEqual(mat7.estado, 'Promocionado', 'Estado en boletin debe ser Promocionado');
  console.log(`   ✅ Boletín oficial sincronizado: ${mat7.materia} -> Promedio ${mat7.promedio} (${mat7.estado})`);

  console.log('--- TODOS LOS TESTS DE CALIFICACIONES DOCENTE PASARON EXITOSAMENTE (4/4) ---');
}

testDocenteGrading().catch(err => {
  console.error('❌ Error en el test:', err);
  process.exit(1);
});
