#!/bin/bash

# Get the most recent commit hash
COMMIT_HASH=$(git rev-parse HEAD)

# Output the URL with the commit hash
echo "https://cdn.jsdelivr.net/gh/jeffreyyoung/poe-db-prototype@${COMMIT_HASH}/app.js"