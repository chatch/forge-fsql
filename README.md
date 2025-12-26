# Forge FSQL CLI

Interactive command-line interface for querying Atlassian Forge SQL databases via web triggers.

## Features

- 🎨 Beautiful table formatting with colors
- 📝 Multi-line SQL support
- ⌨️ Command history (↑/↓ arrows)
- ⚡ Special commands (.tables, .describe, .schema)
- ⏱️ Query timing
- 💾 Persistent history across sessions

## Installation

### In Your Forge Project

```sh
npm install -D forge-fsql

# add webtrigger to manifest.yml and a wrapper module for the corresponding function
node_modules/.bin/fsql-setup

# deploy with the webtrigger
forge deploy

# get trigger url:
forge webtrigger create --product Confluence --site <site>.atlassian.net --functionKey execute-sql
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "fsql": "fsql"
  }
}
```

## Run

```sh
# set URL using value from previous step
export FORGE_SQL_URL=https://your-trigger-url.com

# run fsql!
npm run fsql

# or
npm run fsql --url https://your-trigger-url.com
```
