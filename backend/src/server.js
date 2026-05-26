const express = require('express');
const cors = require('cors');
const path = require('path');
const { cloneRepository, getFileTree, getDependencyFileContent } = require('./services/git.service');
const { generateDockerfile, fixDockerfile } = require('./services/ai.service');
const { saveDockerfile, buildImage } = require('./services/docker.service');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/api/generate', async (req, res) => {
    const { repoUrl } = req.body;
    if (!repoUrl) return res.status(400).json({ error: 'GitHub URL is required' });

    const tempDir = path.join(__dirname, '../temp-repo');

    try {
        await cloneRepository(repoUrl, tempDir);
        const fileTree = getFileTree(tempDir);
        const dependencyFile = getDependencyFileContent(tempDir);

        console.log("Requesting AI to generate initial Dockerfile...");
        let dockerfile = await generateDockerfile(fileTree, dependencyFile);

        // --- THE AGENTIC BUILD LOOP ---
        let buildSuccess = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;
        let finalLog = "";

        while (attempts < MAX_ATTEMPTS && !buildSuccess) {
            attempts++;
            console.log(`\n=== Build Attempt ${attempts} ===`);

            // 1. Save the file
            saveDockerfile(tempDir, dockerfile);

            // 2. Try to build it
            const buildResult = await buildImage(tempDir);

            if (buildResult.success) {
                buildSuccess = true;
                finalLog = "Image built successfully without errors!";
                console.log("Agentic Loop Finished: SUCCESS!");
            } else {
                console.log(`Build Failed! Error:\n${buildResult.errorLog}`);
                if (attempts < MAX_ATTEMPTS) {
                    console.log(`Sending error to AI for auto-fix...`);
                    dockerfile = await fixDockerfile(dockerfile, buildResult.errorLog);
                    console.log(`AI provided a fixed Dockerfile. Retrying...`);
                } else {
                    finalLog = buildResult.errorLog;
                    console.log("Agentic Loop Finished: FAILED after max attempts.");
                }
            }
        }

        // Send final response to frontend
        res.status(200).json({
            message: buildSuccess ? 'Dockerfile generated and built successfully!' : 'Failed to build after max attempts.',
            dockerfile: dockerfile,
            buildSuccess: buildSuccess
        });

    } catch (error) {
        console.error("Error in /api/generate:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is up and running smoothly on http://localhost:${PORT}`);
});