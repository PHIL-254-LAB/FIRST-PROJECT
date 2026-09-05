require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*'
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (request, response) => {
  response.json({ success: true, message: 'NEW DAY API is running' });
});
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);

app.use((request, response) => {
  response.status(404).json({ success: false, message: 'Route not found' });
});
app.use(errorHandler);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`NEW DAY API listening on http://localhost:${port}`);
  });
}

module.exports = app;
