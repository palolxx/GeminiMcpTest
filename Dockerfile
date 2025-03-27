# Generated by https://smithery.ai. See: https://smithery.ai/docs/config#dockerfile
FROM node:lts-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (ignoring scripts)
RUN npm install --ignore-scripts

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Expose port if necessary, but MCP typically uses stdio

# Command to run the MCP server
CMD [ "node", "dist/index.js" ]
