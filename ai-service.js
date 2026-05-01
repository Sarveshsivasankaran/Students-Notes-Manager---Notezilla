const Tesseract = require('tesseract.js');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const officeParser = require('officeparser');
const { Ollama } = require('@langchain/ollama');
const { PromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');

// Initialize Ollama
const ollama = new Ollama({
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3',
});

/**
 * Extract text from different file types
 */
async function extractText(fileBuffer, mimeType) {
    try {
        if (mimeType === 'application/pdf') {
            const data = await pdf(fileBuffer);
            return data.text;
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            return result.value;
        } else if (mimeType.startsWith('image/')) {
            const { data: { text } } = await Tesseract.recognize(fileBuffer, 'eng');
            return text;
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
            return new Promise((resolve, reject) => {
                officeParser.parseOffice(fileBuffer, (data, err) => {
                    if (err) reject(err);
                    resolve(data);
                });
            });
        }
        return fileBuffer.toString('utf-8');
    } catch (error) {
        console.error('Extraction error:', error);
        throw new Error('Failed to extract text from file');
    }
}

/**
 * AI Analysis Pipeline
 */
async function analyzeNote(text) {
    const template = `
    You are an academic AI assistant. Analyze the following study material and provide:
    1. A concise summary.
    2. Key concepts covered.
    3. A clear explanation of the context.

    Material Text: {text}

    Format the output as JSON with keys: "summary", "keyConcepts" (array), and "contextExplanation".
    `;

    const prompt = PromptTemplate.fromTemplate(template);
    const chain = prompt.pipe(ollama).pipe(new StringOutputParser());

    const result = await chain.invoke({ text: text.substring(0, 5000) }); // Limit text for Ollama
    
    try {
        // Clean potential markdown from Ollama
        const jsonStr = result.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Failed to parse AI result:', result);
        return {
            summary: result,
            keyConcepts: [],
            contextExplanation: "Analysis completed but failed to format as JSON."
        };
    }
}

/**
 * Chat with Note Pipeline
 */
async function chatWithNote(noteText, userQuestion) {
    const template = `
    You are an academic assistant. Answer the user's question ONLY based on the provided document content.
    If the answer is not in the document, politely say you don't know.

    Document Content: {context}

    User Question: {question}
    `;

    const prompt = PromptTemplate.fromTemplate(template);
    const chain = prompt.pipe(ollama).pipe(new StringOutputParser());

    return await chain.invoke({ 
        context: noteText.substring(0, 10000), 
        question: userQuestion 
    });
}

module.exports = {
    extractText,
    analyzeNote,
    chatWithNote
};
