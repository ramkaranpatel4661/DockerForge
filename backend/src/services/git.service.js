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
function getFileTree(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            // .git aur node_modules ignore karna zaroori hai
            if (file !== 'node_modules' && file !== '.git') {
                getFileTree(filePath, fileList);
            }
        } else {
            // Hum paths save kar rahe hain
            fileList.push(filePath.replace(dir, ''));
        }
    });

    return fileList;
}

module.exports = {
    cloneRepository,
    getFileTree
};