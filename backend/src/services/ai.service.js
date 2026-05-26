const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateDockerfile(fileTree, dependencyFile) {
    try {
        // Hum yahan gemini-1.5-flash use kar rahe hain kyunki ye coding tasks aur speed dono me best hai
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // AI ko humara context aur rules samjhana
        const prompt = `
        You are an expert DevOps AI. Your task is to write a highly optimized, production-ready Dockerfile for a project.
        
        Here is the directory structure of the project:
        ${JSON.stringify(fileTree, null, 2)}

        ${dependencyFile ? `Here is the content of the main dependency file (${dependencyFile.filename}):\n${dependencyFile.content}` : 'No specific dependency file found.'}

        Based on this structure and dependencies, generate the Dockerfile.
        IMPORTANT RULES:
        1. Return ONLY the raw Dockerfile content.
        2. DO NOT include any explanations.
        3. DO NOT wrap the output in markdown code blocks like \`\`\`docker or \`\`\`. Just return the plain text.
        `;

        const result = await model.generateContent(prompt);
        let dockerfileContent = result.response.text();

        // Safety check: Agar AI galti se markdown add kar de, toh hum use hata denge
        dockerfileContent = dockerfileContent.replace(/```docker\n?/gi, '').replace(/```\n?/g, '').trim();

        return dockerfileContent;
    } catch (error) {
        console.error("AI Generation Error:", error);
        throw new Error("Failed to generate Dockerfile using AI");
    }
}

module.exports = { generateDockerfile };