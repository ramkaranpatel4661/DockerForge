const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// Helper function to call Gemini with robust retry logic for 503 Service Unavailable and 429 Too Many Requests errors
async function callGeminiWithRetry(prompt, modelName = GEMINI_MODEL, maxRetries = 3) {
    let delay = 10000; // Start with 10 seconds for rate limits
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result;
        } catch (error) {
            const is503 = error.status === 503 || (error.message && error.message.includes("503"));
            const is429 = error.status === 429 || (error.message && error.message.includes("429"));

            if ((is503 || is429) && attempt < maxRetries) {
                let currentDelay = delay;

                // Extract retryDelay from the error details if available
                if (error.errorDetails) {
                    for (const detail of error.errorDetails) {
                        if (detail.retryDelay) {
                            const seconds = parseInt(detail.retryDelay);
                            if (!isNaN(seconds)) {
                                currentDelay = (seconds + 2) * 1000; // Add a 2-second safety buffer
                            }
                        }
                    }
                }

                console.warn(`[Gemini API] Returned ${is429 ? '429 Rate Limit' : '503 Service Unavailable'} (Attempt ${attempt}/${maxRetries}). Retrying in ${currentDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                delay *= 2; // Increase delay for subsequent retries
            } else {
                throw error;
            }
        }
    }
}

// Function 1: Generate initial Dockerfile
async function generateDockerfile(fileTree, dependencyFile) {
    try {
        const prompt = `
        You are an expert DevOps AI. Your task is to write a highly optimized, production-ready Dockerfile for a project.
        
        Here is the directory structure of the project:
        ${JSON.stringify(fileTree, null, 2)}
 
        ${dependencyFile ? `Here is the content of the main dependency file (${dependencyFile.filename}):\n${dependencyFile.content}` : 'No specific dependency file found.'}
 
        Based on this structure and dependencies, generate the Dockerfile.
        
        CRITICAL BUILD CONTEXT RULE:
        The Dockerfile will be saved at the ROOT of the directory structure provided above, and the Docker build command will be run from the ROOT directory. 
        Therefore, all paths in your COPY/ADD instructions must be relative to the root of the directory structure. 
        For example:
        - If a file is in a subdirectory (like "backend/package.json"), you must copy it using its subdirectory path: "COPY backend/package*.json ./"
        - Do NOT assume the build context is inside a subdirectory. Always use paths relative to the root of the provided directory tree.
 
        IMPORTANT RULES:
        1. Return ONLY the raw Dockerfile content.
        2. DO NOT include any explanations.
        3. DO NOT wrap the output in markdown code blocks like \`\`\`docker or \`\`\`. Just return the plain text.
        `;

        const result = await callGeminiWithRetry(prompt, GEMINI_MODEL);
        let dockerfileContent = result.response.text();

        // Safety check: Remove accidental markdown formatting
        dockerfileContent = dockerfileContent.replace(/```docker\n?/gi, '').replace(/```\n?/g, '').trim();

        return dockerfileContent;
    } catch (error) {
        console.error("AI Generation Error:", error);
        throw new Error("Failed to generate Dockerfile using AI");
    }
}

// Function 2: Error aane par Dockerfile ko auto-fix karna
async function fixDockerfile(currentDockerfile, errorMessage) {
    try {
        const prompt = `
        You are an expert DevOps AI. I tried to build a Docker image using the following Dockerfile, but it failed.
        
        Here is the current Dockerfile:
        ${currentDockerfile}
        
        Here is the build error message from the terminal:
        ${errorMessage}
        
        Please analyze the error and fix the Dockerfile.
 
        CRITICAL BUILD CONTEXT RULE:
        The Dockerfile is saved at the ROOT of the repository directory structure, and the Docker build command is run from the ROOT directory.
        Therefore, all paths in your COPY/ADD instructions must be relative to the root of the repository.
        For example:
        - If a file is in a subdirectory (like "backend/package.json"), you must copy it using its subdirectory path: "COPY backend/package*.json ./"
        - Do NOT assume the build context is inside a subdirectory. Always use paths relative to the root of the directory tree.
 
        IMPORTANT RULES:
        1. Return ONLY the raw fixed Dockerfile content.
        2. DO NOT include any explanations or apologies.
        3. DO NOT wrap the output in markdown code blocks like \`\`\`docker or \`\`\`. Just return the plain text.
        `;

        const result = await callGeminiWithRetry(prompt, GEMINI_MODEL);
        let fixedDockerfile = result.response.text();

        // Remove accidental markdown formatting
        fixedDockerfile = fixedDockerfile.replace(/```docker\n?/gi, '').replace(/```\n?/g, '').trim();
        return fixedDockerfile;
    } catch (error) {
        console.error("AI Fix Error:", error);
        throw new Error("Failed to fix Dockerfile using AI");
    }
}

module.exports = { generateDockerfile, fixDockerfile };