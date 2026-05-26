const express = require('express');
const cors = require('cors');
const path = require('path');
const { cloneRepository, getFileTree, getDependencyFileContent } = require('./services/git.service');
const { generateDockerfile } = require('./services/ai.service');
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

    const tempDir = path.join(__dirname, '../temp-repo');

    try {
        // Step 1: Clone the Repo
        await cloneRepository(repoUrl, tempDir);

        // Step 2: Get File Structure & Dependencies
        const fileTree = getFileTree(tempDir);
        const dependencyFile = getDependencyFileContent(tempDir);

        // Step 3: Generate Dockerfile via Gemini
        console.log("Requesting AI to generate Dockerfile...");
        const dockerfile = await generateDockerfile(fileTree, dependencyFile);
        console.log("Dockerfile generated successfully!");

        // Frontend ko finally generated Dockerfile bhej rahe hain
        res.status(200).json({
            message: 'Dockerfile generated successfully!',
            dockerfile: dockerfile
        });

    } catch (error) {
        console.error("Error in /api/generate:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is up and running smoothly on http://localhost:${PORT}`);
});