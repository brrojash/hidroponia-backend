// index.js (Backend completo)
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// 📦 Configuración de PostgreSQL desde Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:Bry%23%40n-2025Agro@db.sfwhafqwazaqoklwmsnh.supabase.co:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

// ✅ POST /datos => Guarda sensor + estado bomba
app.post("/datos", async (req, res) => {
  const { temperatura, humedad, bomba } = req.body;

  try {
    await pool.query(
      `INSERT INTO registros (temperatura, humedad, bomba, evento)
       VALUES ($1, $2, $3, $4)`,
      [temperatura, humedad, bomba, bomba ? "bomba_encendida" : "bomba_apagada"]
    );
    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("❌ Error al guardar datos:", err.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ✅ GET /estado => Último registro
app.get("/estado", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM registros ORDER BY fecha DESC LIMIT 1`
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: "Error al obtener estado" });
  }
});

// ✅ GET /registros => Últimos 10 registros
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

// ✅ POST /control => Guarda configuración de intervalos
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

app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});
