#!/bin/bash
# Sync SKILLS to .claude/commands for Claude Code slash commands

set -e

SKILLS_DIR="SKILLS"
CLAUDE_COMMANDS_DIR=".claude/commands"

# Create commands directory if it doesn't exist
mkdir -p "$CLAUDE_COMMANDS_DIR"

# Copy all SKILL.md files to .claude/commands/
for skill_dir in "$SKILLS_DIR"/*; do
    if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
        skill_name=$(basename "$skill_dir")
        echo "Syncing $skill_name..."
        cp "$skill_dir/SKILL.md" "$CLAUDE_COMMANDS_DIR/$skill_name.md"
    fi
done

echo "Skills synced to Claude Code commands directory!"