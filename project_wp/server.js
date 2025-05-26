const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');


const app = express();
app.use(cors());
app.use(bodyParser.json());

// DB Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'booknook'
});

db.connect(err => {
  if (err) throw err;
  console.log('MySQL Connected...');
});

// Save purchase
app.post('/api/purchase', (req, res) => {
    console.log("Received POST /api/purchase with body:", req.body);
  
    const { title, author, price, image } = req.body;
  
    // Optional: Basic validation
    if (!title || !author || !price) {
      return res.status(400).send("Missing required fields");
    }
  
    const sql = 'INSERT INTO purchases (title, author, price, image) VALUES (?, ?, ?, ?)';
    db.query(sql, [title, author, price, image], (err, result) => {
      if (err) {
        console.error("DB Error:", err); // Log MySQL error
        return res.status(500).send("Error inserting data into database");
      }
      res.send({ message: "Purchase recorded!" });
    });
  });
  

// Get all purchases
app.get('/api/purchases', (req, res) => {
  db.query('SELECT * FROM purchases ORDER BY purchased_at DESC', (err, results) => {
    if (err) return res.status(500).send('Error fetching data');
    res.send(results);
  });
});

app.use(express.static(path.join(__dirname, 'public')));


app.listen(3000, () => console.log('Server running on port 3000'));
