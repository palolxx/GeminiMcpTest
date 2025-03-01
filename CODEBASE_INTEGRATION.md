# Integrating Gemini Thinking Server with Your Codebase

This guide explains how to integrate the Gemini Thinking Server with your codebase to provide context-aware analytical thinking.

## Overview

The Gemini Thinking Server can analyze your codebase and provide thoughtful insights without generating code. This is particularly useful for:

- Understanding complex code structures
- Planning refactoring strategies
- Analyzing architectural decisions
- Identifying potential issues or improvements

## Setup

### 1. Prepare Your Codebase

First, you need to prepare your codebase for analysis. You can use tools like `repomix` to create a consolidated view of your codebase:

```bash
# Install repomix if you haven't already
npm install -g repomix

# Generate a consolidated view of your codebase
repomix --input /path/to/your/repo --output repomix-output.txt
```

### 2. Load Codebase Context

When using the Gemini Thinking Server, you can provide the codebase as context:

```javascript
// Read the repomix output
const fs = require('fs');
const codebaseContext = fs.readFileSync('repomix-output.txt', 'utf8');

// Prepare the arguments for the geminithinking tool
const args = {
  query: "How can we improve the error handling in this codebase?",
  context: codebaseContext,
  thoughtNumber: 1,
  totalThoughts: 5,
  nextThoughtNeeded: true
};

// Call the geminithinking tool
const result = await client.callTool("geminithinking", args);
```

## Filtering Relevant Code

### Basic Filtering

For large codebases, you might want to filter only the relevant parts to provide as context:

```javascript
function extractRelevantCode(codebaseText, relevantFiles) {
  const lines = codebaseText.split('\n');
  let relevantCode = '';
  let isRelevantFile = false;
  
  for (const line of lines) {
    if (line.startsWith('File: ')) {
      const filePath = line.substring(6).trim();
      isRelevantFile = relevantFiles.some(pattern => 
        new RegExp(pattern).test(filePath)
      );
    }
    
    if (isRelevantFile) {
      relevantCode += line + '\n';
    }
  }
  
  return relevantCode;
}

// Example usage
const relevantFiles = [
  'src/error-handling/.*\\.ts$',
  'src/utils/errors\\.ts$'
];
const filteredContext = extractRelevantCode(codebaseContext, relevantFiles);
```

### Advanced Semantic Filtering

For more intelligent filtering, you can use the advanced semantic filtering capabilities:

```javascript
// Function to extract keywords from a query
function extractKeywords(query) {
  // Remove common stop words
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
    // ... more stop words
  ]);
  
  // Split the query into words, filter out stop words and short words
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .split(/\s+/)
    .filter(word => !stopWords.has(word) && word.length > 3);
  
  // Count word frequency and return top keywords
  const wordFreq = {};
  for (const word of words) {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  }
  
  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0])
    .slice(0, 10);  // Take top 10 keywords
}

// Function for semantic code filtering
function semanticCodeFilter(codebaseText, query, keywords) {
  const lines = codebaseText.split('\n');
  let fileScores = new Map();
  let fileContent = new Map();
  let currentFile = '';
  let currentFileContent = '';
  
  // First pass: collect all files and their content
  for (const line of lines) {
    if (line.startsWith('File: ')) {
      if (currentFile && currentFileContent) {
        fileContent.set(currentFile, currentFileContent);
      }
      
      currentFile = line.substring(6).trim();
      currentFileContent = line + '\n';
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
    
    // Score based on query terms and keywords
    // ... scoring logic
    
    fileScores.set(file, score);
  }
  
  // Sort files by score and take the top ones
  const sortedFiles = [...fileScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);  // Take top 10 most relevant files
  
  // Combine the content of the most relevant files
  let relevantCode = '';
  for (const [file, _] of sortedFiles) {
    relevantCode += fileContent.get(file) + '\n';
  }
  
  return relevantCode;
}

// Example usage
const query = "How can we improve error handling in the authentication system?";
const extractedKeywords = extractKeywords(query);
const additionalKeywords = ['exception', 'try', 'catch', 'throw', 'error'];
const allKeywords = [...extractedKeywords, ...additionalKeywords];

const filteredCode = semanticCodeFilter(codebaseContext, query, allKeywords);
```

For a complete implementation, see the `advanced-filtering-example.js` file.

## Advanced Integration

### Incremental Analysis

For complex problems, you can use incremental analysis by feeding previous thoughts back into the system:

```javascript
// First thought
const firstThoughtArgs = {
  query: "What's the overall architecture of this system?",
  context: codebaseContext,
  thoughtNumber: 1,
  totalThoughts: 3,
  nextThoughtNeeded: true
};

const firstResult = await client.callTool("geminithinking", firstThoughtArgs);
const firstResponse = JSON.parse(firstResult.content[0].text);

// Second thought that builds on the first
const secondThoughtArgs = {
  query: "What are the key components that need improvement?",
  context: codebaseContext,
  previousThoughts: [firstResponse.thought],
  thoughtNumber: 2,
  totalThoughts: 3,
  nextThoughtNeeded: true
};

const secondResult = await client.callTool("geminithinking", secondThoughtArgs);
```

### Branching Analysis

You can explore alternative approaches by creating thought branches:

```javascript
// Create a branch from thought #2
const branchThoughtArgs = {
  query: "What if we used a different architectural pattern?",
  context: codebaseContext,
  previousThoughts: [firstResponse.thought, secondResponse.thought],
  branchFromThought: 2,
  branchId: "alternative-architecture",
  thoughtNumber: 1,
  totalThoughts: 2,
  nextThoughtNeeded: true
};

const branchResult = await client.callTool("geminithinking", branchThoughtArgs);
```

### Session Persistence

You can save and resume analysis sessions:

```javascript
// Save the current session
const saveSessionArgs = {
  sessionCommand: "save",
  sessionPath: "/path/to/save/session.json",
  query: "dummy",
  thoughtNumber: 1,
  totalThoughts: 1,
  nextThoughtNeeded: false
};

const saveResult = await client.callTool("geminithinking", saveSessionArgs);

// Later, load the session
const loadSessionArgs = {
  sessionCommand: "load",
  sessionPath: "/path/to/save/session.json",
  query: "dummy",
  thoughtNumber: 1,
  totalThoughts: 1,
  nextThoughtNeeded: false
};

const loadResult = await client.callTool("geminithinking", loadSessionArgs);
```

## Best Practices

1. **Provide Focused Context**: Only include relevant parts of your codebase to avoid overwhelming the model.
2. **Use Advanced Filtering**: Leverage semantic filtering to automatically identify the most relevant code sections.
3. **Ask Specific Questions**: More specific queries yield more useful insights.
4. **Build Incrementally**: Start with high-level understanding and drill down in subsequent thoughts.
5. **Consider Alternatives**: Use branching to explore different approaches.
6. **Review Meta-Commentary**: Pay attention to the confidence levels and alternative paths suggested.
7. **Save Sessions**: For complex analyses, save your sessions to resume later.

## Example Workflow

1. Generate a consolidated view of your codebase
2. Apply semantic filtering to identify relevant code sections
3. Ask for a high-level architectural overview
4. Identify specific areas that need improvement
5. For each area, request detailed analysis
6. Explore alternative solutions through branching
7. Save the session for future reference
8. Implement the most promising solutions

By following this workflow, you can leverage the Gemini Thinking Server to gain valuable insights into your codebase without generating code directly.