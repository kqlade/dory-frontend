# Dory Backend API Documentation

## API Endpoints and Payload Structures

### 1. Document Ingestion

#### `POST /api/documents`

Stores a single document in the system.

**Request Body:**
```json
{
  "fullText": "The complete text content of the webpage",
  "metadata": {
    "title": "Page Title",
    "url": "https://example.com/page",
    "visitedAt": 1677776000000,
    "processedAt": 1677776010000,
    "status": "processed"
  }
}
```

**Response:**
```json
{
  "docId": "05005417-816f-4d08-9a2e-c00e01d87750",
  "message": "Document stored successfully.",
  "chunks": 5,
  "metrics": {
    "avgLength": 140,
    "totalChunks": 5,
    "boundaries": {
      "paragraphs": 3,
      "sentences": 2,
      "other": 0
    },
    "sparseStats": {
      "avgNonZeroTerms": 15,
      "topTerms": [
        { "term": "example", "count": 3 },
        { "term": "text", "count": 2 }
      ]
    }
  }
}
```

#### `POST /api/documents/batch`

Stores multiple documents in a single request.

**Request Body:**
```json
{
  "documents": [
    {
      "fullText": "Document 1 content",
      "metadata": {
        "title": "Document 1",
        "url": "https://example.com/doc1",
        "visitedAt": 1677776000000,
        "processedAt": 1677776010000,
        "status": "processed"
      }
    },
    {
      "fullText": "Document 2 content",
      "metadata": {
        "title": "Document 2",
        "url": "https://example.com/doc2",
        "visitedAt": 1677776100000,
        "processedAt": 1677776110000,
        "status": "processed"
      }
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "docId": "05005417-816f-4d08-9a2e-c00e01d87750",
      "success": true,
      "chunks": 3,
      "metrics": { /* same structure as single document response */ }
    },
    {
      "docId": "15a05417-816f-4d08-9a2e-c00e01d87751",
      "success": true,
      "chunks": 2,
      "metrics": { /* same structure as single document response */ }
    }
  ]
}
```

### 2. Search API

#### `POST /api/search`

Search for documents based on a query.

**Request Body:**
```json
{
  "query": "Your natural language search query",
  "limit": 5,
  "useHybridSearch": true,
  "useLLMExpansion": true,
  "useReranking": true
}
```

**Parameters:**
- `query` (string, required): The user's search query
- `limit` (number, optional): Maximum number of results to return (default: 5)
- `useHybridSearch` (boolean, optional): Whether to use hybrid search (default: true)
- `useLLMExpansion` (boolean, optional): Whether to expand the query with an LLM (default: true)
- `useReranking` (boolean, optional): Whether to apply reranking (default: false)

**Response:**
```json
{
  "results": [
    {
      "docId": "05005417-816f-4d08-9a2e-c00e01d87750",
      "chunkText": "This is a snippet of the matching content...",
      "metadata": {
        "title": "Document Title",
        "url": "https://example.com/page",
        "visitedAt": 1677776000000,
        "processedAt": 1677776010000,
        "status": "processed",
        "chunkIndex": 2,
        "totalChunks": 5
      },
      "score": 0.876,
      "explanation": "This result directly addresses the query by explaining machine learning concepts with relevant examples."
    }
  ],
  "metadata": {
    "total": 1,
    "query": {
      "original": "Your natural language search query",
      "dense": "expanded query for semantic search",
      "sparse": "key terms for keyword search",
      "filters": {}
    },
    "timing": {
      "total_ms": 2500,
      "expansion_ms": 500,
      "embedding_ms": 300,
      "search_ms": 400,
      "reranking_ms": 1300
    },
    "search_type": "hybrid",
    "reranking_applied": true
  }
}
```

### 3. Document Management

#### `GET /api/documents/:docId`

Retrieves a specific document by ID.

**Response:**
```json
{
  "docId": "05005417-816f-4d08-9a2e-c00e01d87750",
  "fullText": "The complete text content of the webpage",
  "metadata": {
    "title": "Page Title",
    "url": "https://example.com/page",
    "visitedAt": 1677776000000,
    "processedAt": 1677776010000,
    "status": "processed"
  },
  "version": 1,
  "createdAt": 1677776010000
}
```

#### `PUT /api/documents/:docId/reprocess`

Triggers reprocessing of an existing document.

**Response:**
```json
{
  "docId": "05005417-816f-4d08-9a2e-c00e01d87750",
  "message": "Document reprocessed successfully.",
  "chunks": 5,
  "metrics": { /* same structure as document ingestion response */ }
}
```

## Error Format

Error responses follow this format:

```json
{
  "error": {
    "message": "Descriptive error message",
    "code": "ERROR_CODE",
    "details": { /* Additional error details if available */ }
  }
}
```

Common error codes:
- `VALIDATION_ERROR`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `AUTHENTICATION_ERROR`: Authentication issues
- `QUERY_EXPANSION_ERROR`: Error during query expansion
- `SEARCH_ERROR`: Error during search process
- `RERANKING_ERROR`: Error during result reranking

## Performance Considerations

1. **Search Latency**: 
   - First-pass search typically completes in 1-3 seconds
   - When reranking is enabled, expect additional 1-3 seconds

2. **Document Ingestion**:
   - Single document ingestion usually takes 2-5 seconds
   - Batch processing is more efficient for multiple documents

3. **Rate Limits**:
   - Search: 10 requests per minute
   - Document ingestion: 20 documents per minute
   - Document retrieval: 60 requests per minute

## Implementation Recommendations

### 1. Search Implementation

1. **Progressive Loading**:
   - Show first-pass results immediately
   - Update with reranked results when available

2. **Search Options UI**:
   - Provide toggles for advanced features (hybrid search, reranking)
   - Set sensible defaults (hybrid: on, reranking: off)

3. **Query Caching**:
   - Cache search results client-side for identical queries
   - Include a "refresh" option to bypass cache

### 2. Document Ingestion

1. **Background Processing**:
   - Submit documents for processing in the background
   - Don't block UI during document ingestion

2. **Batch Uploads**:
   - Group multiple documents into a single batch request
   - Implement retry with exponential backoff

### 3. Error Handling

1. **User-Friendly Messages**:
   - Map error codes to user-friendly messages
   - Provide actionable remediation steps

2. **Graceful Degradation**:
   - Fall back to simpler search when advanced features fail
   - Cache successful results for offline availability

## Example Frontend Implementation

### Search Component

```typescript
// Basic search component example
async function searchDocs(query: string, options = { useReranking: false }) {
  setLoading(true);
  
  try {
    const response = await fetch('https://api.dory.example/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        query,
        limit: 10,
        useHybridSearch: true,
        useLLMExpansion: true,
        useReranking: options.useReranking
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error.message || 'Search failed');
    }
    
    const data = await response.json();
    
    // Display results
    setResults(data.results);
    setSearchMetadata(data.metadata);
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading(false);
  }
}
```

