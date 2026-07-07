# Use an official Node.js runtime as the base image
FROM node:20-alpine

# Create and set the working directory inside the container
WORKDIR /app

# Copy dependency definitions first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev --legacy-peer-deps


# Copy the rest of the application code
COPY . .

# Expose the port your app listens on
EXPOSE 8081

# Start the application
CMD ["npm", "run","start"]
