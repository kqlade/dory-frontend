# Dory Backend API Documentation

## Overview
This document provides detailed instructions for frontend integration with the Dory backend API. The API supports document ingestion, search, and embedding operations.

## Base URL
```
http://localhost:3000/api
```

## API Endpoints

### 1. Document Ingestion
Endpoint for storing new documents in the system.

#### POST /documents
```http
POST /api/documents
Content-Type: application/json
```

##### Request Payload
```json
{
  "fullText": "string",
  "metadata": {
    "title": "string",
    "url": "string",
    "visitedAt": number,  // Unix timestamp
    "processedAt": number,  // Unix timestamp
    "status": "processed"
  }
}
```

##### Example
```json
{
  "fullText": "TypeScript is a programming language developed and maintained by Microsoft...",
  "metadata": {
    "title": "TypeScript Guide",
    "url": "https://example.com/typescript-guide",
    "visitedAt": 1710864000000,
    "processedAt": 1710864000000,
    "status": "processed"
  }
}
```

##### Response
```json
{
  "docId": "string",
  "message": "Document stored successfully.",
  "chunks": number,
  "metrics": {
    "avgLength": number,
    "totalChunks": number,
    "boundaries": {
      "paragraphs": number,
      "sentences": number,
      "other": number
    }
  }
}
```

### 2. Search
Endpoint for searching through ingested documents.

#### POST /search
```http
POST /api/search
Content-Type: application/json
```

##### Request Payload
```json
{
  "userQuery": "string"
}
```

##### Example
```json
{
  "userQuery": "What are the best practices for TypeScript development?"
}
```

##### Response
```json
{
  "results": [
    {
      "contentId": "string",
      "finalScore": number,  // Between 0 and 1
      "explanation": "string",
      "isHighlighted": boolean,
      "metadata": {
        "url": "string",
        "title": "string",
        "visitedAt": number,
        "snippet": "string"
      }
    }
  ],
  "reasoning": "string",
  "totalResults": number
}
```

### 3. Batch Document Ingestion
Endpoint for storing multiple documents at once.

#### POST /documents/batch
```http
POST /api/documents/batch
Content-Type: application/json
```

##### Request Payload
```json
{
  "documents": [
    {
      "fullText": "string",
      "metadata": {
        "title": "string",
        "url": "string",
        "visitedAt": number,
        "processedAt": number,
        "status": "processed"
      }
    }
  ]
}
```

##### Response
```json
{
  "results": [
    {
      "docId": "string",
      "success": boolean,
      "chunks": number,
      "metrics": {
        "avgLength": number,
        "totalChunks": number,
        "boundaries": {
          "paragraphs": number,
          "sentences": number,
          "other": number
        }
      }
    }
  ]
}
```

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "error": "string",
  "statusCode": number,
  "stack": "string"  // Only in development mode
}
```

Common status codes:
- 400: Bad Request (invalid input)
- 404: Not Found
- 429: Rate Limit Exceeded
- 500: Internal Server Error

## Best Practices

1. **Document Ingestion**
   - Keep document size under 300kb
   - Include all required metadata fields
   - Use ISO timestamps for dates
   - Set appropriate content type headers

2. **Search Queries**
   - Keep queries between 2-500 characters
   - Use natural language for better results
   - Include context when possible
   - Handle empty result sets gracefully

3. **Error Handling**
   - Implement retry logic for 429 responses
   - Log error details for debugging
   - Show user-friendly error messages
   - Handle network timeouts

4. **Performance**
   - Cache search results when appropriate
   - Batch document uploads when possible
   - Implement request debouncing for search
   - Monitor response times

## Rate Limits
- Search: 60 requests per minute
- Document ingestion: 30 requests per minute
- Batch operations: 10 requests per minute

## Example Integration

```typescript
// Example search implementation
async function searchDory(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch('http://localhost:3000/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userQuery: query })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}

// Example document ingestion
async function ingestDocument(doc: Document): Promise<string> {
  try {
    const response = await fetch('http://localhost:3000/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullText: doc.content,
        metadata: {
          title: doc.title,
          url: doc.url,
          visitedAt: Date.now(),
          processedAt: Date.now(),
          status: 'processed'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.docId;
  } catch (error) {
    console.error('Document ingestion failed:', error);
    throw error;
  }
}
```
