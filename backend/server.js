require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const claimRoutes = require('./routes/claimRoutes');
const userModel = require('./models/userModel');
const catalogModel = require('./models/catalogModel');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (request, response) => {
  response.json({ success: true, message: 'NEW DAY API is running' });
});
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/claims', claimRoutes);

app.use((request, response) => {
  response.status(404).json({ success: false, message: 'Route not found' });
});
app.use(errorHandler);

if (require.main === module) {
  userModel.ensureSeedUsers().then(() => {
    catalogModel.ensureSeedCatalog();
    app.listen(port, () => {
      console.log(`NEW DAY API listening on http://localhost:${port}`);
    });
  });
}

module.exports = app;
