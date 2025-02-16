# Frontend Integration Guide

This document explains how to integrate with the backend's advanced search functionality.

## API Endpoints

### 1. Document Ingestion
POST /api/documents
```json
Request:
{
  "title": "Optional document title",
  "url": "Optional source URL",
  "fullText": "The complete document text",
  "metadata": {
    "author": "optional",
    "tags": ["optional", "metadata"]
  }
}
Response:
{
  "docId": "uuid-of-new-document",
  "message": "Document stored successfully."
}
```

### 2. Advanced Search
POST /api/search/advanced
```json
Request:
{
  "userQuery": "Your natural language query",
  "topK": 5  // optional, defaults to 5
}
Response:
{
  "result": {
    "bestChunk": {
      "score": 0.89,
      "chunkId": "doc123-chunk-0",
      "metadata": {
        "chunkText": "The matched text",
        "url": "source url",
        "title": "document title",
        "visitedAt": "timestamp",
        "lastModified": "timestamp",
        "docId": "associated document id"
      }
    },
    "reasoning": "Why this chunk was chosen"
  },
  "debug": {
    "parsedQuery": {
      "metadata_filters": {
        "domainFilter": null,
        "visitedAfterDomain": null,
        "lastNDays": null,
        "timeRange": {
          "start": null,
          "end": null
        }
      },
      "semantic_text": "actual search terms",
      "confidence": 0.95,
      "modelUsed": "gpt-4o-mini | gpt-4o | gpt-4o (fallback) | none (error)",
      "complexity": 1 | 2
    },
    "totalChunksFound": 5,
    "metadataFiltersApplied": {
      "domainFilter": null,
      "visitedAfterDomain": null,
      "lastNDays": null,
      "timeRange": {
        "start": null,
        "end": null
      }
    },
    "modelUsed": "gpt-4o-mini | gpt-4o",
    "complexity": 1 | 2,
    "performance": {
      "total": 2500,
      "parsing": 1000,
      "filtering": 500,
      "vectorSearch": 500,
      "recheck": 500
    }
  }
}
```

## Supported Query Patterns

The advanced search supports natural language queries with various patterns:

1. Time-based queries:
   - "from the last N days" → sets lastNDays filter
   - "within the past week" → converts to lastNDays: 7
   - "recent articles about..." → defaults to recent time period
   - "content from last month" → converts to lastNDays: 30

2. Domain-specific queries:
   - "articles from dev.to" → sets domainFilter: "dev.to"
   - "tutorials on youtube.com" → sets domainFilter: "youtube.com"
   - "documentation from microsoft docs" → sets domainFilter: "microsoft.com"

3. Sequential queries:
   - "content I read after visiting medium.com" → sets visitedAfterDomain: "medium.com"
   - "articles viewed after checking github" → sets visitedAfterDomain: "github.com"

4. Combined queries:
   - "python tutorials from dev.to in the last week" → combines domainFilter and lastNDays
   - "react articles I read after visiting medium.com but within the last 3 days" → combines visitedAfterDomain and lastNDays

## Query Processing Pipeline

1. Query Parsing:
   - Complexity assessment (simple vs complex)
   - Model selection (gpt-4o-mini for simple, gpt-4o for complex)
   - Caching of parsed queries for performance
   - Fallback mechanisms if parsing fails

2. Metadata Filtering:
   - Domain-based filtering
   - Time-based filtering (lastNDays, timeRange)
   - Sequential filtering (visitedAfterDomain)

3. Vector Search:
   - Semantic search on filtered document set
   - Returns top K results (default: 5)

4. LLM Re-check:
   - Final validation of results
   - Selection of best matching chunk
   - Generation of reasoning explanation

## Performance Characteristics

Typical latency breakdown:
- Query parsing: 1-4s (cached queries are instant)
- Metadata filtering: 0.5-2s
- Vector search: 0.5-3s
- LLM re-check: 0.8-1.2s
- Total latency: 2.5-8s

