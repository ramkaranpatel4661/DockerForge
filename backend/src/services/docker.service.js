const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Maximum time (ms) to allow a Docker build before timing out (5 minutes)
const BUILD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Writes the generated Dockerfile content to disk inside the target directory.
 */
function saveDockerfile(targetDir, dockerfileContent) {
    const filePath = path.join(targetDir, 'Dockerfile');
    fs.writeFileSync(filePath, dockerfileContent, 'utf-8');
    console.log(`Dockerfile saved to: ${filePath}`);
}

/**
 * Runs `docker build` against the target directory and captures stdout/stderr.
 * Resolves with { success, log } on success or { success, errorLog } on failure.
 * Applies a build timeout to prevent indefinite hangs on large repositories.
 */
function buildImage(targetDir, imageName = 'dockerforge-temp') {
    return new Promise((resolve, reject) => {
        console.log(`Starting Docker build: image="${imageName}", context="${targetDir}"`);

        exec(
            `docker build -t ${imageName} .`,
            { cwd: targetDir, timeout: BUILD_TIMEOUT_MS },
            (error, stdout, stderr) => {
                if (error) {
                    // Check for timeout specifically
                    if (error.killed) {
                        console.error('Docker build timed out after 5 minutes.');
                        return resolve({ success: false, errorLog: 'Docker build timed out. The repository may be too large or contain a very long build step.' });
                    }
                    console.error('Docker build failed.');
                    // Docker writes build errors to stderr; capture it for AI self-repair
                    return resolve({ success: false, errorLog: stderr || error.message });
                }
                console.log('Docker build succeeded.');
                resolve({ success: true, log: stdout });
            }
        );
    });
}

/**
 * Checks whether the Docker daemon is currently reachable.
 * Uses a short timeout (3s) to avoid hanging if the socket is unresponsive.
 */
function isDockerRunning() {
    return new Promise((resolve) => {
        exec('docker info', { timeout: 3000 }, (error) => {
            resolve(!error);
        });
    });
}

/**
 * Detects whether an error log string indicates a Docker daemon connectivity issue
 * (as opposed to a Dockerfile syntax/logic error that the AI can fix).
 */
function isDockerDaemonError(errorLog) {
    if (!errorLog) return false;
    const errorLower = errorLog.toLowerCase();
    return (
        errorLower.includes('error during connect') ||
        errorLower.includes('cannot connect to the docker daemon') ||
        errorLower.includes('is the docker daemon running') ||
        errorLower.includes('docker daemon is not running') ||
        errorLower.includes('open //./pipe/') ||
        errorLower.includes('/var/run/docker.sock') ||
        errorLower.includes('the system cannot find the file specified')
    );
}

/**
 * Runs the built Docker image in detached mode (-d) with all ports auto-mapped (-P),
 * then verifies it remains in a running state after a startup grace period.
 * If the container exposes a port, attempts an HTTP ping to confirm the service responds.
 * Cleans up the container after verification regardless of outcome.
 */
function runAndVerifyContainer(imageName = 'dockerforge-temp') {
    return new Promise((resolve) => {
        const containerName = `dockerforge-verify-${Date.now()}`;
        console.log(`Starting container verification: image="${imageName}", name="${containerName}"`);

        exec(`docker run -d -P --name ${containerName} ${imageName}`, async (error, stdout, stderr) => {
            if (error) {
                console.error('Failed to start container:', error.message);
                return resolve({ success: false, errorLog: stderr || error.message });
            }

            const containerId = stdout.trim();
            console.log(`Container started in background. Container ID: ${containerId.slice(0, 12)}`);

            // Allow time for services inside the container to initialize
            await new Promise(r => setTimeout(r, 4000));

            // Step 1: Verify the container is still in the Running state
            exec(`docker inspect --format="{{.State.Running}}" ${containerId}`, (inspectError, inspectStdout) => {
                if (inspectError || inspectStdout.trim() !== 'true') {
                    console.error('Verification failed: Container exited prematurely.');

                    // Retrieve container logs to understand the crash reason for AI self-repair
                    exec(`docker logs ${containerId}`, (logsError, logsStdout, logsStderr) => {
                        const logs = logsStdout || logsStderr || 'No startup logs available.';
                        console.error(`Container crash logs:\n${logs}`);
                        exec(`docker rm -f ${containerId}`);
                        resolve({
                            success: false,
                            errorLog: `Container crashed on startup.\nCrash Logs:\n${logs}`
                        });
                    });
                    return;
                }

                // Step 2: Inspect port bindings to determine if there is a service to ping
                exec(`docker inspect --format="{{json .NetworkSettings.Ports}}" ${containerId}`, async (portError, portStdout) => {
                    let portResponds = false;
                    let responseMsg = 'Container started and is in a healthy running state.';

                    if (!portError && portStdout) {
                        try {
                            const ports = JSON.parse(portStdout.trim());
                            let mappedPort = null;

                            // Find the first host-mapped port
                            for (const key in ports) {
                                const bindings = ports[key];
                                if (bindings && bindings.length > 0) {
                                    mappedPort = bindings[0].HostPort;
                                    break;
                                }
                            }

                            if (mappedPort) {
                                console.log(`Container port mapped to host port ${mappedPort}. Sending HTTP verification ping...`);

                                // Attempt up to 3 HTTP pings with 1-second gaps between retries
                                for (let i = 1; i <= 3; i++) {
                                    try {
                                        const ok = await Promise.race([
                                            fetch(`http://localhost:${mappedPort}`).then(r => r.ok || r.status < 500),
                                            new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 1500))
                                        ]);
                                        if (ok) {
                                            portResponds = true;
                                            responseMsg = `Container started, is running, and responded on mapped host port ${mappedPort}.`;
                                            break;
                                        }
                                    } catch (e) {
                                        console.log(`HTTP ping attempt ${i}/3 failed (${e.message}). Retrying in 1s...`);
                                        await new Promise(r => setTimeout(r, 1000));
                                    }
                                }

                                if (!portResponds) {
                                    console.warn(`Container is running but did not respond on port ${mappedPort}. This may be a non-HTTP service or a slow startup.`);
                                }
                            } else {
                                console.log('No exposed ports mapped to host. Verification passed — container is running.');
                            }
                        } catch (e) {
                            console.error('Failed to parse container port mapping:', e.message);
                        }
                    }

                    // Step 3: Clean up the verification container
                    console.log('Cleaning up verification container...');
                    exec(`docker rm -f ${containerId}`, () => {
                        console.log('Cleanup complete.');
                        resolve({ success: true, log: responseMsg });
                    });
                });
            });
        });
    });
}

module.exports = {
    saveDockerfile,
    buildImage,
    isDockerRunning,
    isDockerDaemonError,
    runAndVerifyContainer
};