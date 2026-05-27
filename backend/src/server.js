const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { cloneRepository, getFileTree, getDependencyFileContent } = require('./services/git.service');
const { generateDockerfile, fixDockerfile } = require('./services/ai.service');
const { saveDockerfile, buildImage, isDockerRunning, isDockerDaemonError, runAndVerifyContainer } = require('./services/docker.service');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend assets in production if they are built
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
    console.log("Production frontend build detected. Serving static assets.");
    app.use(express.static(frontendDistPath));
}

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

        // Check if Docker daemon is running
        const dockerRunning = await isDockerRunning();
        let buildSuccess = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;
        let finalLog = "";

        if (!dockerRunning) {
            console.warn("Docker daemon is offline. Saving generated Dockerfile and skipping the build/auto-fix process.");
            saveDockerfile(tempDir, dockerfile);
            finalLog = "Docker daemon is offline. Please start Docker Desktop/daemon to build the image locally.";
        } else {
            // --- THE AGENTIC BUILD & VERIFICATION LOOP ---
            while (attempts < MAX_ATTEMPTS && !buildSuccess) {
                attempts++;
                console.log(`\n=== Build & Verification Attempt ${attempts} ===`);

                // 1. Save the file
                saveDockerfile(tempDir, dockerfile);

                // 2. Try to build it
                const buildResult = await buildImage(tempDir);

                if (buildResult.success) {
                    console.log("Build Succeeded! Commencing Step 6: Container startup & response verification...");

                    // 3. Try to run and verify it
                    const verifyResult = await runAndVerifyContainer('dockerforge-temp');

                    if (verifyResult.success) {
                        buildSuccess = true;
                        finalLog = `Image built and verified successfully! Details: ${verifyResult.log}`;
                        console.log("Agentic Loop Finished: SUCCESS (Build + Run Verification)!");
                    } else {
                        console.log(`Verification Failed! Error details:\n${verifyResult.errorLog}`);

                        if (attempts < MAX_ATTEMPTS) {
                            console.log(`Sending runtime startup error logs to AI for repair...`);
                            dockerfile = await fixDockerfile(dockerfile, verifyResult.errorLog);
                            console.log(`AI provided an auto-fixed Dockerfile based on startup logs. Retrying...`);
                        } else {
                            finalLog = verifyResult.errorLog;
                            console.log("Agentic Loop Finished: FAILED verification after max attempts.");
                        }
                    }
                } else {
                    console.log(`Build Failed! Error:\n${buildResult.errorLog}`);

                    if (isDockerDaemonError(buildResult.errorLog)) {
                        console.warn("Docker daemon connection error detected mid-build. Skipping AI auto-fix loop.");
                        finalLog = "Docker daemon connection error. Please start Docker Desktop/daemon to build.";
                        break;
                    }

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
        }

        // Send final response to frontend
        res.status(200).json({
            message: buildSuccess
                ? 'Dockerfile generated, built, and verified successfully!'
                : (!dockerRunning || finalLog.includes("Docker daemon")
                    ? 'Dockerfile generated, but local build was skipped/failed because the Docker daemon is offline.'
                    : 'Failed to build/verify after max attempts.'),
            dockerfile: dockerfile,
            buildSuccess: buildSuccess,
            dockerRunning: dockerRunning,
            error: !buildSuccess ? finalLog : null
        });

    } catch (error) {
        console.error("Error in /api/generate:", error);
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend routing for SPA in production if built
if (fs.existsSync(frontendDistPath)) {
    app.get('*any', (req, res) => {
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server is up and running smoothly on http://localhost:${PORT}`);
});