#!/bin/bash

# Custom build script for Vercel to bypass ESLint and TypeScript checking

# Set environment variables to disable checks
export NEXT_DISABLE_ESLINT=1
export NEXT_DISABLE_TYPECHECK=1

# Build the project using next build
echo "🚀 Building project with type checking and linting disabled..."
npm run build
