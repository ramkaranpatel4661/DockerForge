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

module.exports = {
    saveDockerfile,
    buildImage
};