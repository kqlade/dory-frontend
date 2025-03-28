# DORY Frontend

Browser extension for DORY: Dynamic Online Recall for You.

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create `.env` file with required environment variables:
   ```
   GOOGLE_OAUTH_CLIENT_ID=your_oauth_client_id
   ```
4. Start the development server:
   ```
   npm run dev
   ```

## Building for Testing

For beta testing purposes, use the development build which maintains a consistent extension ID:

```
npm run build:dev
```

This build includes a special key in the manifest.json that ensures the extension ID will always be `lpakbliolpachklhclboioiadnklogdl` when loaded unpacked.

## Building for Production

For Chrome Web Store submission, use the production build:

```
npm run build:prod
```

This removes the key from manifest.json, allowing Chrome Web Store to assign an official extension ID.

## Extension ID Consistency

- During development, the extension uses a special key in manifest.json to maintain the ID `lpakbliolpachklhclboioiadnklogdl`
- This allows beta testers to have the same extension ID, which is important for compatibility
- When published to the Chrome Web Store, this key is removed to allow Google to assign an official ID

## Documentation

- [Beta Testing Instructions](docs/BETA_TESTING.md) 