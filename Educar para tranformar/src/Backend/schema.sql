-- =============================================================================
-- ESQUEMA DE BASE DE DATOS POSTGRESQL - PROYECTO "EDUCAR PARA TRANSFORMAR"
-- Metodología de Sistemas II - UTN TUP
-- Compatible con PostgreSQL 14+ (Neon.tech / Supabase / Local)
-- =============================================================================

-- Eliminar tablas previas en orden inverso de dependencias si se re-ejecuta
DROP TABLE IF EXISTS inscripciones_transporte CASCADE;
DROP TABLE IF EXISTS inscripciones_deporte CASCADE;
DROP TABLE IF EXISTS deportes CASCADE;
DROP TABLE IF EXISTS asignaciones_docente CASCADE;
DROP TABLE IF EXISTS materias CASCADE;
DROP TABLE IF EXISTS tutor_alumno CASCADE;
DROP TABLE IF EXISTS tutores CASCADE;
DROP TABLE IF EXISTS profesores CASCADE;
DROP TABLE IF EXISTS alumnos CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS cursos CASCADE;
DROP TABLE IF EXISTS niveles CASCADE;

-- -----------------------------------------------------------------------------
-- 1. Niveles Educativos
-- -----------------------------------------------------------------------------
CREATE TABLE niveles (
    id_nivel SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE -- 'Inicial', 'Primario', 'Secundario'
);

