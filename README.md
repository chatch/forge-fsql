# Forge FSQL CLI

[![NPM Package](https://img.shields.io/npm/v/forge-fsql.svg?style=flat-square)](https://www.npmjs.org/package/forge-fsql)

Interactive CLI for querying Atlassian Forge SQL databases via web triggers.

## Demo

![demo](demo-usage.gif)

## Features

- 🎨 Table formatting with colors
- ⚡ Special commands (.tables, .describe, .schema)
- ⌨️ Command history (↑/↓ arrows)
- 💾 Persistent history across sessions
- ⏱️ Query timing
- 📝 Multi-line SQL support

## Security

- Disabled in Production - returns a 403 error if you attempt to call it

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
- creates the webtrigger with `forge webtrigger create` (default environment which is `DEVELOPMENT` in a standard setup)
- adds the webtrigger URL to a FORGE_SQL_WEBTRIGGER environment variable in .env

## Run

```sh
fsql
```

## Upgrade

```sh
# upgrade the CLI
> npm install -g forge-fsql@latest

# run the setup from the root of your project to pick up the new version
# it will install fsql.ts again and redeploy again
myforgeproject> fsql-setup
```
