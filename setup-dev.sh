#!/bin/bash

# Development Environment Setup Script
set -e

echo "🛠️  Setting up development environment..."

# Check if pre-commit is available
if command -v pre-commit >/dev/null 2>&1; then
    echo "✅ Installing pre-commit hooks..."
    pre-commit install
    echo "✅ Pre-commit hooks installed"
else
    echo "⚠️  Pre-commit not found. Install with: pip install pre-commit"
    echo "   Then run: pre-commit install"
fi

# Check EditorConfig support
if command -v code >/dev/null 2>&1; then
    echo "✅ VSCode detected - EditorConfig should work automatically"
elif command -v vim >/dev/null 2>&1; then
    echo "ℹ️  Vim detected - install EditorConfig plugin if needed"
elif command -v emacs >/dev/null 2>&1; then
    echo "ℹ️  Emacs detected - install EditorConfig plugin if needed"
fi

# Setup git hooks
echo "✅ Configuring git settings..."
git config core.autocrlf false
git config core.eol lf

# Verify configuration files
echo "🔍 Verifying configuration files..."

if [[ -f .editorconfig ]]; then
    echo "✅ .editorconfig found"
else
    echo "❌ .editorconfig missing"
fi

if [[ -f .gitattributes ]]; then
    echo "✅ .gitattributes found"  
else
    echo "❌ .gitattributes missing"
fi

if [[ -f .pre-commit-config.yaml ]]; then
    echo "✅ .pre-commit-config.yaml found"
else
    echo "❌ .pre-commit-config.yaml missing"
fi

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Restart your editor to apply EditorConfig settings"
echo "   2. Install pre-commit: pip install pre-commit"
echo "   3. Enable hooks: pre-commit install" 
echo "   4. Test setup: pre-commit run --all-files"
echo ""
echo "📚 Documentation:"
echo "   - EditorConfig: https://editorconfig.org/"
echo "   - Pre-commit: https://pre-commit.com/"
echo "   - Git attributes: https://git-scm.com/docs/gitattributes"