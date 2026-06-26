# Use a lightweight Node.js image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and install dependencies first (better for caching)
COPY package*.json ./
RUN npm install

# Copy the rest of your project files
COPY . .

# Expose the port you mentioned
EXPOSE 3030

# The start command you normally use
CMD ["npm", "run", "dev"]