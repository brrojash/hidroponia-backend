const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Configuración de conexión PostgreSQL desde variable de entorno
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Ruta principal
app.get("/", (req, res) => {
  res.send("API Hidroponía online");
});

// Endpoint para recibir datos desde la ESP32
app.post("/datos", async (req, res) => {
  try {
    const { temperatura, humedad, bomba } = req.body;

    if (
      temperatura === undefined ||
      humedad === undefined ||
      bomba === undefined
    ) {
      return res.status(400).json({ error: "Faltan datos en el cuerpo." });
    }

    const query = `
      INSERT INTO registros (temperatura, humedad, bomba)
      VALUES ($1, $2, $3)
    `;
    await pool.query(query, [temperatura, humedad, bomba]);

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Error al insertar datos:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 🔍 GET /estado → Último registro
app.get("/estado", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM registros
      ORDER BY fecha DESC
      LIMIT 1
    `);
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error("Error al obtener el estado:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 📊 GET /registros → Últimos 10 registros
app.get("/registros", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM registros
      ORDER BY fecha DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener registros:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ⚡ POST /control → Cambiar estado de la bomba
app.post("/control", async (req, res) => {
  try {
    const { bomba } = req.body;

    if (bomba === undefined) {
      return res.status(400).json({ error: "Debe enviar 'bomba'" });
    }

    const query = `
      INSERT INTO registros (temperatura, humedad, bomba)
      VALUES (NULL, NULL, $1)
    `;
    await pool.query(query, [bomba]);
    res.json({ status: "bomba actualizada", estado: bomba });
  } catch (error) {
    console.error("Error al cambiar estado de bomba:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en puerto ${port}`);
});
