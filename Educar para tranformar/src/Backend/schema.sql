-- =============================================================================
-- ESQUEMA DE BASE DE DATOS POSTGRESQL - PROYECTO "EDUCAR PARA TRANSFORMAR"
-- Metodología de Sistemas II - UTN TUP
-- Compatible con PostgreSQL 14+ (Neon.tech / Supabase / Local)
-- =============================================================================

-- Eliminar tablas previas en orden inverso de dependencias si se re-ejecuta
DROP TABLE IF EXISTS calificaciones CASCADE;
DROP TABLE IF EXISTS inscripciones_transporte CASCADE;
DROP TABLE IF EXISTS inscripciones_deporte CASCADE;
DROP TABLE IF EXISTS deportes CASCADE;
DROP TABLE IF EXISTS asignaciones_docente CASCADE;
DROP TABLE IF EXISTS curso_materia CASCADE;
DROP TABLE IF EXISTS materias CASCADE;
DROP TABLE IF EXISTS tutor_alumno CASCADE;
DROP TABLE IF EXISTS tutores CASCADE;
DROP TABLE IF EXISTS profesores CASCADE;
DROP TABLE IF EXISTS alumnos CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS cursos CASCADE;
DROP TABLE IF EXISTS ciclos CASCADE;
DROP TABLE IF EXISTS niveles CASCADE;

-- -----------------------------------------------------------------------------
-- 1. Niveles Educativos
-- -----------------------------------------------------------------------------
CREATE TABLE niveles (
    id_nivel SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE -- 'Inicial', 'Primario', 'Secundario'
);

-- -----------------------------------------------------------------------------
-- 2. Ciclos (agrupaciones dentro de un nivel: Ciclo Básico, Ciclo Orientado...)
-- -----------------------------------------------------------------------------
CREATE TABLE ciclos (
    id_ciclo SERIAL PRIMARY KEY,
    id_nivel INT NOT NULL REFERENCES niveles(id_nivel) ON DELETE CASCADE,
    nombre VARCHAR(80) NOT NULL,     -- 'Ciclo Básico', 'Ciclo Orientado'
    descripcion TEXT
);

-- -----------------------------------------------------------------------------
-- 3. Cursos / Divisiones
--    Cada curso pertenece a un nivel y opcionalmente a un ciclo.
-- -----------------------------------------------------------------------------
CREATE TABLE cursos (
    id_curso SERIAL PRIMARY KEY,
    id_nivel INT NOT NULL REFERENCES niveles(id_nivel) ON DELETE RESTRICT,
    id_ciclo INT REFERENCES ciclos(id_ciclo) ON DELETE SET NULL,
    nombre VARCHAR(60) NOT NULL,     -- Ej: '1° Año A', '4° Grado', 'Sala de 4 años'
    anio_escolar INT,                -- 1, 2, 3... año dentro del nivel
    division VARCHAR(5) DEFAULT 'A'  -- 'A', 'B', 'C'
);

