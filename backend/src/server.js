const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic health check route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'DockerForge API is running!' });
});

app.listen(PORT, () => {
    console.log(`Server is up and running smoothly on http://localhost:${PORT}`);
});