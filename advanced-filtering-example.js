#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Advanced filtering function that uses semantic understanding to extract relevant code
function semanticCodeFilter(codebaseText, query, keywords) {
  const lines = codebaseText.split('\n');
  let relevantCode = '';
  let currentFile = '';
  let isRelevantFile = false;
  let relevanceScore = 0;
  let fileScores = new Map();
  let fileContent = new Map();
  let currentFileContent = '';
  
  // First pass: collect all files and their content
  for (const line of lines) {
    if (line.startsWith('File: ')) {
      if (currentFile && currentFileContent) {
        fileContent.set(currentFile, currentFileContent);
      }
      
      currentFile = line.substring(6).trim();
      currentFileContent = line + '\n';
      isRelevantFile = false;
    } else if (currentFile) {
      currentFileContent += line + '\n';
    }
  }
  
  // Save the last file
  if (currentFile && currentFileContent) {
    fileContent.set(currentFile, currentFileContent);
  }
  
  // Second pass: score each file based on keywords and query terms
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 3);
  
  for (const [file, content] of fileContent.entries()) {
    let score = 0;
    const lowerContent = content.toLowerCase();
    
    // Score based on query terms
    for (const term of queryTerms) {
      const matches = lowerContent.match(new RegExp(term, 'g'));
      if (matches) {
        score += matches.length * 2;  // Higher weight for query terms
      }
    }
    
    // Score based on keywords
    for (const keyword of keywords) {
      const matches = lowerContent.match(new RegExp(keyword.toLowerCase(), 'g'));
      if (matches) {
        score += matches.length;
      }
    }
    
    // Adjust score based on file type/path relevance
    if (file.includes('test') || file.includes('spec')) {
      score *= 0.5;  // Lower weight for test files
    }
    
    if (file.includes('interface') || file.includes('type') || file.includes('model')) {
      score *= 1.5;  // Higher weight for definition files
    }
    
    fileScores.set(file, score);
  }
  
  // Sort files by score and take the top ones
  const sortedFiles = [...fileScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);  // Take top 10 most relevant files
  
  console.log("\nRelevance scores for top files:");
  sortedFiles.forEach(([file, score]) => {
    console.log(`${file}: ${score}`);
  });
  
  // Combine the content of the most relevant files
  for (const [file, _] of sortedFiles) {
    relevantCode += fileContent.get(file) + '\n';
  }
  
  return relevantCode;
}

// Function to extract keywords from a query using simple NLP techniques
function extractKeywords(query) {
  // Remove common stop words
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
    'about', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'shall',
    'may', 'might', 'must', 'of', 'by', 'as', 'if', 'then', 'else', 'when',
    'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'this', 'that', 'these', 'those'
  ]);
  
  // Split the query into words, filter out stop words and short words
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .split(/\s+/)
    .filter(word => !stopWords.has(word) && word.length > 3);
  
  // Count word frequency
  const wordFreq = {};
  for (const word of words) {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  }
  
  // Sort by frequency and take top words
  const keywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0])
    .slice(0, 10);  // Take top 10 keywords
  
  return keywords;
}

