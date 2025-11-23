const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// 📦 Configuración de PostgreSQL desde Supabase
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:Bry%23%40n-2025Agro@db.sfwhafqwazaqoklwmsnh.supabase.co:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

// ========================================
// ENDPOINTS PARA LECTURAS DE SENSORES
// ========================================

// ✅ POST /datos => Guarda datos del sensor y estado de las 2 bombas y luces
app.post("/datos", async (req, res) => {
  const { temperatura, humedad, bomba, bomba2, luces } = req.body;

  // Validar datos requeridos
  if (temperatura === undefined || bomba === undefined) {
    return res.status(400).json({ error: "Faltan datos requeridos (temperatura, bomba)" });
  }

  try {
    // Insertar en la nueva tabla normalizada
    await pool.query(
      `INSERT INTO lecturas_sensores (temperatura, humedad, bomba1, bomba2, luces)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        temperatura,
        humedad || 0,
        bomba,
        bomba2 || false,
        luces || false,
      ]
    );

    // OPCIONAL: También insertar en tabla legacy para compatibilidad
    await pool.query(
      `INSERT INTO registros (temperatura, humedad, bomba, bomba2, luces, evento)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        temperatura,
        humedad || 0,
        bomba,
        bomba2 || false,
        luces || false,
        bomba ? "bomba1_encendida" : "bomba1_apagada",
      ]
    );

    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("❌ Error al guardar datos:", err.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ✅ GET /estado => Último registro real (no configuración)
app.get("/estado", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM lecturas_sensores
       ORDER BY fecha DESC
       LIMIT 1`
    );

    // Si no hay datos en la nueva tabla, intentar desde legacy
    if (result.rows.length === 0) {
      const legacyResult = await pool.query(
        `SELECT
          id,
          fecha,
          temperatura,
          humedad,
          bomba as bomba1,
          bomba2,
          luces
         FROM registros
         WHERE temperatura IS NOT NULL
           AND humedad IS NOT NULL
           AND bomba IS NOT NULL
         ORDER BY fecha DESC
         LIMIT 1`
      );
      return res.json(legacyResult.rows[0] || {});
    }

    res.json(result.rows[0] || {});
  } catch (err) {
    console.error("❌ Error al obtener estado:", err.message);
    res.status(500).json({ error: "Error al obtener estado" });
  }
});

// ✅ GET /lecturas => Últimas N lecturas de sensores
app.get("/lecturas", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await pool.query(
      `SELECT * FROM lecturas_sensores ORDER BY fecha DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error al obtener lecturas:", err.message);
    res.status(500).json({ error: "Error al obtener lecturas" });
  }
});

// ========================================
// ENDPOINTS PARA CONFIGURACIÓN DE BOMBAS
// ========================================

// ✅ POST /control => Guarda configuración de riego (BOMBA 1)
app.post("/control", async (req, res) => {
  const { intervalo_on, intervalo_off, numero_bomba } = req.body;

  const bomba = numero_bomba || 1; // Por defecto bomba 1 para compatibilidad

  // Validar datos
  if (!intervalo_on || !intervalo_off) {
    return res.status(400).json({ error: "Faltan datos requeridos (intervalo_on, intervalo_off)" });
  }

  if (intervalo_on <= 0 || intervalo_on > 60 || intervalo_off <= 0 || intervalo_off > 1440) {
    return res.status(400).json({ error: "Intervalos fuera de rango válido" });
  }

  try {
    // Insertar en nueva tabla
    await pool.query(
      `INSERT INTO configuracion_bombas (numero_bomba, intervalo_on, intervalo_off, descripcion, activa)
       VALUES ($1, $2, $3, $4, $5)`,
      [bomba, intervalo_on, intervalo_off, `Configuración actualizada desde dashboard`, true]
    );

    // OPCIONAL: También insertar en tabla legacy
    const evento = bomba === 1 ? "configuracion_actualizada" : "configuracion_bomba2";
    await pool.query(
      `INSERT INTO registros (evento, intervalo_on, intervalo_off)
       VALUES ($1, $2, $3)`,
      [evento, intervalo_on, intervalo_off]
    );

    res.status(200).json({ status: "configuracion_guardada", bomba: bomba });
  } catch (err) {
    console.error("❌ Error al guardar configuración:", err.message);
    res.status(500).json({ error: "Error al guardar configuración" });
  }
});

// ✅ GET /control/:numero_bomba => Obtiene la configuración activa de una bomba
app.get("/control/:numero_bomba", async (req, res) => {
  const numero_bomba = parseInt(req.params.numero_bomba);

  if (![1, 2].includes(numero_bomba)) {
    return res.status(400).json({ error: "Número de bomba inválido (debe ser 1 o 2)" });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM configuracion_bombas
       WHERE numero_bomba = $1 AND activa = TRUE
       ORDER BY fecha DESC
       LIMIT 1`,
      [numero_bomba]
    );

    // Si no hay config en nueva tabla, buscar en legacy
    if (result.rows.length === 0) {
      const evento = numero_bomba === 1 ? "configuracion_actualizada" : "configuracion_bomba2";
      const legacyResult = await pool.query(
        `SELECT intervalo_on, intervalo_off, fecha
         FROM registros
         WHERE evento = $1
           AND intervalo_on IS NOT NULL
           AND intervalo_off IS NOT NULL
         ORDER BY fecha DESC
         LIMIT 1`,
        [evento]
      );

      if (legacyResult.rows.length > 0) {
        return res.json({
          numero_bomba: numero_bomba,
          ...legacyResult.rows[0]
        });
      }

      // Valores por defecto
      const defaults = {
        1: { intervalo_on: 5, intervalo_off: 30 },
        2: { intervalo_on: 3, intervalo_off: 20 }
      };
      return res.json({ numero_bomba, ...defaults[numero_bomba] });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error al obtener configuración:", err.message);
    res.status(500).json({ error: "Error al obtener configuración" });
  }
});

// ========================================
// ENDPOINTS PARA LUCES UV
// ========================================

// ✅ POST /luces => Guarda evento de luces UV (manual o automático)
app.post("/luces", async (req, res) => {
  const { estado, modo, descripcion } = req.body;

  if (estado === undefined || !modo) {
    return res.status(400).json({ error: "Faltan datos requeridos (estado, modo)" });
  }

  try {
    await pool.query(
      `INSERT INTO eventos_luces (estado, modo, descripcion)
       VALUES ($1, $2, $3)`,
      [estado, modo, descripcion || '']
    );
    res.status(200).json({ status: "luz_registrada" });
  } catch (err) {
    console.error("❌ Error al guardar evento de luz:", err.message);
    res.status(500).json({ error: "Error al guardar evento de luz" });
  }
});

// ✅ GET /luces => Últimos N eventos de luces
app.get("/luces", async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await pool.query(
      `SELECT * FROM eventos_luces ORDER BY fecha DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error al obtener eventos de luces:", err.message);
    res.status(500).json({ error: "Error al obtener eventos de luces" });
  }
});

// ✅ GET /luces/config => Devuelve la configuración actual de horario UV
app.get("/luces/config", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM configuracion_luces
       WHERE activa = TRUE
       ORDER BY fecha DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Valor por defecto
      return res.json({ hora_on: 22, hora_off: 2 });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error al obtener configuración de luces:", err.message);
    res.status(500).json({ error: "Error al obtener configuración de luces" });
  }
});

