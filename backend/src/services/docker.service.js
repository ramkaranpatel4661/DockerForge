const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function 1: Generated Dockerfile ko temp folder me save karna
function saveDockerfile(targetDir, dockerfileContent) {
    const filePath = path.join(targetDir, 'Dockerfile');
    fs.writeFileSync(filePath, dockerfileContent, 'utf-8');
    console.log('Dockerfile saved to repository directory.');
}

// Function 2: Docker Image Build karna
function buildImage(targetDir, imageName = 'dockerforge-temp') {
    return new Promise((resolve, reject) => {
        console.log(`Starting Docker build for ${imageName}...`);

        // Node.js se bash command chala rahe hain
        exec(`docker build -t ${imageName} .`, { cwd: targetDir }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Build Failed.`);
                // Docker stderr me errors bhejta hai, hum wahi capture karenge AI ko dikhane ke liye
                return resolve({ success: false, errorLog: stderr || error.message });
            }
            console.log(`Build Successful!`);
            resolve({ success: true, log: stdout });
        });
    });
}

// Function 3: Check if Docker daemon is running
function isDockerRunning() {
    return new Promise((resolve) => {
        // Use a 3-second timeout so it doesn't hang if there are system socket issues
        exec('docker info', { timeout: 3000 }, (error) => {
            if (error) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

// Function 4: Check if an error log indicates a Docker daemon connection issue
function isDockerDaemonError(errorLog) {
    if (!errorLog) return false;
    const errorLower = errorLog.toLowerCase();
    return errorLower.includes("error during connect") ||
        errorLower.includes("cannot connect to the docker daemon") ||
        errorLower.includes("is the docker daemon running") ||
        errorLower.includes("docker daemon is not running") ||
        errorLower.includes("open //./pipe/") ||
        errorLower.includes("/var/run/docker.sock") ||
        errorLower.includes("the system cannot find the file specified");
}

// Function 5: Run the built image and verify it starts and responds
function runAndVerifyContainer(imageName = 'dockerforge-temp') {
    return new Promise((resolve) => {
        const containerName = `dockerforge-verify-${Date.now()}`;
        console.log(`Starting container verification for ${imageName}...`);

        // Run container in background mapping all exposed ports to random host ports (-P)
        exec(`docker run -d -P --name ${containerName} ${imageName}`, async (error, stdout, stderr) => {
            if (error) {
                console.error(`Failed to start container:`, error.message);
                return resolve({ success: false, errorLog: stderr || error.message });
            }

            const containerId = stdout.trim();
            console.log(`Container started in background. ID: ${containerId}`);

            // Wait 4 seconds for container to initialize
            await new Promise(r => setTimeout(r, 4000));

            // 1. Verify container is still running
            exec(`docker inspect --format="{{.State.Running}}" ${containerId}`, (inspectError, inspectStdout) => {
                if (inspectError || inspectStdout.trim() !== "true") {
                    console.error("Verification failed: Container is not running.");

                    // Retrieve logs to understand why it failed/crashed
                    exec(`docker logs ${containerId}`, (logsError, logsStdout, logsStderr) => {
                        const logs = logsStdout || logsStderr || "No startup logs available.";
                        console.error(`Container crashed. Logs:\n${logs}`);

                        // Clean up the dead container
                        exec(`docker rm -f ${containerId}`);
                        resolve({ success: false, errorLog: `Container crashed on startup.\nLogs:\n${logs}` });
                    });
                    return;
                }

                // 2. Retrieve host port mapping
                exec(`docker inspect --format="{{json .NetworkSettings.Ports}}" ${containerId}`, async (portError, portStdout) => {
                    let portResponds = false;
                    let responseMsg = "Container started and remained in running state.";

                    if (!portError && portStdout) {
                        try {
                            const ports = JSON.parse(portStdout.trim());
                            let mappedPort = null;

                            // Find the first mapped host port
                            for (const key in ports) {
                                const bindings = ports[key];
                                if (bindings && bindings.length > 0) {
                                    mappedPort = bindings[0].HostPort;
                                    break;
                                }
                            }

                            if (mappedPort) {
                                console.log(`Container exposed port mapped to host port ${mappedPort}. Sending HTTP verification ping...`);

                                // Try checking the port up to 3 times (polling)
                                for (let i = 1; i <= 3; i++) {
                                    try {
                                        const res = await Promise.race([
                                            fetch(`http://localhost:${mappedPort}`).then(r => r.ok || r.status < 500),
                                            new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 1500))
                                        ]);
                                        if (res) {
                                            portResponds = true;
                                            responseMsg = `Container started successfully, is running, and responded on mapped host port ${mappedPort}!`;
                                            break;
                                        }
                                    } catch (e) {
                                        console.log(`Verification ping attempt ${i}/3 failed: ${e.message}. Retrying in 1s...`);
                                        await new Promise(r => setTimeout(r, 1000));
                                    }
                                }

                                if (portResponds) {
                                    console.log("Verification Successful: Container responded!");
                                } else {
                                    console.warn(`Container is running, but did not respond to pings on port ${mappedPort} (could be a non-web application or slower startup).`);
                                }
                            } else {
                                console.log("No exposed ports mapped to host. Verification passed as container started and is running.");
                            }
                        } catch (e) {
                            console.error("Failed to parse container port mapping:", e.message);
                        }
                    }

                    // 3. Clean up the running container
                    console.log("Cleaning up verification container...");
                    exec(`docker rm -f ${containerId}`, () => {
                        console.log("Cleanup complete.");
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