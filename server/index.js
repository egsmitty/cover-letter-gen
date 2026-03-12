require('dotenv').config();
const express = require('express');
const cors = require('cors');
const generateRoute = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '200kb' }));

app.use('/api', generateRoute);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
