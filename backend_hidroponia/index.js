// index.js
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

// ✅ POST /datos => Guarda datos del sensor y estado de la bomba y luces
app.post("/datos", async (req, res) => {
  const { temperatura, humedad, bomba, luces } = req.body;

  try {
    await pool.query(
      `INSERT INTO registros (temperatura, humedad, bomba, luces, evento)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        temperatura,
        humedad,
        bomba,
        luces,
        bomba ? "bomba_encendida" : "bomba_apagada",
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
      `SELECT * FROM registros
       WHERE temperatura IS NOT NULL
         AND humedad IS NOT NULL
         AND bomba IS NOT NULL
       ORDER BY fecha DESC
       LIMIT 1`
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error("❌ Error al obtener estado:", err.message);
    res.status(500).json({ error: "Error al obtener estado" });
  }
});

// ✅ GET /registros => Últimos 10 registros de sensores
app.get("/registros", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM registros ORDER BY fecha DESC LIMIT 10`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener registros" });
  }
});

// ✅ POST /control => Guarda configuración de riego
app.post("/control", async (req, res) => {
  const { intervalo_on, intervalo_off } = req.body;

  try {
    await pool.query(
      `INSERT INTO registros (evento, intervalo_on, intervalo_off)
       VALUES ($1, $2, $3)`,
      ["configuracion_actualizada", intervalo_on, intervalo_off]
    );
    res.status(200).json({ status: "configuracion_guardada" });
  } catch (err) {
    console.error("❌ Error al guardar configuración:", err.message);
    res.status(500).json({ error: "Error al guardar configuración" });
  }
});

// ✅ POST /luces => Guarda evento de luces UV (manual o automático)
app.post("/luces", async (req, res) => {
  const { estado, modo, descripcion } = req.body;

  try {
    await pool.query(
      `INSERT INTO luces_uv (estado, modo, descripcion)
       VALUES ($1, $2, $3)`,
      [estado, modo, descripcion]
    );
    res.status(200).json({ status: "luz_registrada" });
  } catch (err) {
    console.error("❌ Error al guardar evento de luz:", err.message);
    res.status(500).json({ error: "Error al guardar evento de luz" });
  }
});

// ✅ GET /luces => Últimos 10 eventos de luces
app.get("/luces", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM luces_uv ORDER BY fecha DESC LIMIT 10`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener eventos de luces" });
  }
});

// ✅ GET /luces/config => Devuelve la configuración actual de horario UV
app.get("/luces/config", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM luces_config ORDER BY fecha DESC LIMIT 1`
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: "Error al obtener configuración de luces" });
  }
});

// ✅ POST /luces/config => Guarda configuración de horario UV
app.post("/luces/config", async (req, res) => {
  const { hora_on, hora_off } = req.body;

  try {
    await pool.query(
      `INSERT INTO luces_config (hora_on, hora_off)
       VALUES ($1, $2)`,
      [hora_on, hora_off]
    );
    res.status(200).json({ status: "config_luces_guardada" });
  } catch (err) {
    console.error("❌ Error al guardar configuración de luces:", err.message);
    res.status(500).json({ error: "Error al guardar configuración de luces" });
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en puerto ${port}`);
});