// ✅ POST /luces/config => Guarda configuración de horario UV
app.post("/luces/config", async (req, res) => {
  const { hora_on, hora_off } = req.body;

  if (
    typeof hora_on !== "number" ||
    typeof hora_off !== "number" ||
    hora_on < 0 || hora_on > 23 ||
    hora_off < 0 || hora_off > 23
  ) {
    return res.status(400).json({ error: "Horas inválidas. Deben ser números entre 0 y 23." });
  }

  try {
    await pool.query(
      `INSERT INTO configuracion_luces (hora_on, hora_off, activa)
       VALUES ($1, $2, $3)`,
      [hora_on, hora_off, true]
    );
    res.status(200).json({ status: "config_luces_guardada" });
  } catch (err) {
    console.error("❌ Error al guardar configuración de luces:", err.message);
    res.status(500).json({ error: "Error al guardar configuración de luces" });
  }
});

// ========================================
// ENDPOINTS LEGACY (COMPATIBILIDAD)
// ========================================

// ✅ GET /registros => Últimos registros (legacy - para compatibilidad con ESP32)
app.get("/registros", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM registros ORDER BY fecha DESC LIMIT 10`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error al obtener registros:", err.message);
    res.status(500).json({ error: "Error al obtener registros" });
  }
});

// ========================================
// ENDPOINTS DE MANTENIMIENTO
// ========================================

// ✅ POST /limpiar => Limpia registros antiguos automáticamente
app.post("/limpiar", async (req, res) => {
  try {
    console.log("🧹 Iniciando limpieza de base de datos...");

    // Mantener solo últimos 100 lecturas
    const resultLecturas = await pool.query(
      `DELETE FROM lecturas_sensores
       WHERE id NOT IN (
         SELECT id FROM lecturas_sensores
         ORDER BY fecha DESC
         LIMIT 100
       )`
    );

    // Mantener solo últimos 100 registros legacy
    const resultRegistros = await pool.query(
      `DELETE FROM registros
       WHERE id NOT IN (
         SELECT id FROM registros
         ORDER BY fecha DESC
         LIMIT 100
       )`
    );

    // Mantener solo últimos 50 eventos de luces
    const resultEventos = await pool.query(
      `DELETE FROM eventos_luces
       WHERE id NOT IN (
         SELECT id FROM eventos_luces
         ORDER BY fecha DESC
         LIMIT 50
       )`
    );

    // Mantener solo últimas 5 configuraciones por bomba
    await pool.query(
      `DELETE FROM configuracion_bombas
       WHERE id NOT IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY numero_bomba ORDER BY fecha DESC) as rn
           FROM configuracion_bombas
         ) sub WHERE rn <= 5
       )`
    );

    // Mantener solo últimas 5 configuraciones de luces
    await pool.query(
      `DELETE FROM configuracion_luces
       WHERE id NOT IN (
         SELECT id FROM configuracion_luces
         ORDER BY fecha DESC
         LIMIT 5
       )`
    );

    console.log(`✅ BD limpiada: ${resultLecturas.rowCount} lecturas, ${resultRegistros.rowCount} registros legacy eliminados`);

    res.status(200).json({
      status: "base_datos_limpiada",
      mensaje: "Registros antiguos eliminados correctamente",
      eliminados: {
        lecturas: resultLecturas.rowCount,
        registros_legacy: resultRegistros.rowCount,
        eventos_luces: resultEventos.rowCount
      }
    });
  } catch (err) {
    console.error("❌ Error al limpiar BD:", err.message);
    res.status(500).json({ error: "Error al limpiar base de datos" });
  }
});

// ✅ GET /stats => Obtener estadísticas de la BD
app.get("/stats", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM lecturas_sensores) as total_lecturas,
        (SELECT COUNT(*) FROM registros) as total_registros_legacy,
        (SELECT COUNT(*) FROM eventos_luces) as total_eventos_luces,
        (SELECT COUNT(*) FROM configuracion_bombas) as total_config_bombas,
        (SELECT COUNT(*) FROM configuracion_luces) as total_config_luces
    `);

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error al obtener estadísticas:", err.message);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

