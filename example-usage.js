#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";
import fs from "fs";

// Example codebase snippet (in a real scenario, this would come from repomix-output.txt)
const exampleCodebase = `
File: src/auth/auth.service.ts
================
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: User) {
    const payload = { username: user.username, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}

File: src/users/users.service.ts
================
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findOne(username: string): Promise<User | undefined> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async create(username: string, password: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User();
    user.username = username;
    user.password = hashedPassword;
    return this.usersRepository.save(user);
  }
}

File: src/users/user.entity.ts
================
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;
}
`;

// Example query
const exampleQuery = "How can we improve the security of the authentication system in this codebase?";

// Example approach
const exampleApproach = "Focus on password security, token management, and potential vulnerabilities.";

async function runExample() {
  try {
    // Save the example codebase to a file
    fs.writeFileSync('example-codebase.txt', exampleCodebase);
    console.log("Example codebase saved to example-codebase.txt");

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
        context: exampleCodebase,
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

    console.log("\nExample analysis completed!");
    
    // Clean up
    serverProcess.kill();
    process.exit(0);
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run the example
runExample();