#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

// Example query
const exampleQuery = "What are the key considerations for designing a sustainable urban transportation system?";

// Example approach
const exampleApproach = "Consider environmental impact, economic feasibility, and social accessibility.";

async function runClient() {
  try {
    // Start the Gemini Thinking Server as a child process
    console.log("Starting Gemini Thinking Server...");
    const serverProcess = spawn("node", ["dist/index.js"], {
      stdio: ["pipe", "inherit", "inherit"],
      env: { ...process.env }
    });

    // Create a client connected to the server via stdio
    const transport = new StdioClientTransport(serverProcess.stdin);
    const client = new Client();
    await client.connect(transport);

    console.log("Connected to Gemini Thinking Server");
    console.log(`\nExample Query: "${exampleQuery}"`);
    console.log(`Example Approach: "${exampleApproach}"`);

    // Initialize thought tracking
    let thoughtNumber = 1;
    let nextThoughtNeeded = true;
    const previousThoughts = [];
    const totalThoughts = 3;

    // Process thoughts sequentially
    while (nextThoughtNeeded && thoughtNumber <= totalThoughts) {
      console.log(`\nGenerating thought ${thoughtNumber}/${totalThoughts}...`);
      
      // Prepare the arguments for the geminithinking tool
      const args = {
        query: exampleQuery,
        approach: exampleApproach,
        thoughtNumber,
        totalThoughts,
        nextThoughtNeeded: true,
        previousThoughts
      };
      
      // Call the geminithinking tool
      const result = await client.callTool("geminithinking", args);
      
      // Parse the response
      const response = JSON.parse(result.content[0].text);
      
      // Store the thought for future reference
      if (response.thought) {
        previousThoughts.push(response.thought);
        console.log(`\nThought ${thoughtNumber}:\n${response.thought}`);
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
      
      // Pause between thoughts
      if (nextThoughtNeeded && thoughtNumber <= totalThoughts) {
        console.log("\nPress Enter to continue to the next thought...");
        await new Promise(resolve => {
          process.stdin.once('data', () => resolve());
        });
      }
    }

    console.log("\nAnalysis completed!");
    
    // Clean up
    serverProcess.kill();
    process.exit(0);
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run the client
runClient();