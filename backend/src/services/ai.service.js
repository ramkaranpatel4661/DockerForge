const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

/**
 * Calls the Gemini API with exponential backoff retry logic.
 * Handles 429 (Rate Limit) and 503 (Service Unavailable) gracefully by
 * respecting the server's retryDelay hint when available.
 */
async function callGeminiWithRetry(prompt, modelName = GEMINI_MODEL, maxRetries = 3) {
    let delay = 10000; // Start with a 10-second base delay for rate limits

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result;
        } catch (error) {
            const is503 = error.status === 503 || (error.message && error.message.includes('503'));
            const is429 = error.status === 429 || (error.message && error.message.includes('429'));

            if ((is503 || is429) && attempt < maxRetries) {
                let currentDelay = delay;

                // Use the server-provided retryDelay if available for precise backoff
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

                console.warn(`[Gemini API] ${is429 ? '429 Rate Limit' : '503 Unavailable'} on attempt ${attempt}/${maxRetries}. Retrying in ${currentDelay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                delay *= 2; // Exponential backoff for subsequent retries
            } else {
                throw error;
            }
        }
    }
}

/**
 * Generates an initial optimized Dockerfile based on the repository's file tree
 * and its primary dependency manifest. Returns raw Dockerfile text only.
 */
async function generateDockerfile(fileTree, dependencyFile) {
    try {
        const prompt = `
        You are an expert DevOps engineer. Your task is to write a highly optimized, production-ready Dockerfile for a software project.
        
        Here is the directory structure of the project:
        ${JSON.stringify(fileTree, null, 2)}
 
        ${dependencyFile
            ? `Here is the content of the main dependency file (${dependencyFile.filename}):\n${dependencyFile.content}`
            : 'No specific dependency file was found. Infer the runtime from the file extensions in the directory tree.'
        }
 
        Based on this structure and dependencies, generate a production-ready Dockerfile.
        
        CRITICAL BUILD CONTEXT RULE:
        The Dockerfile will be saved at the ROOT of the directory structure provided above, and the Docker build command will be run from the ROOT directory. 
        Therefore, all paths in COPY/ADD instructions must be relative to the root of the directory structure. 
        Examples:
        - A file in a subdirectory like "backend/package.json" must be copied as: COPY backend/package*.json ./
        - Do NOT assume the build context is inside a subdirectory.
 
        BEST PRACTICES TO FOLLOW:
        1. Use multi-stage builds to minimize the final image size.
        2. Use a specific, pinned base image tag (e.g., node:20-alpine, python:3.11-slim) — never use "latest".
        3. Copy dependency files first and install dependencies before copying source code, to maximize Docker layer caching.
        4. Add a HEALTHCHECK instruction where appropriate.
        5. Run the application as a non-root user for security.
        6. Set NODE_ENV=production (or equivalent) for production builds.

        IMPORTANT OUTPUT RULES:
        1. Return ONLY the raw Dockerfile content — no explanations, no preamble.
        2. Do NOT wrap the output in markdown code fences like \`\`\`dockerfile or \`\`\`. Just return plain text.
        `;

        const result = await callGeminiWithRetry(prompt, GEMINI_MODEL);
        let dockerfileContent = result.response.text();

        // Strip any accidental markdown code fences from the response
        dockerfileContent = dockerfileContent.replace(/```docker\n?/gi, '').replace(/```\n?/g, '').trim();

        return dockerfileContent;
    } catch (error) {
        console.error('AI Generation Error:', error);
        throw new Error('Failed to generate Dockerfile using AI.');
    }
}

/**
 * Feeds a failed Dockerfile and its error log back into the LLM to generate
 * a corrected version. This is the core of the agentic self-repair loop.
 */
async function fixDockerfile(currentDockerfile, errorMessage) {
    try {
        const prompt = `
        You are an expert DevOps engineer. I tried to build a Docker image using the Dockerfile below, but it failed during the Docker build or container startup phase.
        
        Here is the current Dockerfile that produced the error:
        ${currentDockerfile}
        
        Here is the error message / container log from the failed build or run:
        ${errorMessage}
        
        Analyze the error carefully and return a fully corrected Dockerfile.
 
        CRITICAL BUILD CONTEXT RULE:
        The Dockerfile is saved at the ROOT of the repository, and the Docker build command runs from the ROOT directory.
        All COPY/ADD paths must be relative to the repository root.
        Example: COPY backend/package*.json ./  (not COPY package*.json ./)
 
        IMPORTANT OUTPUT RULES:
        1. Return ONLY the raw fixed Dockerfile — no explanations or apologies.
        2. Do NOT wrap the output in markdown code fences like \`\`\`dockerfile or \`\`\`. Just return plain text.
        `;

        const result = await callGeminiWithRetry(prompt, GEMINI_MODEL);
        let fixedDockerfile = result.response.text();

        // Strip any accidental markdown code fences from the response
        fixedDockerfile = fixedDockerfile.replace(/```docker\n?/gi, '').replace(/```\n?/g, '').trim();
        return fixedDockerfile;
    } catch (error) {
        console.error('AI Fix Error:', error);
        throw new Error('Failed to auto-fix Dockerfile using AI.');
    }
}

module.exports = { generateDockerfile, fixDockerfile };