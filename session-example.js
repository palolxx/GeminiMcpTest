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

async function main() {
  try {
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

    // Main menu
    while (true) {
      console.log("\n=== Gemini Thinking Session Manager ===");
      console.log("1. Start a new analysis session");
      console.log("2. Save current session");
      console.log("3. Load a saved session");
      console.log("4. Get current session state");
      console.log("5. Exit");
      
      const choice = await prompt("Enter your choice (1-5): ");
      
      if (choice === "1") {
        // Start a new analysis session
        await startNewSession(client);
      } else if (choice === "2") {
        // Save current session
        const sessionPath = await prompt("Enter the path to save the session: ");
        await saveSession(client, sessionPath);
      } else if (choice === "3") {
        // Load a saved session
        const sessionPath = await prompt("Enter the path of the session to load: ");
        await loadSession(client, sessionPath);
      } else if (choice === "4") {
        // Get current session state
        await getSessionState(client);
      } else if (choice === "5") {
        // Exit
        console.log("Exiting...");
        break;
      } else {
        console.log("Invalid choice. Please try again.");
      }
    }
    
    // Clean up
    rl.close();
    serverProcess.kill();
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

async function startNewSession(client) {
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

  console.log("\nAnalysis session completed!");
}

async function saveSession(client, sessionPath) {
  try {
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
  } catch (error) {
    console.error("Error saving session:", error);
  }
}

async function loadSession(client, sessionPath) {
  try {
    // Call the geminithinking tool with the load command
    const args = {
      sessionCommand: "load",
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
      console.log(`Session successfully loaded from ${sessionPath}`);
      console.log(`Loaded ${response.thoughtHistoryLength} thoughts and ${response.branches.length} branches`);
    } else {
      console.error(`Failed to load session: ${response.message}`);
    }
  } catch (error) {
    console.error("Error loading session:", error);
  }
}

async function getSessionState(client) {
  try {
    // Call the geminithinking tool with the getState command
    const args = {
      sessionCommand: "getState",
      // These are required by the tool schema but not used for session commands
      query: "dummy",
      thoughtNumber: 1,
      totalThoughts: 1,
      nextThoughtNeeded: false
    };
    
    const result = await client.callTool("geminithinking", args);
    const response = JSON.parse(result.content[0].text);
    
    if (response.status === "success") {
      console.log("\nCurrent Session State:");
      console.log(`Total thoughts: ${response.thoughtHistoryLength}`);
      console.log(`Branches: ${response.branches.join(", ") || "None"}`);
      
      if (response.lastThought) {
        console.log("\nLast thought:");
        console.log(`Number: ${response.lastThought.thoughtNumber}`);
        console.log(`Query: ${response.lastThought.query}`);
        console.log(`Thought: ${response.lastThought.thought.substring(0, 100)}...`);
      } else {
        console.log("\nNo thoughts in the current session");
      }
    } else {
      console.error(`Failed to get session state: ${response.message}`);
    }
  } catch (error) {
    console.error("Error getting session state:", error);
  }
}

// Run the main function
main().catch(console.error);