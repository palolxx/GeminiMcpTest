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

// Function to extract relevant code from the codebase
function extractRelevantCode(codebaseText, relevantFiles) {
  const lines = codebaseText.split('\n');
  let relevantCode = '';
  let isRelevantFile = false;
  let currentFile = '';
  
  for (const line of lines) {
    if (line.startsWith('File: ')) {
      currentFile = line.substring(6).trim();
      isRelevantFile = relevantFiles.some(pattern => 
        new RegExp(pattern).test(currentFile)
      );
      
      if (isRelevantFile) {
        relevantCode += line + '\n';
      }
    } else if (isRelevantFile) {
      relevantCode += line + '\n';
    }
  }
  
  return relevantCode;
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
    
    // Ask the user if they want to filter the codebase
    const filterResponse = await prompt("Do you want to filter the codebase to specific files? (y/n): ");
    
    let context = codebaseText;
    if (filterResponse.toLowerCase() === 'y') {
      const filterPattern = await prompt("Enter regex patterns for files to include (comma-separated): ");
      const patterns = filterPattern.split(',').map(p => p.trim());
      
      console.log("Filtering codebase...");
      context = extractRelevantCode(codebaseText, patterns);
      console.log(`Filtered codebase from ${codebaseText.length} to ${context.length} characters`);
    }
    
    // Get the analysis query from the user
    const query = await prompt("Enter your analysis query: ");
    
    // Optional approach
    const approach = await prompt("Enter suggested approach (optional): ");
    
    // Get the number of thoughts
    const totalThoughtsStr = await prompt("Enter the estimated number of thoughts needed: ");
    const totalThoughts = parseInt(totalThoughtsStr, 10) || 3;

    // Initialize thought tracking
    let thoughtNumber = 1;
    let nextThoughtNeeded = true;
    const previousThoughts = [];
    const thoughtResponses = [];

    // Process thoughts sequentially
    while (nextThoughtNeeded && thoughtNumber <= totalThoughts) {
      console.log(`\nGenerating thought ${thoughtNumber}/${totalThoughts}...`);
      
      // Prepare the arguments for the geminithinking tool
      const args = {
        query,
        context,
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
      thoughtResponses.push(response);
      
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
        console.log("Alternative Paths:");
        response.alternativePaths.forEach((path, index) => {
          console.log(`  ${index + 1}. ${path}`);
        });
      }
      
      // Update tracking variables
      thoughtNumber = response.thoughtNumber + 1;
      nextThoughtNeeded = response.nextThoughtNeeded;
      
      // Ask if the user wants to explore an alternative path
      if (response.alternativePaths && response.alternativePaths.length > 0) {
        const exploreAltResponse = await prompt("Do you want to explore an alternative path? (y/n): ");
        
        if (exploreAltResponse.toLowerCase() === 'y') {
          const altIndexStr = await prompt(`Enter the number of the alternative path (1-${response.alternativePaths.length}): `);
          const altIndex = parseInt(altIndexStr, 10) - 1;
          
          if (altIndex >= 0 && altIndex < response.alternativePaths.length) {
            const altPath = response.alternativePaths[altIndex];
            console.log(`\nExploring alternative path: ${altPath}`);
            
            // Create a branch
            const branchId = `alt-path-${Date.now()}`;
            const branchArgs = {
              query: `Alternative approach: ${altPath}`,
              context,
              previousThoughts,
              branchFromThought: response.thoughtNumber,
              branchId,
              thoughtNumber: 1,
              totalThoughts: 2,
              nextThoughtNeeded: true
            };
            
            // Call the geminithinking tool for the branch
            console.log("\nGenerating branch thought...");
            const branchResult = await client.callTool("geminithinking", branchArgs);
            const branchResponse = JSON.parse(branchResult.content[0].text);
            
            // Store the branch thought
            thoughtResponses.push(branchResponse);
          }
        }
      }
      
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
        thoughts: thoughtResponses
      };
      
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      console.log(`Analysis results saved to ${outputPath}`);
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Clean up
    rl.close();
    process.exit(0);
  }
}

main().catch(console.error);