// ✅ GET /estado-completo => Vista completa del sistema (nueva funcionalidad)
app.get("/estado-completo", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM vista_estado_actual`);
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error("❌ Error al obtener estado completo:", err.message);
    res.status(500).json({ error: "Error al obtener estado completo" });
  }
});

// ========================================
// LIMPIEZA AUTOMÁTICA
// ========================================

// ✅ Limpieza automática cada 6 horas
setInterval(async () => {
  try {
    console.log("🧹 Limpieza automática de BD iniciada...");

    const resultLecturas = await pool.query(
      `DELETE FROM lecturas_sensores
       WHERE id NOT IN (
         SELECT id FROM lecturas_sensores
         ORDER BY fecha DESC
         LIMIT 100
       )`
    );

    const resultRegistros = await pool.query(
      `DELETE FROM registros
       WHERE id NOT IN (
         SELECT id FROM registros
         ORDER BY fecha DESC
         LIMIT 100
       )`
    );

    await pool.query(
      `DELETE FROM eventos_luces
       WHERE id NOT IN (
         SELECT id FROM eventos_luces
         ORDER BY fecha DESC
         LIMIT 50
       )`
    );

    console.log(`✅ Limpieza automática completada: ${resultLecturas.rowCount + resultRegistros.rowCount} registros eliminados`);
  } catch (err) {
    console.error("❌ Error en limpieza automática:", err.message);
  }
}, 6 * 60 * 60 * 1000); // Cada 6 horas

// ========================================
// HEALTH CHECK
// ========================================

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend funcionando correctamente" });
});

// 🚀 Arrancar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en puerto ${port}`);
  console.log(`🧹 Limpieza automática de BD activada (cada 6 horas)`);
  console.log(`📊 Endpoints disponibles:`);
  console.log(`   POST /datos - Guardar lecturas de sensores`);
  console.log(`   GET  /estado - Obtener último estado`);
  console.log(`   GET  /estado-completo - Vista completa del sistema`);
  console.log(`   GET  /lecturas - Obtener lecturas históricas`);
  console.log(`   POST /control - Guardar configuración de bomba`);
  console.log(`   GET  /control/:numero_bomba - Obtener config de bomba`);
  console.log(`   POST /luces - Registrar evento de luces`);
  console.log(`   GET  /luces - Obtener eventos de luces`);
  console.log(`   POST /luces/config - Guardar configuración de luces`);
  console.log(`   GET  /luces/config - Obtener configuración de luces`);
  console.log(`   POST /limpiar - Limpiar BD manualmente`);
  console.log(`   GET  /stats - Ver estadísticas de BD`);
  console.log(`   GET  /health - Health check`);
});
