#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
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

async function main() {
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

  try {
    // List available tools
    const { tools } = await client.listTools();
    console.log("Available tools:", tools.map(tool => tool.name).join(", "));

    // Get the query from the user
    const query = await prompt("Enter your query: ");
    
    // Optional context
    const context = await prompt("Enter additional context (optional): ");
    
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
        thoughtNumber,
        totalThoughts,
        nextThoughtNeeded: true
      };
      
      // Add optional parameters if provided
      if (context) args.context = context;
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

    console.log("\nThinking process completed!");
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Clean up
    rl.close();
    serverProcess.kill();
  }
}

main().catch(console.error);