-- -----------------------------------------------------------------------------
-- 3. Usuarios y Roles (Autenticación y RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id_usuario SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(30) NOT NULL CHECK (rol IN ('ADMIN', 'DOCENTE', 'PADRE', 'ESTUDIANTE')),
    nombre VARCHAR(60),
    apellido VARCHAR(60),
    edad INT,
    genero VARCHAR(20),             -- 'Masculino', 'Femenino', 'Otro'
    estado VARCHAR(20) DEFAULT 'ACTIVO',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 4. Alumnos
-- -----------------------------------------------------------------------------
CREATE TABLE alumnos (
    id_alumno SERIAL PRIMARY KEY,
    legajo VARCHAR(30) NOT NULL UNIQUE,
    dni VARCHAR(15) NOT NULL UNIQUE,
    nombre VARCHAR(50) NOT NULL,
    apellido VARCHAR(50) NOT NULL,
    fecha_nacimiento DATE,
    domicilio VARCHAR(100),
    telefono VARCHAR(30),
    correo VARCHAR(100),
    id_curso INT REFERENCES cursos(id_curso) ON DELETE RESTRICT,
    id_usuario INT UNIQUE REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    estado VARCHAR(20) DEFAULT 'ACTIVO'
);

-- -----------------------------------------------------------------------------
-- 5. Tutores / Familias
-- -----------------------------------------------------------------------------
CREATE TABLE tutores (
    id_tutor SERIAL PRIMARY KEY,
    dni VARCHAR(15) NOT NULL UNIQUE,
    nombre VARCHAR(50) NOT NULL,
    apellido VARCHAR(50) NOT NULL,
    telefono VARCHAR(30),
    id_usuario INT NOT NULL UNIQUE REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 6. Relación Tutor - Alumno (Permite que un tutor tenga múltiples hijos)
-- -----------------------------------------------------------------------------
CREATE TABLE tutor_alumno (
    id_tutor INT NOT NULL REFERENCES tutores(id_tutor) ON DELETE CASCADE,
    id_alumno INT NOT NULL REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
    parentesco VARCHAR(30) DEFAULT 'TUTOR',
    PRIMARY KEY (id_tutor, id_alumno)
);

-- -----------------------------------------------------------------------------
-- 7. Profesores / Docentes
-- -----------------------------------------------------------------------------
CREATE TABLE profesores (
    id_profesor SERIAL PRIMARY KEY,
    legajo VARCHAR(30) NOT NULL UNIQUE,
    dni VARCHAR(15) NOT NULL UNIQUE,
    nombre VARCHAR(50) NOT NULL,
    apellido VARCHAR(50) NOT NULL,
    especialidad VARCHAR(100),
    telefono VARCHAR(30),
    id_usuario INT UNIQUE REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 8. Materias (catálogo global, vinculadas a nivel)
-- -----------------------------------------------------------------------------
CREATE TABLE materias (
    id_materia SERIAL PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    carga_horaria INT NOT NULL DEFAULT 4,
    id_nivel INT NOT NULL REFERENCES niveles(id_nivel) ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- 9. Plan de Estudios: Materias por Curso (tabla puente)
--    Define qué materias corresponden a cada curso específico.
--    Ej: Matemática I → 1° Año (Secundario, Ciclo Básico)
-- -----------------------------------------------------------------------------
CREATE TABLE curso_materia (
    id_curso   INT NOT NULL REFERENCES cursos(id_curso)   ON DELETE CASCADE,
    id_materia INT NOT NULL REFERENCES materias(id_materia) ON DELETE CASCADE,
    PRIMARY KEY (id_curso, id_materia)
);

-- -----------------------------------------------------------------------------
-- 10. Asignación Académica Docente-Materia-Curso (HU-04)
--     Un docente dicta una materia en un curso específico.
--     UNIQUE: una materia en un curso solo puede tener UN docente titular.
-- -----------------------------------------------------------------------------
CREATE TABLE asignaciones_docente (
    id_asignacion SERIAL PRIMARY KEY,
    id_profesor INT NOT NULL REFERENCES profesores(id_profesor) ON DELETE CASCADE,
    id_materia  INT NOT NULL REFERENCES materias(id_materia)   ON DELETE CASCADE,
    id_curso    INT          REFERENCES cursos(id_curso)        ON DELETE CASCADE,
    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_materia_curso UNIQUE (id_materia, id_curso)
);

-- -----------------------------------------------------------------------------
-- 11. Catálogo de Deportes (HU-02)
-- -----------------------------------------------------------------------------
CREATE TABLE deportes (
    id_deporte SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    id_nivel INT REFERENCES niveles(id_nivel),
    dia_semana VARCHAR(25) NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    cupo_maximo INT NOT NULL DEFAULT 25 CHECK (cupo_maximo > 0),
    id_profesor INT REFERENCES profesores(id_profesor)
);

-- -----------------------------------------------------------------------------
-- 12. Inscripción a Deportes (HU-02)
-- Un alumno no puede inscribirse dos veces al mismo deporte (UNIQUE)
-- -----------------------------------------------------------------------------
CREATE TABLE inscripciones_deporte (
    id_inscripcion SERIAL PRIMARY KEY,
    id_alumno  INT NOT NULL REFERENCES alumnos(id_alumno)  ON DELETE CASCADE,
    id_deporte INT NOT NULL REFERENCES deportes(id_deporte) ON DELETE RESTRICT,
    fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_alumno_deporte UNIQUE (id_alumno, id_deporte)
);

-- -----------------------------------------------------------------------------
-- 13. Inscripción a Transporte Escolar (HU-03)
-- Un alumno solo puede tener 1 registro activo de transporte (UNIQUE en id_alumno)
-- -----------------------------------------------------------------------------
CREATE TABLE inscripciones_transporte (
    id_transporte SERIAL PRIMARY KEY,
    id_alumno INT NOT NULL UNIQUE REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
    recorrido_numero INT NOT NULL CHECK (recorrido_numero BETWEEN 1 AND 4),
    zona VARCHAR(50) NOT NULL,
    parada VARCHAR(100) NOT NULL,
    fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 14. Calificaciones y Boletín de Notas (HU-05)
--     Registra evaluaciones por materia y trimestre con notas y observaciones.
-- -----------------------------------------------------------------------------
CREATE TABLE calificaciones (
    id_calificacion SERIAL PRIMARY KEY,
    id_alumno INT NOT NULL REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
    id_materia INT NOT NULL REFERENCES materias(id_materia) ON DELETE CASCADE,
    trimestre INT NOT NULL CHECK (trimestre BETWEEN 1 AND 3),
    nota NUMERIC(4,2) NOT NULL CHECK (nota >= 1 AND nota <= 10),
    observacion VARCHAR(100),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_alumno_materia_trimestre UNIQUE (id_alumno, id_materia, trimestre)
);


-- =============================================================================
-- DATOS SEMILLA INICIALES (SEED DATA)
-- Contraseña de todos los usuarios de prueba: 1234
-- Hash bcrypt: $2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC
-- =============================================================================

-- 1. Niveles
INSERT INTO niveles (id_nivel, nombre) VALUES
(1, 'Inicial'),
(2, 'Primario'),
(3, 'Secundario');

-- 2. Ciclos (agrupaciones dentro de cada nivel)
INSERT INTO ciclos (id_ciclo, id_nivel, nombre, descripcion) VALUES
(1, 1, 'Nivel Inicial Completo', 'Jardín de Infantes: Sala de 3, 4 y 5 años'),
(2, 2, 'Primer Ciclo Primario',  '1°, 2° y 3° grado'),
(3, 2, 'Segundo Ciclo Primario', '4°, 5° y 6° grado'),
(4, 3, 'Ciclo Básico',           '1° y 2° año del Secundario'),
(5, 3, 'Ciclo Orientado',        '3°, 4° y 5° año del Secundario');

-- 3. Cursos — completos por nivel y ciclo
INSERT INTO cursos (id_curso, id_nivel, id_ciclo, nombre, anio_escolar, division) VALUES
-- Inicial
(1,  1, 1, 'Sala de 3 Años',              3, 'A'),
(2,  1, 1, 'Sala de 4 Años',              4, 'A'),
(3,  1, 1, 'Sala de 5 Años (Preescolar)', 5, 'A'),
-- Primario 1er Ciclo
(4,  2, 2, '1° Grado', 1, 'A'),
(5,  2, 2, '2° Grado', 2, 'A'),
(6,  2, 2, '3° Grado', 3, 'A'),
-- Primario 2do Ciclo
(7,  2, 3, '4° Grado', 4, 'A'),
(8,  2, 3, '5° Grado', 5, 'A'),
(9,  2, 3, '6° Grado', 6, 'A'),
-- Secundario Ciclo Básico
(10, 3, 4, '1° Año', 1, 'A'),
(11, 3, 4, '2° Año', 2, 'A'),
-- Secundario Ciclo Orientado
(12, 3, 5, '3° Año', 3, 'A'),
(13, 3, 5, '4° Año', 4, 'A'),
(14, 3, 5, '5° Año', 5, 'A');

-- 4. Usuarios
INSERT INTO usuarios (id_usuario, email, password_hash, rol, nombre, apellido, edad, genero) VALUES
(1, 'admin@novasys.edu.ar',           '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'ADMIN',      'Administrador', 'General',  38, 'Masculino'),
(2, 'ana.lopez@novasys.edu.ar',       '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'DOCENTE',    'Ana',           'López',    35, 'Femenino'),
(3, 'carlos.martinez@novasys.edu.ar', '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'DOCENTE',    'Carlos',        'Martínez', 42, 'Masculino'),
(4, 'maria.suarez@novasys.edu.ar',    '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'DOCENTE',    'María',         'Suárez',   31, 'Femenino'),
(5, 'jose.tutor@novasys.edu.ar',      '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'PADRE',      'José',          'González', 46, 'Masculino'),
(6, 'tomas.alumno@novasys.edu.ar',    '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'ESTUDIANTE', 'Tomás',         'González', 10, 'Masculino'),
(7, 'sofia.alumna@novasys.edu.ar',    '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'ESTUDIANTE', 'Sofía',         'González', 15, 'Femenino');

-- 5. Profesores
INSERT INTO profesores (id_profesor, legajo, dni, nombre, apellido, especialidad, telefono, id_usuario) VALUES
(1, 'D001', '28111222', 'Ana',    'López',    'Matemáticas y Ciencias', '3624112233', 2),
(2, 'D002', '30333444', 'Carlos', 'Martínez', 'Lengua y Literatura',    '3624556677', 3),
(3, 'D003', '32555666', 'María',  'Suárez',   'Nivel Inicial (Jardín)', '3624778899', 4);

-- 6. Alumnos
INSERT INTO alumnos (id_alumno, legajo, dni, nombre, apellido, fecha_nacimiento, id_curso, id_usuario) VALUES
(1, 'A001', '48123456', 'Tomás', 'González', '2014-05-12', 7,  6),
(2, 'A002', '45987654', 'Sofía', 'González', '2009-08-20', 10, 7);

-- 7. Tutores y relación con hijos
INSERT INTO tutores (id_tutor, dni, nombre, apellido, telefono, id_usuario) VALUES
(1, '22999888', 'José', 'González', '3624998877', 5);

INSERT INTO tutor_alumno (id_tutor, id_alumno, parentesco) VALUES
(1, 1, 'PADRE'),
(1, 2, 'PADRE');

-- 8. Materias — por nivel
INSERT INTO materias (id_materia, codigo, nombre, carga_horaria, id_nivel) VALUES
-- Inicial
(1,  'INI-PLAY', 'Juego y Exploración',         4, 1),
(2,  'INI-ART',  'Expresión Artística',          3, 1),
(3,  'INI-LEN',  'Iniciación a la Lectura',      3, 1),
-- Primario 1er Ciclo
(4,  'PRI-MAT1', 'Matemática 1° Ciclo',          5, 2),
(5,  'PRI-LEN1', 'Lengua 1° Ciclo',              5, 2),
(6,  'PRI-CS1',  'Conocimiento del Entorno',     4, 2),
-- Primario 2do Ciclo
(7,  'PRI-MAT2', 'Matemática 2° Ciclo',          5, 2),
(8,  'PRI-LEN2', 'Lengua y Literatura 2° Ciclo', 5, 2),
(9,  'PRI-NAT2', 'Ciencias Naturales',           4, 2),
(10, 'PRI-SOC2', 'Ciencias Sociales',            4, 2),
(11, 'PRI-ING2', 'Inglés Primario',              3, 2),
-- Secundario Ciclo Básico (1° y 2° año)
(12, 'SEC-MAT1', 'Matemática I',                 6, 3),
(13, 'SEC-LEN1', 'Lengua y Literatura I',        5, 3),
(14, 'SEC-HIS1', 'Historia',                     4, 3),
(15, 'SEC-GEO1', 'Geografía',                    4, 3),
(16, 'SEC-ING1', 'Inglés',                       4, 3),
(17, 'SEC-BIO1', 'Biología',                     4, 3),
(18, 'SEC-MAT2', 'Matemática II',                6, 3),
(19, 'SEC-LEN2', 'Lengua y Literatura II',       5, 3),
(20, 'SEC-FIS1', 'Física I',                     4, 3),
(21, 'SEC-QUI1', 'Química I',                    4, 3),
-- Secundario Ciclo Orientado (3° a 5°)
(22, 'SEC-MAT3', 'Matemática III',               6, 3),
(23, 'SEC-FIS2', 'Física II',                    5, 3),
(24, 'SEC-QUI2', 'Química II',                   5, 3),
(25, 'SEC-ECO',  'Economía',                     4, 3),
(26, 'SEC-FIL',  'Filosofía',                    3, 3),
(27, 'SEC-LIT',  'Literatura',                   4, 3);

-- 9. Plan de Estudios — materias asignadas a cada curso (curso_materia)
INSERT INTO curso_materia (id_curso, id_materia) VALUES
-- Sala de 3 Años
(1, 1), (1, 2),
-- Sala de 4 Años
(2, 1), (2, 2), (2, 3),
-- Sala de 5 Años / Preescolar
(3, 1), (3, 2), (3, 3),
-- 1° Grado
(4, 4), (4, 5), (4, 6),
-- 2° Grado
(5, 4), (5, 5), (5, 6),
-- 3° Grado
(6, 4), (6, 5), (6, 6),
-- 4° Grado
(7,  7), (7,  8), (7,  9), (7, 10), (7, 11),
-- 5° Grado
(8,  7), (8,  8), (8,  9), (8, 10), (8, 11),
-- 6° Grado
(9,  7), (9,  8), (9,  9), (9, 10), (9, 11),
-- 1° Año Secundaria (Ciclo Básico)
(10, 12), (10, 13), (10, 14), (10, 15), (10, 16), (10, 17),
-- 2° Año Secundaria (Ciclo Básico)
(11, 18), (11, 19), (11, 14), (11, 15), (11, 16), (11, 20), (11, 21),
-- 3° Año (Ciclo Orientado)
(12, 22), (12, 23), (12, 24), (12, 25), (12, 27),
-- 4° Año (Ciclo Orientado)
(13, 22), (13, 23), (13, 24), (13, 25), (13, 26),
-- 5° Año (Ciclo Orientado)
(14, 22), (14, 23), (14, 24), (14, 25), (14, 26), (14, 27);

-- 10. Asignaciones docente-materia-curso iniciales
INSERT INTO asignaciones_docente (id_profesor, id_materia, id_curso) VALUES
(1,  7, 7),  -- Ana López: Matemática 2°Ciclo en 4° Grado
(1, 12, 10), -- Ana López: Matemática I en 1° Año Secundaria
(2, 13, 10), -- Carlos Martínez: Lengua I en 1° Año Secundaria
(2,  8, 7),  -- Carlos Martínez: Lengua 2°Ciclo en 4° Grado
(3,  1, 2),  -- María Suárez: Juego y Exploración en Sala 4 años
(3,  3, 3);  -- María Suárez: Iniciación a la Lectura en Sala 5 años
-- 11. Deportes
INSERT INTO deportes (id_deporte, nombre, id_nivel, dia_semana, hora_inicio, hora_fin, cupo_maximo, id_profesor) VALUES
(1, 'Fútbol',   2, 'Lunes y Miércoles', '15:00:00', '16:30:00', 30, 2),
(2, 'Natación', 2, 'Martes y Jueves',   '15:30:00', '17:00:00', 20, 1),
(3, 'Básquet',  3, 'Lunes y Miércoles', '17:00:00', '18:30:00', 25, 2),
(4, 'Ajedrez',  2, 'Viernes',           '15:00:00', '16:30:00', 15, 1);

-- 12. Calificaciones Iniciales (Boletín de Notas)
INSERT INTO calificaciones (id_alumno, id_materia, trimestre, nota, observacion) VALUES
-- Tomás González (4° Grado Primario)
(1, 7,  1, 8.50, 'Muy buen desempeño en operaciones'),
(1, 7,  2, 9.00, 'Excelente resolución de problemas'),
(1, 8,  1, 9.00, 'Lectura comprensiva destacada'),
(1, 8,  2, 8.50, 'Muy buena redacción'),
(1, 9,  1, 7.50, 'Participación activa en experimentos'),
(1, 9,  2, 8.00, 'Buen trabajo en equipo'),
(1, 10, 1, 8.00, 'Interés en historia y geografía'),
(1, 10, 2, 8.50, 'Excelente exposición oral'),
(1, 11, 1, 9.50, 'Sobresaliente pronunciación'),
(1, 11, 2, 10.00, 'Desempeño bilingüe óptimo'),
-- Sofía González (1° Año Secundaria Ciclo Básico)
(2, 12, 1, 8.50, 'Excelente manejo de álgebra'),
(2, 12, 2, 9.00, 'Evaluación trimestral sobresaliente'),
(2, 13, 1, 9.00, 'Comprensión lectora y análisis crítico'),
(2, 13, 2, 9.50, 'Gran capacidad argumentativa'),
(2, 14, 1, 7.50, 'Buen desarrollo conceptual'),
(2, 14, 2, 8.00, 'Excelente monografía entregada'),
(2, 15, 1, 8.00, 'Correcto análisis cartográfico'),
(2, 15, 2, 8.50, 'Muy buen examen parcial'),
(2, 16, 1, 10.00, 'Nivel bilingüe avanzado'),
(2, 16, 2, 9.50, 'Excelente fluidez en presentaciones'),
(2, 17, 1, 7.00, 'Aprobada, reforzar sistemática biológica'),
(2, 17, 2, 8.00, 'Notable progreso en informe de laboratorio');

-- =============================================================================
-- SINCRONIZACIÓN DE SECUENCIAS SERIAL
-- =============================================================================
SELECT setval(pg_get_serial_sequence('niveles',   'id_nivel'),    COALESCE(MAX(id_nivel),    1)) FROM niveles;
SELECT setval(pg_get_serial_sequence('ciclos',    'id_ciclo'),    COALESCE(MAX(id_ciclo),    1)) FROM ciclos;
SELECT setval(pg_get_serial_sequence('cursos',    'id_curso'),    COALESCE(MAX(id_curso),    1)) FROM cursos;
SELECT setval(pg_get_serial_sequence('usuarios',  'id_usuario'),  COALESCE(MAX(id_usuario),  1)) FROM usuarios;
SELECT setval(pg_get_serial_sequence('alumnos',   'id_alumno'),   COALESCE(MAX(id_alumno),   1)) FROM alumnos;
SELECT setval(pg_get_serial_sequence('profesores','id_profesor'), COALESCE(MAX(id_profesor), 1)) FROM profesores;
SELECT setval(pg_get_serial_sequence('tutores',   'id_tutor'),    COALESCE(MAX(id_tutor),    1)) FROM tutores;
SELECT setval(pg_get_serial_sequence('materias',  'id_materia'),  COALESCE(MAX(id_materia),  1)) FROM materias;
SELECT setval(pg_get_serial_sequence('deportes',  'id_deporte'),  COALESCE(MAX(id_deporte),  1)) FROM deportes;
SELECT setval(pg_get_serial_sequence('calificaciones', 'id_calificacion'), COALESCE(MAX(id_calificacion), 1)) FROM calificaciones;

