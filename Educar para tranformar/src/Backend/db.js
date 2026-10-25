/**
 * db.js - Módulo de conexión a PostgreSQL
 * 
 * Utiliza 'pg.Pool' para administrar un grupo reutilizable de conexiones
 * a la base de datos (PostgreSQL en Neon / Supabase o local).
 */

const { Pool } = require('pg');
require('dotenv').config();

// Configuración del Pool de conexiones
const isProductionOrCloud = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.tech') || process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Para conexiones cloud como Neon o Supabase se requiere SSL
  ssl: isProductionOrCloud ? { rejectUnauthorized: false } : false
});

// Evento que se dispara al conectar un nuevo cliente al pool
pool.on('connect', () => {
  // Conexión establecida silenciosamente
});

// Evento para capturar errores inesperados en clientes inactivos del pool
pool.on('error', (err) => {
  console.error('[PostgreSQL] Error inesperado en el pool de conexiones:', err);
});

module.exports = {
  /**
   * Ejecuta una consulta SQL parametrizada
   * @param {string} text - Consulta SQL con placeholders ($1, $2, etc.)
   * @param {Array} params - Array con los valores de los parámetros
   */
  query: (text, params) => pool.query(text, params),
  
  /**
   * Obtiene un cliente directo del pool para transacciones (BEGIN / COMMIT / ROLLBACK)
   */
  getClient: () => pool.connect(),
  
  pool
};
