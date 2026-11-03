/* server.js */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create / open database
const db = new sqlite3.Database('./chronic.db');

// Create tables
db.run(`
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dob TEXT,
  gender TEXT,
  medical_record TEXT
)`);

db.run(`
CREATE TABLE IF NOT EXISTS measures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  condition_key TEXT NOT NULL,
  measurement_type TEXT NOT NULL,
  value REAL NOT NULL,
  taken_at TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY(patient_id) REFERENCES patients(id)
)`);

// API test
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Create patient
app.post('/api/patients', (req, res) => {
  const { name, dob, gender, medical_record } = req.body;

  db.run(
    `INSERT INTO patients (name, dob, gender, medical_record) VALUES (?, ?, ?, ?)`,
    [name, dob, gender, medical_record],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        id: this.lastID,
        name,
        dob,
        gender,
        medical_record
      });
    }
  );
});

// Get all patients
app.get('/api/patients', (req, res) => {
  db.all(`SELECT * FROM patients ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add measurement
app.post('/api/measures', (req, res) => {
  const { patient_id, condition_key, measurement_type, value, taken_at } = req.body;

  const t = taken_at || new Date().toISOString();

  db.run(
    `INSERT INTO measures (patient_id, condition_key, measurement_type, value, taken_at)
     VALUES (?, ?, ?, ?, ?)`,
    [patient_id, condition_key, measurement_type, value, t],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        id: this.lastID,
        patient_id,
        condition_key,
        measurement_type,
        value,
        taken_at: t
      });
    }
  );
});

// Get measurements by patient
app.get('/api/measures/:patient_id', (req, res) => {
  const pid = req.params.patient_id;
  const { measurement_type } = req.query;

  let query = `SELECT * FROM measures WHERE patient_id = ?`;
  const params = [pid];

  if (measurement_type) {
    query += ` AND measurement_type = ?`;
    params.push(measurement_type);
  }

  query += ` ORDER BY datetime(taken_at) ASC`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Serve UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