Performance optimizations:
- Query parsing cache
- Complexity-based model selection
- Efficient metadata filtering
- Optimized vector search

## Error Handling

The API returns standard HTTP status codes:
- 200: Successful operation
- 400: Invalid request (missing/invalid parameters)
- 500: Server error

Common error responses:
```json
{
  "error": "Missing userQuery"
}
```

## Implementation Guide

### 1. Search Interface
- Implement a single search bar for natural language input
- Show example queries to help users understand the capabilities
- Consider adding query suggestions based on common patterns

### 2. Results Display
- Show the best matching chunk prominently
- Display the reasoning for why it was chosen
- Show metadata (source, date, etc.)
- Optionally show debug info in a developer mode

### 3. Progressive Enhancement
- Start with the semantic_text for basic highlighting
- Use metadata_filters to show applied filters
- Show total chunks found for context
- Add filter chips based on detected metadata
- Display performance metrics in debug mode

### 4. Error Handling
- Show friendly error messages
- Provide query suggestions on errors
- Add retry logic for temporary failures
- Cache successful results when appropriate

## Example Implementation

```typescript
async function performAdvancedSearch(query: string) {
  try {
    const response = await fetch('/api/search/advanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userQuery: query,
        topK: 5
      })
    });

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json();
    
    // Update UI with results
    displaySearchResult(data.result.bestChunk);
    
    // Show applied filters
    if (data.debug?.parsedQuery?.metadata_filters) {
      displayAppliedFilters(data.debug.parsedQuery.metadata_filters);
    }
    
    // Show match reasoning
    if (data.result.reasoning) {
      displayReasoning(data.result.reasoning);
    }

    // Show performance metrics in debug mode
    if (data.debug?.performance) {
      displayPerformanceMetrics(data.debug.performance);
    }
  } catch (error) {
    handleSearchError(error);
  }
}

function displaySearchResult(chunk: any) {
  // Example UI update
  const resultElement = document.getElementById('search-result');
  resultElement.innerHTML = `
    <div class="result-card">
      <div class="content">${chunk.metadata.chunkText}</div>
      <div class="metadata">
        <span>Source: ${chunk.metadata.url || 'Unknown'}</span>
        <span>Relevance: ${(chunk.score * 100).toFixed(1)}%</span>
        <span>Visited: ${new Date(chunk.metadata.visitedAt).toLocaleString()}</span>
      </div>
    </div>
  `;
}

function displayPerformanceMetrics(performance: any) {
  const metricsElement = document.getElementById('performance-metrics');
  metricsElement.innerHTML = `
    <div class="metrics">
      <div>Total: ${performance.total}ms</div>
      <div>Parsing: ${performance.parsing}ms</div>
      <div>Filtering: ${performance.filtering}ms</div>
      <div>Search: ${performance.vectorSearch}ms</div>
      <div>Recheck: ${performance.recheck}ms</div>
    </div>
  `;
}
```

## Performance Optimizations

### 1. Debounce Search Requests
```typescript
const debouncedSearch = debounce((query: string) => {
  performAdvancedSearch(query);
}, 300);
```

### 2. Cache Results
```typescript
const searchCache = new Map();

async function cachedSearch(query: string) {
  if (searchCache.has(query)) {
    return searchCache.get(query);
  }
  
  const result = await performAdvancedSearch(query);
  searchCache.set(query, result);
  return result;
}
```

### 3. Progressive Loading
```typescript
function displayResults(data: any) {
  // Show immediate results
  displaySearchResult(data.result.bestChunk);
  
  // Then load additional UI elements
  requestAnimationFrame(() => {
    displayMetadata(data.result.bestChunk.metadata);
    displayReasoning(data.result.reasoning);
    displayDebugInfo(data.debug);
    displayPerformanceMetrics(data.debug.performance);
  });
}
```