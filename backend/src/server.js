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

// Serve static frontend assets in production if they have been built
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
    console.log('Production frontend build detected. Serving static assets.');
    app.use(express.static(frontendDistPath));
}

/**
 * Validates that the provided string is a well-formed public GitHub repository URL.
 * Accepts: https://github.com/owner/repo (with or without trailing slash / .git)
 */
function isValidGitHubUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'github.com') return false;
        // Path must be /owner/repo — at least two non-empty segments
        const parts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
        return parts.length >= 2;
    } catch {
        return false;
    }
}

/**
 * POST /api/generate
 * Accepts a public GitHub repository URL, clones it, analyzes its structure,
 * generates an optimized Dockerfile using the Gemini LLM, and validates it
 * through an agentic build + run verification loop (up to 3 repair attempts).
 */
app.post('/api/generate', async (req, res) => {
    const { repoUrl } = req.body;

    if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
        return res.status(400).json({ error: 'A GitHub repository URL is required.' });
    }

    if (!isValidGitHubUrl(repoUrl.trim())) {
        return res.status(400).json({
            error: 'Invalid URL. Please provide a valid public GitHub repository URL (e.g., https://github.com/owner/repo).'
        });
    }

    const tempDir = path.join(__dirname, '../temp-repo');

    try {
        // Step 1: Clone the repository
        await cloneRepository(repoUrl.trim(), tempDir);

        // Step 2: Analyze the repository structure and dependencies
        const fileTree = getFileTree(tempDir);
        const dependencyFile = getDependencyFileContent(tempDir);

        // Step 3: Generate the initial Dockerfile using the LLM
        console.log('Requesting AI to generate initial Dockerfile...');
        let dockerfile = await generateDockerfile(fileTree, dependencyFile);

        // Step 4: Determine if Docker daemon is available for build validation
        const dockerRunning = await isDockerRunning();
        let buildSuccess = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;
        let finalLog = '';

        if (!dockerRunning) {
            console.warn('Docker daemon is offline. Saving Dockerfile and skipping build validation.');
            saveDockerfile(tempDir, dockerfile);
            finalLog = 'Docker daemon is offline. Please start Docker Desktop to build the image locally.';
        } else {
            // --- AGENTIC BUILD & VERIFICATION LOOP ---
            while (attempts < MAX_ATTEMPTS && !buildSuccess) {
                attempts++;
                console.log(`\n=== Build & Verification Attempt ${attempts}/${MAX_ATTEMPTS} ===`);

                // Write the current Dockerfile to disk
                saveDockerfile(tempDir, dockerfile);

                // Attempt to build the Docker image
                const buildResult = await buildImage(tempDir);

                if (buildResult.success) {
                    console.log('Build succeeded. Running container verification...');

                    // Attempt to run the image and verify it stays healthy
                    const verifyResult = await runAndVerifyContainer('dockerforge-temp');

                    if (verifyResult.success) {
                        buildSuccess = true;
                        finalLog = `Image built and verified successfully. ${verifyResult.log}`;
                        console.log('Agentic loop complete: BUILD + RUN SUCCESS.');
                    } else {
                        console.log(`Container verification failed:\n${verifyResult.errorLog}`);

                        if (attempts < MAX_ATTEMPTS) {
                            console.log('Sending runtime crash logs to AI for self-repair...');
                            dockerfile = await fixDockerfile(dockerfile, verifyResult.errorLog);
                            console.log('AI returned a repaired Dockerfile. Retrying build...');
                        } else {
                            finalLog = verifyResult.errorLog;
                            console.log('Agentic loop complete: FAILED verification after max attempts.');
                        }
                    }
                } else {
                    console.log(`Build failed:\n${buildResult.errorLog}`);

                    // If the daemon went offline mid-loop, stop retrying
                    if (isDockerDaemonError(buildResult.errorLog)) {
                        console.warn('Docker daemon connection lost mid-build. Stopping repair loop.');
                        finalLog = 'Docker daemon connection lost during build. Please restart Docker and try again.';
                        break;
                    }

                    if (attempts < MAX_ATTEMPTS) {
                        console.log('Sending build error to AI for self-repair...');
                        dockerfile = await fixDockerfile(dockerfile, buildResult.errorLog);
                        console.log('AI returned a repaired Dockerfile. Retrying build...');
                    } else {
                        finalLog = buildResult.errorLog;
                        console.log('Agentic loop complete: FAILED build after max attempts.');
                    }
                }
            }
        }

        // Return the final result to the frontend
        res.status(200).json({
            message: buildSuccess
                ? 'Dockerfile generated, built, and container-verified successfully!'
                : (!dockerRunning || finalLog.includes('Docker daemon')
                    ? 'Dockerfile generated. Local build was skipped because the Docker daemon is offline.'
                    : `Dockerfile generated. Build/verification failed after ${MAX_ATTEMPTS} repair attempts.`),
            dockerfile,
            buildSuccess,
            dockerRunning,
            attempts,
            error: !buildSuccess ? finalLog : null
        });

    } catch (error) {
        console.error('Unhandled error in /api/generate:', error);
        res.status(500).json({ error: error.message });
    }
});

// SPA fallback routing for production frontend
if (fs.existsSync(frontendDistPath)) {
    app.get('*any', (req, res) => {
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`DockerForge backend running at http://localhost:${PORT}`);
});