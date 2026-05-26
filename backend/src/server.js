const express = require('express');
const cors = require('cors');
const path = require('path');
const { cloneRepository, getFileTree } = require('./services/git.service');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Endpoint jahan frontend GitHub URL bhejega
app.post('/api/generate', async (req, res) => {
    const { repoUrl } = req.body;

    if (!repoUrl) {
        return res.status(400).json({ error: 'GitHub URL is required' });
    }

    // Ek temporary folder ka path banayenge repo clone karne ke liye
    const tempDir = path.join(__dirname, '../temp-repo');

    try {
        // Step 1: Clone the Repo
        await cloneRepository(repoUrl, tempDir);

        // Step 2: Get File Structure
        const fileTree = getFileTree(tempDir);

        // Abhi ke liye hum sirf file tree frontend ko wapas bhej rahe hain check karne ke liye
        res.status(200).json({
            message: 'Repository cloned successfully!',
            files: fileTree
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is up and running smoothly on http://localhost:${PORT}`);
});