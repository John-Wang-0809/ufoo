#!/bin/bash
# UFOO Landing Page - Vercel Deployment Script

set -e

echo "🚀 Deploying UFOO Landing Page to Vercel..."

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Deploy to Vercel
echo "📦 Deploying to production..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your site should be live at:"
echo "   https://ufoo.dev"
echo "   https://www.ufoo.dev"
echo ""
echo "📝 To configure custom domain:"
echo "   1. Go to Vercel Dashboard > Project Settings > Domains"
echo "   2. Add 'ufoo.dev' as custom domain"
echo "   3. Configure DNS records as instructed by Vercel"
echo ""