-- -----------------------------------------------------------------------------
-- 2. Cursos / Divisiones
-- -----------------------------------------------------------------------------
CREATE TABLE cursos (
    id_curso SERIAL PRIMARY KEY,
    id_nivel INT NOT NULL REFERENCES niveles(id_nivel) ON DELETE RESTRICT,
    nombre VARCHAR(50) NOT NULL -- Ej: '1° Grado A', '3° Año B'
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
-- 8. Materias
-- -----------------------------------------------------------------------------
CREATE TABLE materias (
    id_materia SERIAL PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    carga_horaria INT NOT NULL DEFAULT 4, -- Horas semanales o cátedra
    id_nivel INT NOT NULL REFERENCES niveles(id_nivel) ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- 9. Asignación Académica Docente-Materia-Curso (HU-04)
-- Garantiza que una materia en un curso tenga solo un docente asignado (UNIQUE)
-- -----------------------------------------------------------------------------
CREATE TABLE asignaciones_docente (
    id_asignacion SERIAL PRIMARY KEY,
    id_profesor INT NOT NULL REFERENCES profesores(id_profesor) ON DELETE CASCADE,
    id_materia INT NOT NULL REFERENCES materias(id_materia) ON DELETE CASCADE,
    id_curso INT REFERENCES cursos(id_curso) ON DELETE CASCADE,
    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_materia_curso UNIQUE (id_materia, id_curso)
);

-- -----------------------------------------------------------------------------
-- 10. Catálogo de Deportes (HU-02)
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
-- 11. Inscripción a Deportes (HU-02)
-- Un alumno no puede inscribirse dos veces al mismo deporte (UNIQUE)
-- -----------------------------------------------------------------------------
CREATE TABLE inscripciones_deporte (
    id_inscripcion SERIAL PRIMARY KEY,
    id_alumno INT NOT NULL REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
    id_deporte INT NOT NULL REFERENCES deportes(id_deporte) ON DELETE RESTRICT,
    fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_alumno_deporte UNIQUE (id_alumno, id_deporte)
);

-- -----------------------------------------------------------------------------
-- 12. Inscripción a Transporte Escolar (HU-03)
-- El alumno solo puede tener 1 registro activo de transporte (UNIQUE en id_alumno)
-- -----------------------------------------------------------------------------
CREATE TABLE inscripciones_transporte (
    id_transporte SERIAL PRIMARY KEY,
    id_alumno INT NOT NULL UNIQUE REFERENCES alumnos(id_alumno) ON DELETE CASCADE,
    recorrido_numero INT NOT NULL CHECK (recorrido_numero BETWEEN 1 AND 4),
    zona VARCHAR(50) NOT NULL, -- 'Norte', 'Sur', 'Este', 'Oeste'
    parada VARCHAR(100) NOT NULL,
    fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =============================================================================
-- DATOS SEMILLA INICIALES (SEED DATA PARA PRUEBAS)
-- Contraseña de todos los usuarios de prueba: 1234
-- Hash bcrypt correspondiente: $2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC
-- =============================================================================

-- Niveles
INSERT INTO niveles (id_nivel, nombre) VALUES
(1, 'Inicial'),
(2, 'Primario'),
(3, 'Secundario');

-- Cursos
INSERT INTO cursos (id_curso, id_nivel, nombre) VALUES
(1, 2, '4° Grado Primaria'),
(2, 2, '5° Grado Primaria'),
(3, 3, '1° Año Secundaria'),
(4, 3, '2° Año Secundaria');

-- Usuarios
INSERT INTO usuarios (id_usuario, email, password_hash, rol, nombre, apellido) VALUES
(1, 'admin@novasys.edu.ar', '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'ADMIN', 'Administrador', 'General'),
(2, 'ana.lopez@novasys.edu.ar', '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'DOCENTE', 'Ana', 'López'),
(3, 'carlos.martinez@novasys.edu.ar', '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'DOCENTE', 'Carlos', 'Martínez'),
(4, 'jose.tutor@novasys.edu.ar', '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'PADRE', 'José', 'González'),
(5, 'lucas.alumno@novasys.edu.ar', '$2b$10$XlP548.3uLismZruPiB73egMaDXAUe90yZzkN7waR86n04zEgjaVC', 'ESTUDIANTE', 'Lucas', 'Fernández');

-- Profesores
INSERT INTO profesores (id_profesor, legajo, dni, nombre, apellido, especialidad, telefono, id_usuario) VALUES
(1, 'D001', '28111222', 'Ana', 'López', 'Matemáticas y Ciencias', '3624112233', 2),
(2, 'D002', '30333444', 'Carlos', 'Martínez', 'Lengua y Literatura', '3624556677', 3);

-- Alumnos
INSERT INTO alumnos (id_alumno, legajo, dni, nombre, apellido, fecha_nacimiento, id_curso, id_usuario) VALUES
(1, 'A001', '48123456', 'Tomás', 'González', '2014-05-12', 1, 5),
(2, 'A002', '45987654', 'Sofía', 'González', '2009-08-20', 3, NULL);

-- Tutor y relación con hijos
INSERT INTO tutores (id_tutor, dni, nombre, apellido, telefono, id_usuario) VALUES
(1, '22999888', 'José', 'González', '3624998877', 4);

INSERT INTO tutor_alumno (id_tutor, id_alumno, parentesco) VALUES
(1, 1, 'PADRE'),
(1, 2, 'PADRE');

-- Materias
INSERT INTO materias (id_materia, codigo, nombre, carga_horaria, id_nivel) VALUES
(1, 'MAT-PRI-4', 'Matemática 4°', 5, 2),
(2, 'LEN-PRI-4', 'Lengua 4°', 5, 2),
(3, 'CIE-PRI-4', 'Ciencias Naturales 4°', 4, 2),
(4, 'MAT-SEC-1', 'Matemática I', 6, 3),
(5, 'FIS-SEC-1', 'Física I', 4, 3),
(6, 'LIT-SEC-1', 'Literatura I', 5, 3);

-- Asignación inicial
INSERT INTO asignaciones_docente (id_profesor, id_materia, id_curso) VALUES
(1, 1, 1), -- Ana López asignada a Matemática 4° en 4to Primaria
(2, 6, 3); -- Carlos Martínez asignado a Literatura I en 1ro Secundaria

-- Deportes
INSERT INTO deportes (id_deporte, nombre, id_nivel, dia_semana, hora_inicio, hora_fin, cupo_maximo, id_profesor) VALUES
(1, 'Fútbol', 2, 'Lunes y Miércoles', '15:00:00', '16:30:00', 30, 2),
(2, 'Natación', 2, 'Martes y Jueves', '15:30:00', '17:00:00', 20, 1),
(3, 'Básquet', 3, 'Lunes y Miércoles', '17:00:00', '18:30:00', 25, 2),
(4, 'Ajedrez', 2, 'Viernes', '15:00:00', '16:30:00', 15, 1);

-- Sincronizar secuencias automáticas SERIAL para que los próximos INSERT no colisionen
SELECT setval(pg_get_serial_sequence('usuarios', 'id_usuario'), COALESCE(MAX(id_usuario), 1)) FROM usuarios;
SELECT setval(pg_get_serial_sequence('alumnos', 'id_alumno'), COALESCE(MAX(id_alumno), 1)) FROM alumnos;
SELECT setval(pg_get_serial_sequence('profesores', 'id_profesor'), COALESCE(MAX(id_profesor), 1)) FROM profesores;
SELECT setval(pg_get_serial_sequence('tutores', 'id_tutor'), COALESCE(MAX(id_tutor), 1)) FROM tutores;
SELECT setval(pg_get_serial_sequence('materias', 'id_materia'), COALESCE(MAX(id_materia), 1)) FROM materias;
SELECT setval(pg_get_serial_sequence('cursos', 'id_curso'), COALESCE(MAX(id_curso), 1)) FROM cursos;
SELECT setval(pg_get_serial_sequence('deportes', 'id_deporte'), COALESCE(MAX(id_deporte), 1)) FROM deportes;

