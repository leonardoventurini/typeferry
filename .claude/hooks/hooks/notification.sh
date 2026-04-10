#!/bin/bash

# Filters out "waiting for input" notifications but plays sound for others

# Read the JSON input from stdin
JSON_INPUT=$(cat)

# Extract the message using jq or fallback to grep
if command -v jq >/dev/null 2>&1; then
    MESSAGE=$(echo "$JSON_INPUT" | jq -r '.message' 2>/dev/null)
else
    # Fallback: extract message using grep
    MESSAGE=$(echo "$JSON_INPUT" | grep -o '"message":"[^"]*"' | sed 's/"message":"\(.*\)"/\1/')
fi

# Check if this is a "waiting for input" notification
if [[ "$MESSAGE" == "Claude is waiting for your input" ]]; then
    # Exit without playing sound
    exit 0
fi

# Play notification sound for all other notifications
afplay /System/Library/Sounds/Sosumi.aiff

# Exit successfully
exit 0
