#!/bin/bash

# Get the most recent commit hash
COMMIT_HASH=$(git rev-parse HEAD)

# Output the URL with the commit hash
echo "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe_push_pull_state@${COMMIT_HASH}/client.js" 