/**
 * test-api.js - Prueba integral del servidor y autenticación JWT con Neon
 */

const http = require('http');
require('./API_Server');

setTimeout(() => {
  const postData = JSON.stringify({ email: 'admin@novasys.edu.ar', password: '1234' });

  const req = http.request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('\n--- RESULTADO DE PRUEBA DE LOGIN ---');
      console.log('Status HTTP:', res.statusCode);
      const parsed = JSON.parse(body);
      console.log('Respuesta:', JSON.stringify(parsed, null, 2));
      if (parsed.ok && parsed.data.token) {
        console.log('\n✅ ¡LOGIN EXITOSO! Token JWT generado correctamente.');
        console.log('Usuario autenticado:', parsed.data.usuario);
      }
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.error('Error en request:', e);
    process.exit(1);
  });

  req.write(postData);
  req.end();
}, 1500);
