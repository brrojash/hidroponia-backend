
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/datos', async (req, res) => {
  try {
    const { temperatura, humedad, bomba } = req.body;
    if (temperatura == null || humedad == null || bomba == null) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    await pool.query(
      'INSERT INTO registros (temperatura, humedad, bomba) VALUES ($1, $2, $3)',
      [temperatura, humedad, bomba]
    );
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/', (req, res) => {
  res.send('API Hidroponía online');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
