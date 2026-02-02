#!/bin/bash
# UFOO npm Package Publishing Script

set -e

PACKAGE_DIR="${1:-.}"
cd "$PACKAGE_DIR"

echo "📦 UFOO npm Publishing Script"
echo "=============================="
echo ""

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found in current directory"
    exit 1
fi

# Get package info
PACKAGE_NAME=$(node -p "require('./package.json').name")
PACKAGE_VERSION=$(node -p "require('./package.json').version")

echo "Package: $PACKAGE_NAME"
echo "Version: $PACKAGE_VERSION"
echo ""

# Check if logged into npm
echo "🔐 Checking npm login status..."
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged into npm. Please run: npm login"
    exit 1
fi

NPM_USER=$(npm whoami)
echo "✅ Logged in as: $NPM_USER"
echo ""

# Run tests if they exist
if npm run test --if-present &> /dev/null; then
    echo "🧪 Running tests..."
    npm test
    echo "✅ Tests passed"
    echo ""
fi

# Build if build script exists
if npm run build --if-present &> /dev/null; then
    echo "🔨 Building package..."
    npm run build
    echo "✅ Build complete"
    echo ""
fi

# Confirm publish
echo "⚠️  About to publish $PACKAGE_NAME@$PACKAGE_VERSION to npm"
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Publish cancelled"
    exit 1
fi

# Publish
echo "🚀 Publishing to npm..."
npm publish --access public

echo ""
echo "✅ Successfully published $PACKAGE_NAME@$PACKAGE_VERSION!"
echo ""
echo "📥 Users can now install with:"
echo "   npm install $PACKAGE_NAME"
echo "   npm install -g $PACKAGE_NAME"
echo ""
