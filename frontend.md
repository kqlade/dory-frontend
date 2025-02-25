# Dory Frontend Integration Guidelines

This document outlines how data should be structured when sent from the backend to the Dory frontend extension.

## General Guidelines

- All timestamps should be in **milliseconds since epoch** (e.g., `1677776000000`)
- All responses should use camelCase for property names
- String fields should never be `null`, use empty string `""` instead
- Arrays should never be `null`, use empty array `[]` instead

## API Endpoints

### Search API

#### Request Format

```json
{
  "query": "User's search query",
  "limit": 5,
  "useHybridSearch": true,
  "useLLMExpansion": true,
  "useReranking": false
}
```

#### Expected Response Format

```json
{
  "results": [
    {
      "docId": "05005417-816f-4d08-9a2e-c00e01d87750",
      "chunkText": "This is the snippet of content that matches the query",
      "score": 0.876,
      "explanation": "This result directly addresses the query by explaining...",
      "metadata": {
        "title": "Document Title",
        "url": "https://example.com/page",
        "visitedAt": 1677776000000,
        "processedAt": 1677776010000,
        "status": "processed",
        "chunkIndex": 2,
        "totalChunks": 5
      }
    }
  ],
  "totalResults": 10,
  "metadata": {
    "total": 10,
    "query": {
      "original": "Original query",
      "dense": "expanded query for semantic search",
      "sparse": "key terms for keyword search"
    },
    "timing": {
      "total_ms": 2500,
      "expansion_ms": 500,
      "embedding_ms": 300,
      "search_ms": 400,
      "reranking_ms": 1300
    },
    "search_type": "hybrid",
    "reranking_applied": false
  }
}
```

**Important notes:**
- The `score` field is used to determine the best result, which will be highlighted in the UI
- The `chunkText` field contains the actual text snippet to display (though not currently shown in UI)
- The frontend will handle marking the highest-scoring result as `isHighlighted`

### Document Ingestion

#### Request Format

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

#### Expected Response Format

```json
{
  "docId": "05005417-816f-4d08-9a2e-c00e01d87750",
  "message": "Document stored successfully."
}
```

### Document Retrieval

#### Expected Response Format

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

## Error Handling

Error responses should follow this format:

```json
{
  "error": {
    "message": "Descriptive error message",
    "code": "ERROR_CODE",
    "details": { /* Additional error details if available */ }
  }
}
```

The frontend will display the `message` to users for user-friendly errors, or a generic error message for system errors.

## Performance Expectations

- Search responses should ideally return within 3 seconds
- Document ingestion can take longer (5-10 seconds is acceptable)
- Document retrieval should be fast (< 1 second)

## Frontend Behavior Notes

1. **Search Results Processing**:
   - The frontend marks the result with the highest `score` as highlighted
   - If `score` is not available, the first result will be highlighted
   - Currently, `chunkText` is not displayed in the UI but should still be sent correctly

2. **Refinement Searches**:
   - When a user adds details to a search, the frontend will concatenate previous queries with the new query
   - Example: Initial "React component" → Refinement "with button" → Sends "React component with button"

3. **Error Handling**:
   - Network errors will be retried 3 times with exponential backoff
   - After failed retries, a user-friendly error message will be displayed 