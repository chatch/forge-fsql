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

```bash
pnpm add -D forge-fsql
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "sql": "fsql"
  }
}
```

### Global Installation

```bash
pnpm add -g forge-fsql
```

## Configuration

Create a `.env` file in your project root:

```bash
FORGE_SQL_URL=https://your-trigger-url.forge.atlassian.com/sql
```

Or pass via command line:

```bash
fsql --url https://your-trigger-url.com
```

## Usage

```bash
# If installed in project
pnpm sql

# If installed globally
fsql
```
