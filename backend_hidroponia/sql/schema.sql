-- ========================================
-- SCHEMA COMPLETO - SISTEMA HIDROPÓNICO
-- ========================================
-- Estructura normalizada para soportar:
-- - 2 bombas de riego independientes
-- - Sensores de temperatura y humedad
-- - Control de luces UV
-- - Configuraciones por bomba
-- - Historial de eventos

-- ========================================
-- 1. TABLA DE LECTURAS DE SENSORES
-- ========================================
-- Almacena las lecturas de sensores (temperatura, humedad)
-- y estados de actuadores (bombas, luces) en tiempo real

CREATE TABLE IF NOT EXISTS lecturas_sensores (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  temperatura FLOAT NOT NULL,
  humedad FLOAT DEFAULT 0,
  bomba1 BOOLEAN NOT NULL DEFAULT FALSE,
  bomba2 BOOLEAN NOT NULL DEFAULT FALSE,
  luces BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT check_temperatura CHECK (temperatura >= -50 AND temperatura <= 85),
  CONSTRAINT check_humedad CHECK (humedad >= 0 AND humedad <= 100)
);

-- Índice para consultas rápidas por fecha
CREATE INDEX IF NOT EXISTS idx_lecturas_fecha ON lecturas_sensores(fecha DESC);

-- ========================================
-- 2. TABLA DE CONFIGURACIÓN DE BOMBAS
-- ========================================
-- Almacena la configuración de intervalos ON/OFF
-- para cada bomba de forma independiente

CREATE TABLE IF NOT EXISTS configuracion_bombas (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  numero_bomba INTEGER NOT NULL CHECK (numero_bomba IN (1, 2)),
  intervalo_on INTEGER NOT NULL CHECK (intervalo_on > 0 AND intervalo_on <= 60),
  intervalo_off INTEGER NOT NULL CHECK (intervalo_off > 0 AND intervalo_off <= 1440),
  descripcion TEXT,
  activa BOOLEAN DEFAULT TRUE
);

-- Índice para obtener configuración activa rápidamente
CREATE INDEX IF NOT EXISTS idx_config_bomba_activa ON configuracion_bombas(numero_bomba, activa, fecha DESC);

-- ========================================
-- 3. TABLA DE EVENTOS DE LUCES UV
-- ========================================
-- Registra cada cambio de estado de las luces UV
-- (manual o automático)

CREATE TABLE IF NOT EXISTS eventos_luces (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  estado BOOLEAN NOT NULL,
  modo VARCHAR(20) NOT NULL CHECK (modo IN ('manual', 'auto')),
  descripcion TEXT
);

-- Índice para consultas por fecha
CREATE INDEX IF NOT EXISTS idx_eventos_luces_fecha ON eventos_luces(fecha DESC);

-- ========================================
-- 4. TABLA DE CONFIGURACIÓN DE LUCES UV
-- ========================================
-- Almacena los horarios de encendido/apagado automático
-- de las luces UV

CREATE TABLE IF NOT EXISTS configuracion_luces (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hora_on INTEGER NOT NULL CHECK (hora_on >= 0 AND hora_on <= 23),
  hora_off INTEGER NOT NULL CHECK (hora_off >= 0 AND hora_off <= 23),
  activa BOOLEAN DEFAULT TRUE
);

-- Índice para obtener configuración activa rápidamente
CREATE INDEX IF NOT EXISTS idx_config_luces_activa ON configuracion_luces(activa, fecha DESC);

-- ========================================
-- 5. TABLA DE REGISTROS GENERALES (LEGACY)
-- ========================================
-- Tabla para mantener compatibilidad con código existente
-- Puede eliminarse después de la migración completa

CREATE TABLE IF NOT EXISTS registros (
  id SERIAL PRIMARY KEY,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  temperatura FLOAT,
  humedad FLOAT,
  bomba BOOLEAN,
  bomba2 BOOLEAN,
  luces BOOLEAN,
  evento VARCHAR(100),
  intervalo_on INTEGER,
  intervalo_off INTEGER
);

-- Índice para consultas por fecha
CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros(fecha DESC);

-- ========================================
-- 6. VISTA PARA ÚLTIMO ESTADO DEL SISTEMA
-- ========================================
-- Vista que combina la última lectura de sensores
-- con las configuraciones activas

CREATE OR REPLACE VIEW vista_estado_actual AS
SELECT
  l.id,
  l.fecha,
  l.temperatura,
  l.humedad,
  l.bomba1,
  l.bomba2,
  l.luces,
  cb1.intervalo_on as bomba1_intervalo_on,
  cb1.intervalo_off as bomba1_intervalo_off,
  cb2.intervalo_on as bomba2_intervalo_on,
  cb2.intervalo_off as bomba2_intervalo_off,
  cl.hora_on as luces_hora_on,
  cl.hora_off as luces_hora_off
FROM lecturas_sensores l
LEFT JOIN LATERAL (
  SELECT intervalo_on, intervalo_off
  FROM configuracion_bombas
  WHERE numero_bomba = 1 AND activa = TRUE
  ORDER BY fecha DESC LIMIT 1
) cb1 ON TRUE
LEFT JOIN LATERAL (
  SELECT intervalo_on, intervalo_off
  FROM configuracion_bombas
  WHERE numero_bomba = 2 AND activa = TRUE
  ORDER BY fecha DESC LIMIT 1
) cb2 ON TRUE
LEFT JOIN LATERAL (
  SELECT hora_on, hora_off
  FROM configuracion_luces
  WHERE activa = TRUE
  ORDER BY fecha DESC LIMIT 1
) cl ON TRUE
ORDER BY l.fecha DESC
LIMIT 1;

-- ========================================
-- COMENTARIOS SOBRE LA ESTRUCTURA
-- ========================================
/*
Esta estructura normalizada ofrece:

1. SEPARACIÓN DE RESPONSABILIDADES:
   - Datos de sensores separados de configuraciones
   - Cada bomba tiene su propia configuración
   - Eventos de luces separados de su configuración

2. INTEGRIDAD DE DATOS:
   - Constraints para validar rangos de valores
   - Índices para consultas rápidas
   - Campos NOT NULL donde sea necesario

3. ESCALABILIDAD:
   - Fácil agregar más bombas (solo modificar CHECK constraint)
   - Fácil agregar más tipos de sensores
   - Historial completo de cambios de configuración

4. RENDIMIENTO:
   - Índices en campos frecuentemente consultados
   - Vista materializada para estado actual
   - Consultas optimizadas

5. COMPATIBILIDAD:
   - Tabla 'registros' legacy mantenida temporalmente
   - Migración gradual posible
*/