async function main() {
  try {
    // Check if repomix-output.txt exists
    const repomixPath = path.resolve(process.cwd(), 'repomix-output.txt');
    if (!fs.existsSync(repomixPath)) {
      console.log("repomix-output.txt not found. Please run repomix to generate a consolidated view of your codebase.");
      console.log("Example: repomix --input /path/to/your/repo --output repomix-output.txt");
      process.exit(1);
    }

    // Start the Gemini Thinking Server as a child process
    console.log("Starting Gemini Thinking Server...");
    const serverProcess = spawn("node", ["dist/gemini-index.js"], {
      stdio: ["pipe", "inherit", "inherit"],
      env: { ...process.env }
    });

    // Create a client connected to the server via stdio
    const transport = new StdioClientTransport(serverProcess.stdin);
    const client = new Client();
    await client.connect(transport);

    console.log("Connected to Gemini Thinking Server");

    // Read the codebase
    console.log("Reading codebase from repomix-output.txt...");
    const codebaseText = fs.readFileSync(repomixPath, 'utf8');
    
    // Get the analysis query from the user
    const query = await prompt("Enter your analysis query: ");
    
    // Extract keywords from the query
    const extractedKeywords = extractKeywords(query);
    console.log("Extracted keywords:", extractedKeywords.join(", "));
    
    // Ask for additional keywords
    const additionalKeywordsStr = await prompt("Enter additional keywords (comma-separated, optional): ");
    let additionalKeywords = [];
    if (additionalKeywordsStr.trim()) {
      additionalKeywords = additionalKeywordsStr.split(',').map(k => k.trim());
    }
    
    const allKeywords = [...extractedKeywords, ...additionalKeywords];
    
    // Apply semantic filtering
    console.log("\nApplying semantic filtering to identify relevant code sections...");
    const filteredCode = semanticCodeFilter(codebaseText, query, allKeywords);
    
    console.log(`\nFiltered codebase from ${codebaseText.length} to ${filteredCode.length} characters (${Math.round(filteredCode.length / codebaseText.length * 100)}% of original)`);
    
    // Ask if the user wants to save the filtered code
    const saveFilteredCode = await prompt("Do you want to save the filtered code? (y/n): ");
    if (saveFilteredCode.toLowerCase() === 'y') {
      const filteredPath = 'filtered-codebase.txt';
      fs.writeFileSync(filteredPath, filteredCode);
      console.log(`Filtered code saved to ${filteredPath}`);
    }
    
    // Optional approach
    const approach = await prompt("Enter suggested approach (optional): ");
    
    // Get the number of thoughts
    const totalThoughtsStr = await prompt("Enter the estimated number of thoughts needed: ");
    const totalThoughts = parseInt(totalThoughtsStr, 10) || 3;

    // Initialize thought tracking
    let thoughtNumber = 1;
    let nextThoughtNeeded = true;
    const previousThoughts = [];

    // Process thoughts sequentially
    while (nextThoughtNeeded && thoughtNumber <= totalThoughts) {
      console.log(`\nGenerating thought ${thoughtNumber}/${totalThoughts}...`);
      
      // Prepare the arguments for the geminithinking tool
      const args = {
        query,
        context: filteredCode,
        thoughtNumber,
        totalThoughts,
        nextThoughtNeeded: true
      };
      
      // Add optional parameters if provided
      if (approach) args.approach = approach;
      if (previousThoughts.length > 0) args.previousThoughts = previousThoughts;
      
      // Call the geminithinking tool
      const result = await client.callTool("geminithinking", args);
      
      // Parse the response
      const response = JSON.parse(result.content[0].text);
      
      // Store the thought for future reference
      if (response.thought) {
        previousThoughts.push(response.thought);
      }
      
      // Display meta information if available
      if (response.metaComments) {
        console.log(`\nMeta Comments: ${response.metaComments}`);
      }
      
      if (response.confidenceLevel) {
        console.log(`Confidence: ${response.confidenceLevel * 100}%`);
      }
      
      if (response.alternativePaths && response.alternativePaths.length > 0) {
        console.log("\nAlternative Paths:");
        response.alternativePaths.forEach((path, index) => {
          console.log(`  ${index + 1}. ${path}`);
        });
      }
      
      // Update tracking variables
      thoughtNumber = response.thoughtNumber + 1;
      nextThoughtNeeded = response.nextThoughtNeeded;
      
      // Ask if the user wants to continue to the next thought
      if (nextThoughtNeeded && thoughtNumber <= totalThoughts) {
        const continueResponse = await prompt("Continue to next thought? (y/n): ");
        if (continueResponse.toLowerCase() !== 'y') {
          nextThoughtNeeded = false;
        }
      }
    }

    console.log("\nAnalysis process completed!");
    
    // Save the analysis results
    const saveResponse = await prompt("Do you want to save the analysis results? (y/n): ");
    if (saveResponse.toLowerCase() === 'y') {
      const outputPath = await prompt("Enter the output file path: ");
      
      const output = {
        query,
        approach,
        keywords: allKeywords,
        thoughts: previousThoughts
      };
      
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      console.log(`Analysis results saved to ${outputPath}`);
    }
    
    // Ask if the user wants to save the session
    const saveSessionResponse = await prompt("Do you want to save this session for later? (y/n): ");
    if (saveSessionResponse.toLowerCase() === 'y') {
      const sessionPath = await prompt("Enter the session file path: ");
      
      // Call the geminithinking tool with the save command
      const args = {
        sessionCommand: "save",
        sessionPath,
        // These are required by the tool schema but not used for session commands
        query: "dummy",
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };
      
      const result = await client.callTool("geminithinking", args);
      const response = JSON.parse(result.content[0].text);
      
      if (response.status === "success") {
        console.log(`Session successfully saved to ${sessionPath}`);
      } else {
        console.error(`Failed to save session: ${response.message}`);
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Clean up
    rl.close();
    process.exit(0);
  }
}

// Run the main function
main().catch(console.error);