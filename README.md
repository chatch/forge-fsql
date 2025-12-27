# Forge FSQL CLI

Interactive command-line interface for querying Atlassian Forge SQL databases via web triggers.

## Features

- 🎨 Table formatting with colors
- ⚡ Special commands (.tables, .describe, .schema)
- ⌨️ Command history (↑/↓ arrows)
- 💾 Persistent history across sessions
- ⏱️ Query timing
- 📝 Multi-line SQL support

## Installation

### In Your Forge Project

```sh
npm install -g forge-fsql

fsql-setup
```

Notes:

- creates a webtrigger in your manifest.yml
- creates a module at src/fsql.ts for the webtrigger function
- deploys the project with the new manifest
- creates the webtrigger with `forge webtrigger create`
- adds the webtrigger URL to a FORGE_SQL_WEBTRIGGER environment variable in .env

## Run

```sh
fsql
```
