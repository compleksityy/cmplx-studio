#!/bin/bash
# CMPLX Studio build script.

set -e

echo "Installing dependencies..."
npm install

echo "Type-checking..."
npm run typecheck

echo "Running unit tests..."
npm run test

echo "Building application..."
npm run build

echo "Build completed successfully!"
echo "Run the app with: npm start"