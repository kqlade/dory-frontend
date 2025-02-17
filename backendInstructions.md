# Dory Backend API Documentation

This document provides detailed instructions for frontend integration with the Dory backend API. The backend provides endpoints for document ingestion, search, and embedding operations.

## Base URL
```
http://localhost:3000/api
```

## Endpoints

### 1. Advanced Search
This is the primary endpoint for searching through user's browsing history using natural language queries.

```
POST /search/advanced
```

#### Request
```typescript
{
  // Required: Natural language query from the user
  userQuery: string;

  // Optional: Additional configuration
  options?: {
    enableTwoPassSystem?: boolean;
  }
}
```

Example request:
```json
{
  "userQuery": "Find that article about JavaScript closures I read on dev.to last week"
}
```

#### Response
```typescript
{
  "result": {
    // Array of relevant results (scored > 0.5)
    // Maximum of 3 results, sorted by relevance
    "topResults": [
      {
        "contentId": string,      // Unique identifier
        "finalScore": number,     // Relevance score (0.0 to 1.0)
        "explanation": string,    // Why this result matches
        "isHighlighted": boolean, // true for the highest-scoring result
        "metadata": {
          "url": string,         // Full URL
          "title": string,       // Content title
          "visitedAt": number,   // Unix timestamp
          "snippet": string      // Content excerpt
        }
      }
    ],
    "reasoning": string          // Overall explanation
  },
  "debug": {
    "parsedQuery": {
      "metadata_filters": {
        "domainFilter": string | null,
        "visitedAfterDomain": string | null,
        "lastNDays": number | null
      },
      "semantic_text": string,
      "confidence": number,
      "modelUsed": string,
      "complexity": number
    },
    "totalChunksFound": number,  // Total matches before filtering
    "performance": {
      "total": number,
      "parsing": number,
      "filtering": number,
      "vectorSearch": number,
      "recheck": number
    }
  }
}
```

#### Result Limits
The search process applies several limits to ensure quality and performance:
1. Initially retrieves top 30 most relevant chunks
2. Groups results by URL to prevent duplicates from the same source
3. Takes the best chunk from each URL
4. Filters out results with relevance score ≤ 0.5
5. Returns maximum of 3 results after filtering

The frontend will receive at most 3 results, all with high relevance to the query (score > 0.5), sorted by relevance score in descending order.

#### Result Ranking and Scoring
Results are ranked by their `finalScore` (0.0 to 1.0), which indicates how well each result matches the user's query. The scoring system works as follows:

1. **Score Ranges**:
   - 0.8-1.0: Extremely strong match (high confidence this is exactly what the user wants)
   - 0.6-0.8: Strong match with good contextual alignment
   - 0.4-0.6: Moderate match that might help trigger the right memory
   - < 0.4: Weak matches are filtered out

2. **Best Result**: 
   - Results are automatically sorted by `finalScore` in descending order
   - The highest-scoring result will have `isHighlighted: true`
   - Only the top 3 results are returned
   - The `reasoning` field explains why the best result was considered the best match

3. **Score Factors**:
   - Temporal accuracy (how well the timestamp matches any time references)
   - Source match (if user mentioned specific websites/domains)
   - Content relevance (semantic similarity to the query)
   - Metadata matches (title, URL patterns)

Example of interpreting results:
```typescript
function getBestResult(response: SearchResponse) {
  // The first result is always the highest-scoring match
  // and will have isHighlighted: true
  const bestResult = response.result.topResults[0];
  
  if (bestResult && bestResult.finalScore >= 0.8) {
    return {
      result: bestResult,
      confidence: "high"
    };
  }
  
  // Even if we have results, they might not be high-confidence matches
  return {
    result: bestResult,
    confidence: bestResult?.finalScore >= 0.6 ? "medium" : "low"
  };
}
```

Frontend display recommendations:
1. Always show the `finalScore` and `explanation` to help users understand why a result was returned
2. Consider using different UI treatments based on score ranges:
   - ≥ 0.8: Highlight as "Best Match"
   - ≥ 0.6: Show as "Strong Match"
   - < 0.6: Show as "Possible Match"
3. Use the `reasoning` field from the response to provide an overall summary of the search results
4. The highest-scoring result will have `isHighlighted: true` and should be emphasized in the UI

