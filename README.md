# ZK Notes Raycast Extension

A Raycast extension for searching ZK notes with fuzzy search capabilities.

## Commands

- **Search ZK Notes**: Fuzzy search through your ZK notes with live results

Note: The "New ZK Note" command is handled by the separate shell script at `../zk.sh`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Open in Raycast:
   - Open Raycast
   - Go to Extensions → Development
   - Import the extension from this directory

## Configuration

The extension uses these environment variables (with defaults):
- `ZK_NOTEBOOK_DIR`: Path to your ZK notes directory (default: `~/Sync/Notes`)
- `ZK_BIN`: Path to zk executable (default: `/opt/homebrew/bin/zk`)

## Development

```bash
# Run in development mode
npm run dev

# Lint
npm run lint

# Fix linting issues
npm run fix-lint
```
