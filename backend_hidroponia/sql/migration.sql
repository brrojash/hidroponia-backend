-- ========================================
-- SCRIPT DE MIGRACIÓN DE DATOS
-- ========================================
-- Migra datos de la estructura antigua a la nueva
-- Ejecutar DESPUÉS de crear el schema.sql

-- ========================================
-- 1. MIGRAR LECTURAS DE SENSORES
-- ========================================
-- Copia registros que tienen datos de sensores

INSERT INTO lecturas_sensores (fecha, temperatura, humedad, bomba1, bomba2, luces)
SELECT
  fecha,
  COALESCE(temperatura, 0) as temperatura,
  COALESCE(humedad, 0) as humedad,
  COALESCE(bomba, FALSE) as bomba1,
  COALESCE(bomba2, FALSE) as bomba2,
  COALESCE(luces, FALSE) as luces
FROM registros
WHERE temperatura IS NOT NULL
  AND fecha IS NOT NULL
ON CONFLICT DO NOTHING;

-- ========================================
-- 2. MIGRAR CONFIGURACIONES DE BOMBAS
-- ========================================
-- Extrae configuraciones de bomba 1

INSERT INTO configuracion_bombas (fecha, numero_bomba, intervalo_on, intervalo_off, descripcion, activa)
SELECT
  fecha,
  1 as numero_bomba,
  intervalo_on,
  intervalo_off,
  'Migrado desde registros - configuracion_actualizada' as descripcion,
  TRUE as activa
FROM registros
WHERE evento = 'configuracion_actualizada'
  AND intervalo_on IS NOT NULL
  AND intervalo_off IS NOT NULL
  AND intervalo_on > 0
  AND intervalo_off > 0
ORDER BY fecha ASC
ON CONFLICT DO NOTHING;

-- Extrae configuraciones de bomba 2 (si existen)

INSERT INTO configuracion_bombas (fecha, numero_bomba, intervalo_on, intervalo_off, descripcion, activa)
SELECT
  fecha,
  2 as numero_bomba,
  intervalo_on,
  intervalo_off,
  'Migrado desde registros - configuracion_bomba2' as descripcion,
  TRUE as activa
FROM registros
WHERE evento = 'configuracion_bomba2'
  AND intervalo_on IS NOT NULL
  AND intervalo_off IS NOT NULL
  AND intervalo_on > 0
  AND intervalo_off > 0
ORDER BY fecha ASC
ON CONFLICT DO NOTHING;

-- Si no hay configuración para bomba 2, crear una por defecto
INSERT INTO configuracion_bombas (numero_bomba, intervalo_on, intervalo_off, descripcion, activa)
SELECT 2, 3, 20, 'Configuración por defecto - bomba 2', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM configuracion_bombas WHERE numero_bomba = 2
);

-- Si no hay configuración para bomba 1, crear una por defecto
INSERT INTO configuracion_bombas (numero_bomba, intervalo_on, intervalo_off, descripcion, activa)
SELECT 1, 5, 30, 'Configuración por defecto - bomba 1', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM configuracion_bombas WHERE numero_bomba = 1
);

-- ========================================
-- 3. MIGRAR EVENTOS DE LUCES
-- ========================================
-- Si existe la tabla luces_uv antigua, migrar sus datos

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'luces_uv') THEN
    INSERT INTO eventos_luces (fecha, estado, modo, descripcion)
    SELECT fecha, estado, modo, descripcion
    FROM luces_uv
    ORDER BY fecha ASC
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ========================================
-- 4. MIGRAR CONFIGURACIÓN DE LUCES
-- ========================================
-- Si existe la tabla luces_config antigua, migrar sus datos

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'luces_config') THEN
    INSERT INTO configuracion_luces (fecha, hora_on, hora_off, activa)
    SELECT fecha, hora_on, hora_off, TRUE
    FROM luces_config
    ORDER BY fecha ASC
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Si no hay configuración de luces, crear una por defecto
INSERT INTO configuracion_luces (hora_on, hora_off, activa)
SELECT 22, 2, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM configuracion_luces
);

-- ========================================
-- 5. VERIFICACIÓN DE MIGRACIÓN
-- ========================================
-- Muestra estadísticas de la migración

DO $$
DECLARE
  count_lecturas INTEGER;
  count_config_b1 INTEGER;
  count_config_b2 INTEGER;
  count_eventos_luces INTEGER;
  count_config_luces INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_lecturas FROM lecturas_sensores;
  SELECT COUNT(*) INTO count_config_b1 FROM configuracion_bombas WHERE numero_bomba = 1;
  SELECT COUNT(*) INTO count_config_b2 FROM configuracion_bombas WHERE numero_bomba = 2;
  SELECT COUNT(*) INTO count_eventos_luces FROM eventos_luces;
  SELECT COUNT(*) INTO count_config_luces FROM configuracion_luces;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'RESUMEN DE MIGRACIÓN';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Lecturas de sensores migradas: %', count_lecturas;
  RAISE NOTICE 'Configuraciones bomba 1: %', count_config_b1;
  RAISE NOTICE 'Configuraciones bomba 2: %', count_config_b2;
  RAISE NOTICE 'Eventos de luces migrados: %', count_eventos_luces;
  RAISE NOTICE 'Configuraciones de luces: %', count_config_luces;
  RAISE NOTICE '========================================';
END $$;

-- ========================================
-- NOTAS IMPORTANTES
-- ========================================
/*
DESPUÉS DE EJECUTAR ESTA MIGRACIÓN:

1. Verificar que los datos se migraron correctamente
2. Probar la aplicación con la nueva estructura
3. Una vez confirmado que todo funciona, puedes:
   - Renombrar la tabla 'registros' a 'registros_backup'
   - O eliminarla si ya no la necesitas

Para hacer backup de la tabla antigua:
  ALTER TABLE registros RENAME TO registros_backup;
  ALTER TABLE luces_uv RENAME TO luces_uv_backup;
  ALTER TABLE luces_config RENAME TO luces_config_backup;

Para eliminar las tablas antiguas (CUIDADO - permanente):
  DROP TABLE IF EXISTS registros;
  DROP TABLE IF EXISTS luces_uv;
  DROP TABLE IF EXISTS luces_config;
*/