Example response:
```json
{
  "result": {
    "topResults": [
      {
        "contentId": "doc-123",
        "finalScore": 0.95,
        "explanation": "Strong match: visited last week on dev.to, contains 'JavaScript closures' in title",
        "isHighlighted": true,
        "metadata": {
          "url": "https://dev.to/javascript/understanding-closures",
          "title": "Understanding JavaScript Closures",
          "visitedAt": 1709654400000,
          "snippet": "A comprehensive guide to JavaScript closures with examples..."
        }
      }
    ],
    "reasoning": "Found highly relevant article matching your timeframe and topic"
  },
  "debug": {
    "parsedQuery": {
      "metadata_filters": {
        "domainFilter": "dev.to",
        "visitedAfterDomain": null,
        "lastNDays": 7
      },
      "semantic_text": "JavaScript closures",
      "confidence": 0.85,
      "modelUsed": "gpt-4o-mini (cached)",
      "complexity": 1
    },
    "totalChunksFound": 5,
    "performance": {
      "total": 1200,
      "parsing": 200,
      "filtering": 300,
      "vectorSearch": 500,
      "recheck": 200
    }
  }
}
```

### 2. Document Ingestion
Use this endpoint to store new documents in the system.

```
POST /documents
```

#### Request
```typescript
{
  // Required: Full document text
  fullText: string;

  // Required: Pre-chunked content
  chunks: string[];

  // Required: Document metadata
  metadata: {
    title: string;      // Document title
    url: string;        // Source URL
    visitedAt: number;  // Unix timestamp
    processedAt: number;// Unix timestamp
    status: 'processed';
  }
}
```

Example request:
```json
{
  "fullText": "Complete article content here...",
  "chunks": [
    "First chunk of content...",
    "Second chunk of content...",
    "Third chunk of content..."
  ],
  "metadata": {
    "title": "Understanding JavaScript Closures",
    "url": "https://dev.to/javascript/understanding-closures",
    "visitedAt": 1709654400000,
    "processedAt": 1709654400000,
    "status": "processed"
  }
}
```

#### Response
```typescript
{
  "docId": string,           // Unique document identifier
  "message": string          // Success message
}
```

Example response:
```json
{
  "docId": "doc-123",
  "message": "Document stored successfully."
}
```

### 3. Batch Document Ingestion
For ingesting multiple documents at once.

```
POST /documents/batch
```

#### Request
```typescript
{
  "documents": [
    {
      // Same structure as single document ingestion
      fullText: string;
      chunks: string[];
      metadata: {
        title: string;
        url: string;
        visitedAt: number;
        processedAt: number;
        status: 'processed';
      }
    }
  ]
}
```

#### Response
```typescript
{
  "results": [
    {
      "docId": string,
      "success": boolean,
      "error"?: string
    }
  ]
}
```

## Query Types Supported

The advanced search endpoint supports various types of natural language queries:

1. **Temporal References**
   - "last week"
   - "during January"
   - "around Christmas"
   - "last summer"

2. **Domain-Specific**
   - "on dev.to"
   - "from Medium"
   - "not from Stack Overflow"

3. **Content Type**
   - "blog post"
   - "documentation"
   - "tutorial"

4. **Combined Queries**
   - "JavaScript tutorial I read on dev.to last week"
   - "that article about React hooks from Medium I saw during Christmas"

## Error Handling

All endpoints follow this error response format:
```typescript
{
  "error": string,          // Error message
  "details"?: unknown       // Optional additional details
}
```

Common HTTP status codes:
- 200: Success
- 201: Created (for POST requests)
- 400: Bad Request (invalid input)
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 429: Too Many Requests (rate limit exceeded)
- 500: Internal Server Error

## Rate Limiting

The API implements rate limiting with the following defaults:
- 100 requests per minute per IP
- Batch endpoints count as multiple requests based on batch size

## Best Practices

1. **Document Ingestion**
   - Pre-chunk documents on the frontend (recommended size: 500-1000 characters)
   - Include accurate timestamps for `visitedAt` and `processedAt`
   - Ensure URLs are properly formatted and accessible

2. **Search Queries**
   - Use natural language queries
   - Include temporal context when available
   - Specify domain preferences if known

3. **Error Handling**
   - Implement exponential backoff for rate limit errors
   - Display user-friendly messages based on error responses
   - Cache successful search results when appropriate

4. **Performance**
   - Batch document ingestion when possible
   - Monitor the debug information in search responses
   - Use the performance metrics to optimize frontend behavior

## Example Integration

```typescript
async function searchDory(query: string) {
  try {
    const response = await fetch('http://localhost:3000/api/search/advanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userQuery: query
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.result.topResults;
  } catch (error) {
    console.error('Search failed:', error);
    throw error;
  }
}
```

## Testing

The backend includes a health check endpoint:
```
GET /health
```

Response:
```json
{
  "status": "ok",
  "uptime": 123456 // seconds
}
```

Use this endpoint to verify the backend is operational before making other requests.
