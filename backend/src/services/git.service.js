const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');

const git = simpleGit();

/**
 * Clones a public GitHub repository into the specified target directory.
 * If the target directory already exists, it is deleted first to ensure a clean clone.
 */
async function cloneRepository(repoUrl, targetDir) {
    try {
        console.log(`Cloning ${repoUrl} into ${targetDir}...`);

        // Remove any existing temp directory before cloning to avoid conflicts
        if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
        }

        await git.clone(repoUrl, targetDir);
        console.log('Clone successful!');
        return true;
    } catch (error) {
        console.error('Error cloning repository:', error);
        throw new Error('Failed to clone repository. Ensure the URL is public and valid.');
    }
}

/**
 * Recursively walks a directory and returns a flat list of relative file paths.
 * Ignores node_modules and .git directories to keep the context clean for the LLM.
 */
function getFileTree(dir, fileList = [], baseDir = dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            // Skip dependency/version-control directories to reduce noise
            if (file !== 'node_modules' && file !== '.git' && file !== '__pycache__' && file !== '.venv') {
                getFileTree(filePath, fileList, baseDir);
            }
        } else {
            // Normalize Windows backslashes to forward slashes for cross-platform compatibility
            const relativePath = path.relative(baseDir, filePath);
            fileList.push(relativePath.replace(/\\/g, '/'));
        }
    });

    return fileList;
}

/**
 * Locates and reads the primary dependency manifest file from the repository.
 * Searches both the root and common subdirectories (e.g., backend/, app/) for monorepos.
 * Supports: package.json, requirements.txt, pom.xml, go.mod, Pipfile, pyproject.toml
 */
function getDependencyFileContent(targetDir) {
    const filesToLookFor = [
        'package.json',
        'requirements.txt',
        'pom.xml',
        'go.mod',
        'Pipfile',
        'pyproject.toml'
    ];

    // Common subdirectory patterns found in monorepos
    const subdirsToCheck = ['', 'backend', 'app', 'server', 'api', 'src'];

    for (const subdir of subdirsToCheck) {
        for (const file of filesToLookFor) {
            const fullPath = path.join(targetDir, subdir, file);
            if (fs.existsSync(fullPath)) {
                console.log(`Found dependency file: ${path.join(subdir, file)}`);
                return {
                    filename: subdir ? `${subdir}/${file}` : file,
                    content: fs.readFileSync(fullPath, 'utf-8')
                };
            }
        }
    }

    console.warn('No recognized dependency file found in root or common subdirectories.');
    return null;
}

module.exports = {
    cloneRepository,
    getFileTree,
    getDependencyFileContent
};