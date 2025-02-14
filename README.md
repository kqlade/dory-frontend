# DORY: Dynamic Online Recall for You

DORY is a Chrome extension that enhances your browsing experience by automatically processing and indexing the web pages you visit, making them searchable through semantic search.

## Features

- **Automatic Content Processing**: Processes web pages as you browse
- **Smart Content Extraction**: Filters out irrelevant content like ads, navigation, and footers
- **Markdown Conversion**: Converts web content into clean, readable Markdown
- **Semantic Search**: Uses vector embeddings for intelligent content searching
- **Background Processing**: Works silently in the background without affecting your browsing

## Architecture

### Components

1. **Service Worker**
   - Manages browser history monitoring
   - Handles the processing queue
   - Coordinates content extraction

2. **Content Extractor**
   - Extracts relevant content from web pages
   - Converts HTML to Markdown
   - Chunks content for processing
   - Generates embeddings via backend

3. **Backend Integration**
   - Provides embeddings generation
   - Health monitoring
   - API endpoints for extension functionality

### Processing Pipeline

1. URL added to queue from browser history
2. Content extracted and filtered
3. Converted to Markdown format
4. Split into manageable chunks
5. Embeddings generated for semantic search

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm
- Chrome browser
- Backend server running (see Backend Setup)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dory-extension.git
cd dory-extension
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory from your build

### Backend Setup

1. Ensure the backend server is running on `http://localhost:3000`
2. Available endpoints:
   - `/api/health`: Health check endpoint
   - `/api/embeddings`: Embeddings generation endpoint

## Development

### Project Structure

```
src/
├── api/                 # API client and configuration
├── background/          # Service worker and background scripts
├── chunking/           # Text chunking strategies
├── html2text/          # HTML to text conversion
├── services/           # Core services (queue, indexing)
└── pages/              # Extension UI pages
```

### Key Files

- `src/background/serviceWorker.ts`: Main service worker
- `src/services/contentExtractor.ts`: Content processing
- `src/api/client.ts`: Backend communication
- `src/background/config.ts`: Configuration settings

### Building

```bash
# Development build with watch mode
npm run dev

# Production build
npm run build
```

## Configuration

Key configuration files:

1. `src/background/config.ts`:
   - History processing settings
   - Window management
   - Queue processing
   - Logging configuration

2. `src/api/config.ts`:
   - API endpoints
   - Request timeouts
   - Retry settings

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

[Add your license here]

## Acknowledgments

- Built with [Vite](https://vitejs.dev/)
- Uses [LangChain](https://js.langchain.com/) for text processing
- Markdown conversion inspired by html2text 