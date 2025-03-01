#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
// Fixed chalk import for ESM
import chalk from 'chalk';
// Import for Gemini API
import { GoogleGenerativeAI } from "@google/generative-ai";
// Add these imports after the existing imports
import fs from 'fs';
class GeminiThinkingServer {
    constructor(apiKey) {
        this.thoughtHistory = [];
        this.branches = {};
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Use the Gemini model specialized for thinking
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-thinking-exp-01-21" });
    }
    validateThoughtData(input) {
        const data = input;
        if (!data.query || typeof data.query !== 'string') {
            throw new Error('Invalid query: must be a string');
        }
        if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
            throw new Error('Invalid thoughtNumber: must be a number');
        }
        if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
            throw new Error('Invalid totalThoughts: must be a number');
        }
        if (typeof data.nextThoughtNeeded !== 'boolean') {
            throw new Error('Invalid nextThoughtNeeded: must be a boolean');
        }
        return {
            query: data.query,
            context: data.context,
            approach: data.approach,
            thought: data.thought || "",
            thoughtNumber: data.thoughtNumber,
            totalThoughts: data.totalThoughts,
            previousThoughts: data.previousThoughts,
            nextThoughtNeeded: data.nextThoughtNeeded,
            isRevision: data.isRevision,
            revisesThought: data.revisesThought,
            branchFromThought: data.branchFromThought,
            branchId: data.branchId,
            needsMoreThoughts: data.needsMoreThoughts,
            metaComments: data.metaComments,
            confidenceLevel: data.confidenceLevel,
            alternativePaths: data.alternativePaths,
        };
    }
    formatThought(thoughtData) {
        const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId, metaComments, confidenceLevel, alternativePaths } = thoughtData;
        let prefix = '';
        let context = '';
        if (isRevision) {
            prefix = chalk.yellow('🔄 Revision');
            context = ` (revising thought ${revisesThought})`;
        }
        else if (branchFromThought) {
            prefix = chalk.green('🌿 Branch');
            context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
        }
        else {
            prefix = chalk.blue('💭 Thought');
            context = '';
        }
        const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
        const confidenceStr = confidenceLevel ? `\nConfidence: ${confidenceLevel * 100}%` : '';
        const metaStr = metaComments ? `\nMeta: ${metaComments}` : '';
        const alternativesStr = alternativePaths && alternativePaths.length > 0
            ? `\nAlternatives: ${alternativePaths.join(' | ')}`
            : '';
        const content = `${thought}${confidenceStr}${metaStr}${alternativesStr}`;
        const contentLines = content.split('\n');
        const maxLineLength = Math.max(header.length, ...contentLines.map(line => line.length));
        const border = '─'.repeat(maxLineLength + 4);
        let formattedContent = '';
        for (const line of contentLines) {
            formattedContent += `│ ${line.padEnd(maxLineLength)} │\n`;
        }
        return `
┌${border}┐
│ ${header.padEnd(maxLineLength)} │
├${border}┤
${formattedContent}└${border}┘`;
    }
    async generateThoughtWithGemini(input) {
        try {
            // Prepare the prompt for Gemini
            let prompt = `Query: ${input.query}\n`;
            if (input.context) {
                prompt += `Context: ${input.context}\n`;
            }
            if (input.approach) {
                prompt += `Approach: ${input.approach}\n`;
            }
            if (input.previousThoughts && input.previousThoughts.length > 0) {
                prompt += `Previous thoughts:\n${input.previousThoughts.join('\n')}\n`;
            }
            prompt += `\nGenerate thought #${input.thoughtNumber} of ${input.totalThoughts}`;
            if (input.isRevision) {
                prompt += ` (revising thought #${input.revisesThought})`;
            }
            else if (input.branchFromThought) {
                prompt += ` (branching from thought #${input.branchFromThought})`;
            }
            prompt += `\nRemember: DO NOT generate any code, only provide analytical thinking.`;
            // Configure the model parameters
            const generationConfig = {
                temperature: 0.7,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 1024,
            };
            // Generate content with Gemini
            const result = await this.model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig,
            });
            const response = result.response;
            const generatedText = response.text();
            // Extract meta information if available (this is a simplified approach)
            let metaComments = "";
            let confidenceLevel = 0;
            let alternativePaths = [];
            // Simple parsing for meta information (in a real implementation, this would be more sophisticated)
            const metaMatch = generatedText.match(/META:(.*?)(?:\n|$)/i);
            if (metaMatch) {
                metaComments = metaMatch[1].trim();
            }
            const confidenceMatch = generatedText.match(/CONFIDENCE:(\d+(?:\.\d+)?)%?/i);
            if (confidenceMatch) {
                confidenceLevel = parseFloat(confidenceMatch[1]) / 100;
            }
            const alternativesMatch = generatedText.match(/ALTERNATIVES:(.*?)(?:\n|$)/i);
            if (alternativesMatch) {
                alternativePaths = alternativesMatch[1].split('|').map((path) => path.trim());
            }
            // Clean the generated text by removing meta information
            let cleanedText = generatedText
                .replace(/META:.*?(?:\n|$)/i, '')
                .replace(/CONFIDENCE:.*?(?:\n|$)/i, '')
                .replace(/ALTERNATIVES:.*?(?:\n|$)/i, '')
                .trim();
            // Update the input with the generated thought and meta information
            return {
                ...input,
                thought: cleanedText,
                metaComments,
                confidenceLevel,
                alternativePaths,
            };
        }
        catch (error) {
            console.error("Error generating thought with Gemini:", error);
            return {
                ...input,
                thought: `Error generating thought: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    saveSession(filePath) {
        try {
            const sessionData = {
                thoughtHistory: this.thoughtHistory,
                branches: this.branches,
                timestamp: new Date().toISOString(),
                version: '0.1.0'
            };
            fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
            console.error(chalk.green(`Session saved to ${filePath}`));
            return true;
        }
        catch (error) {
            console.error(chalk.red(`Error saving session: ${error instanceof Error ? error.message : String(error)}`));
            return false;
        }
    }
    loadSession(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                console.error(chalk.red(`Session file not found: ${filePath}`));
                return false;
            }
            const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            // Validate the session data
            if (!sessionData.thoughtHistory || !Array.isArray(sessionData.thoughtHistory)) {
                console.error(chalk.red('Invalid session data: thoughtHistory is missing or not an array'));
                return false;
            }
            // Load the session data
            this.thoughtHistory = sessionData.thoughtHistory;
            this.branches = sessionData.branches || {};
            console.error(chalk.green(`Session loaded from ${filePath}`));
            console.error(chalk.blue(`Loaded ${this.thoughtHistory.length} thoughts and ${Object.keys(this.branches).length} branches`));
            // Display the loaded thoughts
            this.thoughtHistory.forEach(thought => {
                console.error(this.formatThought(thought));
            });
            return true;
        }
        catch (error) {
            console.error(chalk.red(`Error loading session: ${error instanceof Error ? error.message : String(error)}`));
            return false;
        }
    }
    // Add a method to get the current session state
    getSessionState() {
        return {
            thoughtHistory: this.thoughtHistory,
            branches: this.branches
        };
    }
    async processThought(input) {
        try {
            // Check if this is a session command
            const data = input;
            if (data.sessionCommand && typeof data.sessionCommand === 'string') {
                const command = data.sessionCommand;
                if (command === 'save' && data.sessionPath && typeof data.sessionPath === 'string') {
                    const success = this.saveSession(data.sessionPath);
                    return {
                        content: [{
                                type: "text",
                                text: JSON.stringify({
                                    status: success ? 'success' : 'error',
                                    message: success ? `Session saved to ${data.sessionPath}` : 'Failed to save session',
                                    command: 'save'
                                }, null, 2)
                            }]
                    };
                }
                if (command === 'load' && data.sessionPath && typeof data.sessionPath === 'string') {
                    const success = this.loadSession(data.sessionPath);
                    return {
                        content: [{
                                type: "text",
                                text: JSON.stringify({
                                    status: success ? 'success' : 'error',
                                    message: success ? `Session loaded from ${data.sessionPath}` : 'Failed to load session',
                                    command: 'load',
                                    thoughtHistoryLength: this.thoughtHistory.length,
                                    branches: Object.keys(this.branches)
                                }, null, 2)
                            }]
                    };
                }
                if (command === 'getState') {
                    const state = this.getSessionState();
                    return {
                        content: [{
                                type: "text",
                                text: JSON.stringify({
                                    status: 'success',
                                    command: 'getState',
                                    thoughtHistoryLength: state.thoughtHistory.length,
                                    branches: Object.keys(state.branches),
                                    lastThought: state.thoughtHistory.length > 0 ? state.thoughtHistory[state.thoughtHistory.length - 1] : null
                                }, null, 2)
                            }]
                    };
                }
                return {
                    content: [{
                            type: "text",
                            text: JSON.stringify({
                                status: 'error',
                                message: `Unknown session command: ${command}`,
                                command
                            }, null, 2)
                        }],
                    isError: true
                };
            }
            // Regular thought processing continues as before
            const validatedInput = this.validateThoughtData(input);
            if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
                validatedInput.totalThoughts = validatedInput.thoughtNumber;
            }
            // If thought is not provided, generate it with Gemini
            if (!validatedInput.thought || validatedInput.thought.trim() === "") {
                const thoughtWithGemini = await this.generateThoughtWithGemini(validatedInput);
                Object.assign(validatedInput, thoughtWithGemini);
            }
            this.thoughtHistory.push(validatedInput);
            if (validatedInput.branchFromThought && validatedInput.branchId) {
                if (!this.branches[validatedInput.branchId]) {
                    this.branches[validatedInput.branchId] = [];
                }
                this.branches[validatedInput.branchId].push(validatedInput);
            }
            const formattedThought = this.formatThought(validatedInput);
            console.error(formattedThought);
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            thought: validatedInput.thought,
                            thoughtNumber: validatedInput.thoughtNumber,
                            totalThoughts: validatedInput.totalThoughts,
                            nextThoughtNeeded: validatedInput.nextThoughtNeeded,
                            branches: Object.keys(this.branches),
                            thoughtHistoryLength: this.thoughtHistory.length,
                            metaComments: validatedInput.metaComments,
                            confidenceLevel: validatedInput.confidenceLevel,
                            alternativePaths: validatedInput.alternativePaths,
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({
                            error: error instanceof Error ? error.message : String(error),
                            status: 'failed'
                        }, null, 2)
                    }],
                isError: true
            };
        }
    }
}
const GEMINI_THINKING_TOOL = {
    name: "geminithinking",
    description: `A detailed tool for dynamic and reflective problem-solving through Gemini AI.
This tool helps analyze problems through a flexible thinking process powered by Google's Gemini model.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- Leverages Gemini AI for deep analytical thinking
- Provides meta-commentary on the reasoning process
- Indicates confidence levels for generated thoughts
- Suggests alternative approaches when relevant
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Session persistence: save and resume your analysis sessions

Parameters explained:
- query: The question or problem to be analyzed
- context: Additional context information (e.g., code snippets, background)
- approach: Suggested approach to the problem (optional)
- previousThoughts: Array of previous thoughts for context
- thought: The current thinking step (if empty, will be generated by Gemini)
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed
- metaComments: Meta-commentary from Gemini about its reasoning process
- confidenceLevel: Gemini's confidence in the generated thought (0-1)
- alternativePaths: Alternative approaches suggested by Gemini

Session commands:
- sessionCommand: Command to manage sessions ('save', 'load', 'getState')
- sessionPath: Path to save or load the session file (required for 'save' and 'load' commands)

You should:
1. Start with a clear query and any relevant context
2. Let Gemini generate thoughts by not providing the 'thought' parameter
3. Review the generated thoughts and meta-commentary
4. Feel free to revise or branch thoughts as needed
5. Consider alternative paths suggested by Gemini
6. Only set next_thought_needed to false when truly done
7. Use session commands to save your progress and resume later`,
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The question or problem to analyze"
            },
            context: {
                type: "string",
                description: "Additional context information"
            },
            approach: {
                type: "string",
                description: "Suggested approach to the problem"
            },
            previousThoughts: {
                type: "array",
                items: {
                    type: "string"
                },
                description: "Array of previous thoughts for context"
            },
            thought: {
                type: "string",
                description: "Your current thinking step (if empty, will be generated by Gemini)"
            },
            nextThoughtNeeded: {
                type: "boolean",
                description: "Whether another thought step is needed"
            },
            thoughtNumber: {
                type: "integer",
                description: "Current thought number",
                minimum: 1
            },
            totalThoughts: {
                type: "integer",
                description: "Estimated total thoughts needed",
                minimum: 1
            },
            isRevision: {
                type: "boolean",
                description: "Whether this revises previous thinking"
            },
            revisesThought: {
                type: "integer",
                description: "Which thought is being reconsidered",
                minimum: 1
            },
            branchFromThought: {
                type: "integer",
                description: "Branching point thought number",
                minimum: 1
            },
            branchId: {
                type: "string",
                description: "Branch identifier"
            },
            needsMoreThoughts: {
                type: "boolean",
                description: "If more thoughts are needed"
            },
            metaComments: {
                type: "string",
                description: "Meta-commentary about the reasoning process"
            },
            confidenceLevel: {
                type: "number",
                description: "Confidence level in the generated thought (0-1)",
                minimum: 0,
                maximum: 1
            },
            alternativePaths: {
                type: "array",
                items: {
                    type: "string"
                },
                description: "Alternative approaches suggested"
            },
            sessionCommand: {
                type: "string",
                description: "Command to manage sessions ('save', 'load', 'getState')"
            },
            sessionPath: {
                type: "string",
                description: "Path to save or load the session file"
            }
        },
        required: ["query", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
    }
};
// Get API key from environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const server = new Server({
    name: "gemini-thinking-server",
    version: "0.1.0",
}, {
    capabilities: {
        tools: {},
    },
});
const thinkingServer = new GeminiThinkingServer(GEMINI_API_KEY);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [GEMINI_THINKING_TOOL],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "geminithinking") {
        return await thinkingServer.processThought(request.params.arguments);
    }
    return {
        content: [{
                type: "text",
                text: `Unknown tool: ${request.params.name}`
            }],
        isError: true
    };
});
async function runServer() {
    if (!GEMINI_API_KEY) {
        console.error("Error: GEMINI_API_KEY environment variable is not set");
        process.exit(1);
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Gemini Thinking MCP Server running on stdio");
}
runServer().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
