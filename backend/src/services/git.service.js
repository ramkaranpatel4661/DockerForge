const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');

const git = simpleGit();

// Function 1: Repository ko temporary folder me clone karna
async function cloneRepository(repoUrl, targetDir) {
    try {
        console.log(`Cloning ${repoUrl} into ${targetDir}...`);

        // Agar pehle se koi temp folder hai toh use delete kar do
        if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
        }

        await git.clone(repoUrl, targetDir);
        console.log('Cloning successful!');
        return true;
    } catch (error) {
        console.error('Error cloning repository:', error);
        throw new Error('Failed to clone repository');
    }
}

// Function 2: Repo ka file structure nikalna (LLM ko bhejne ke liye)
function getFileTree(dir, fileList = [], baseDir = dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            // .git aur node_modules ignore karna zaroori hai
            if (file !== 'node_modules' && file !== '.git') {
                getFileTree(filePath, fileList, baseDir);
            }
        } else {
            // Get path relative to the base directory and normalize slashes to '/'
            const relativePath = path.relative(baseDir, filePath);
            fileList.push(relativePath.replace(/\\/g, '/'));
        }
    });

    return fileList;
}

// Function 3: Important files (jaise package.json) ka content read karna
function getDependencyFileContent(targetDir) {
    const filesToLookFor = ['package.json', 'requirements.txt', 'pom.xml', 'go.mod'];

    for (const file of filesToLookFor) {
        const fullPath = path.join(targetDir, file);
        if (fs.existsSync(fullPath)) {
            return {
                filename: file,
                content: fs.readFileSync(fullPath, 'utf-8')
            };
        }
    }
    return null; // Agar koi dependency file nahi mili
}

module.exports = {
    cloneRepository,
    getFileTree,
    getDependencyFileContent
};