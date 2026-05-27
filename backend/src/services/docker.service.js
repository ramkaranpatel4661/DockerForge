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

module.exports = {
    saveDockerfile,
    buildImage,
    isDockerRunning,
    isDockerDaemonError
};