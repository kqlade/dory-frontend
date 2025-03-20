# Dory Clustering API Documentation

This document provides instructions for frontend developers on how to interact with Dory's clustering API to retrieve personalized content suggestions.

## Overview

Dory's clustering feature automatically organizes a user's browsing history into thematic groups, making it easier to find and revisit related content. The API provides contextually relevant cluster suggestions based on:

- Time of day patterns
- Recent browsing activity
- Visit frequency
- Content similarity

The clustering process happens automatically on the backend, so frontend developers only need to request suggestions using the endpoints described below.

## Endpoints

### 1. Get Contextual Suggestions (Primary Endpoint)

This is the main endpoint for retrieving personalized cluster suggestions for a user.

```
GET /api/clustering/suggestions/contextual
```

#### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `user_id` | string | Yes | - | The ID of the user to get suggestions for |
| `count` | number | No | 3 | Maximum number of suggestions to return |
| `category` | string | No | "all" | Filter by suggestion type (placeholder for future filtering) |
| `min_score` | number | No | 0.3 | Minimum context relevance score (0-1) |
| `include_scores` | boolean | No | false | Whether to include overall relevance score in response |
| `include_details` | boolean | No | false | Whether to include detailed page fields |

#### Example Request

```javascript
// Using fetch API
const fetchSuggestions = async (userId) => {
  const response = await fetch(
    `/api/clustering/suggestions/contextual?user_id=${userId}&count=5&include_scores=true`
  );
  
  if (!response.ok) {
    throw new Error(`Error fetching suggestions: ${response.statusText}`);
  }
  
  return await response.json();
};
```

#### Response Structure

The response is a JSON object with the following structure:

```typescript
{
  timestamp: number;            // Current timestamp in milliseconds
  suggestions: Array<{
    cluster_id: string;         // Unique identifier for the cluster
    label: string;              // Human-readable label for the cluster
    page_count: number;         // Number of pages in the cluster
    themes: string[];           // List of themes/topics represented in this cluster
    score_factors: {            // Factors explaining why this cluster is relevant
      recency: number;          // How recently pages in this cluster were visited (0-1)
      time_pattern: number;     // How well this cluster matches the current time (0-1)
      visit_frequency: number;  // How frequently the user visits pages in this cluster (0-1)
      semantic_relevance?: number; // How relevant to current browsing (if available)
      engagement?: number;      // Time spent on pages in this cluster (if available)
    },
    relevance_score?: number;   // Overall score (only present if include_scores=true)
    top_pages: Array<{
      page_id: string;          // Unique identifier for the page
      title: string;            // Page title
      url: string;              // Page URL
      visit_count?: number;     // Only present if include_details=true
      last_visit?: number;      // Only present if include_details=true
      domain?: string;          // Only present if include_details=true
      confidence?: number;      // Only present if include_details=true
    }>
  }>;
  context: {
    timestamp: number;          // Context timestamp in milliseconds
    hour: {                     // Current hour-of-day context
      raw: {sin: number, cos: number},  // Cyclical encoding values
      value: number,            // Hour value (0-23)
      formatted: string         // User-friendly format (e.g., "14:00")
    },
    day_of_week: {              // Current day-of-week context
      raw: {sin: number, cos: number},  // Cyclical encoding values
      value: number,            // Day value (0-6, Monday-Sunday)
      formatted: string         // User-friendly format (e.g., "Wednesday")
    },
    recent_pages_count: number; // Number of recently viewed pages
    total_active_time?: number  // Total active time in the session (ms, if available)
  };
  metadata: {
    total_clusters_scored: number; // Total number of clusters evaluated
    suggestion_count: number;      // Number of suggestions returned
    user_id: string;               // User ID from the request
  }
}
```

### 2. Manually Trigger Clustering (Admin/Testing Endpoint)

This endpoint can be used to manually trigger clustering for a specific user. This is primarily for testing or administrative purposes and shouldn't be needed in regular frontend flows.

```
POST /api/cold-storage/trigger-clustering
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | Yes | User ID to trigger clustering for |

#### Example Request

```javascript
// Using fetch API
const triggerClustering = async (userId) => {
  const response = await fetch(
    `/api/cold-storage/trigger-clustering?user_id=${userId}`,
    { method: 'POST' }
  );
  
  if (!response.ok) {
    throw new Error(`Error triggering clustering: ${response.statusText}`);
  }
  
  return await response.json();
};
```

#### Response

```json
{
  "status": "clustering_queued",
  "user_id": "67d5f72cfa7e44e3d20b3bd5"
}
```

## Example Response

Here's a complete example of what the suggestions endpoint returns:

```json
{
  "timestamp": 1711463048000,
  "suggestions": [
    {
      "cluster_id": "c401ef1b-6ecb-4dae-8918-9b03a9a03f6b",
      "label": "News and Current Events",
      "page_count": 10,
      "themes": ["current affairs", "news media", "politics"],
      "score_factors": {
        "recency": 0.85,
        "time_pattern": 0.76,
        "visit_frequency": 0.62,
        "semantic_relevance": 0.71,
        "engagement": 0.55
      },
      "relevance_score": 0.78,
      "top_pages": [
        {
          "page_id": "page_1742415359749.862",
          "title": "Breaking News: Major Policy Announcement",
          "url": "https://cnn.com/politics/policy-announcement",
          "visit_count": 5,
          "last_visit": 1711462000000,
          "domain": "cnn.com",
          "confidence": 0.92
        },
        {
          "page_id": "page_1742415359749.863",
          "title": "Global Market Update: Stocks Rise",
          "url": "https://bbc.com/business/market-update"
        },
        {
          "page_id": "page_1742415359749.864", 
          "title": "Tech Industry News Roundup",
          "url": "https://news.ycombinator.com/tech-roundup"
        }
      ]
    },
    {
      "cluster_id": "91dfa36e-581c-42d6-8f0d-1df0bd2d3b80",
      "label": "Programming and Development",
      "page_count": 8,
      "themes": ["web development", "javascript", "programming resources"],
      "score_factors": {
        "recency": 0.32,
        "time_pattern": 0.82,
        "visit_frequency": 0.45
      },
      "relevance_score": 0.58,
      "top_pages": [
        {
          "page_id": "page_1742415359750.123",
          "title": "JavaScript ES2022 Features Guide",
          "url": "https://stackoverflow.com/questions/javascript-es2022"
        },
        {
          "page_id": "page_1742415359750.124",
          "title": "React Hooks Best Practices",
          "url": "https://github.com/reactjs/hooks-guide"
        }
      ]
    }
  ],
  "context": {
    "timestamp": 1711463048000,
    "hour": {
      "raw": {"sin": 0.5, "cos": 0.87},
      "value": 14,
      "formatted": "14:00"
    },
    "day_of_week": {
      "raw": {"sin": 0.7, "cos": 0.71},
      "value": 2,
      "formatted": "Wednesday" 
    },
    "recent_pages_count": 15
  },
  "metadata": {
    "total_clusters_scored": 10,
    "suggestion_count": 2,
    "user_id": "67d5f72cfa7e44e3d20b3bd5"
  }
}
```

## Frontend Implementation Tips

### Categorizing Clusters

The `score_factors` in the response can be used to categorize clusters in a more user-friendly way. Here are some suggested categories:

1. **Current Work**
   - High `recency` (> 0.7)
   - May have high `engagement`
   
2. **Routine Tasks**
   - High `time_pattern` (> 0.7)
   - Medium to high `visit_frequency` (> 0.5)
   
3. **Worth Revisiting**
   - Medium `recency` (0.3-0.7)
   - High `semantic_relevance` if available (> 0.7)

4. **Regular References**
   - High `visit_frequency` (> 0.7)
   - May have medium `time_pattern` (0.4-0.7)

### Displaying Clusters

For each cluster, you can show:
- The cluster label (which should be descriptive of the content)
- Themes as tags/badges
- Top 2-3 pages with titles and thumbnails (if available)
- An indicator of why this cluster is relevant (based on score factors)

### Error Handling

The clustering process is designed to be robust, but there are a few scenarios to handle:

1. **New User / Not Enough Data**: For new users or those with little browsing history, the `suggestions` array might be empty. Show an appropriate message.

2. **First Request Latency**: The first request for a user might take longer (several seconds) as clustering happens. Consider showing a loading state.

3. **API Errors**: Standard error handling for fetch calls applies. Consider retrying with exponential backoff for network issues.

## Performance Considerations

1. **Caching Suggestions**: The backend already caches clustering results, but you might want to cache the suggestions on the frontend for a short period (e.g., 5 minutes) to avoid unnecessary API calls.

2. **Pagination**: If you need to display many clusters, consider implementing pagination on the frontend by making multiple requests with different `count` and offset parameters.

3. **Background Loading**: Consider loading suggestions in the background when the app initializes, so they're ready when the user navigates to the relevant section.

## Data Refresh

Clustering results are automatically updated when:
- New browsing data is synced from the extension
- The user explicitly triggers a refresh
- The backend cache expires (usually after 24 hours)

No special action is needed from the frontend to ensure data freshness. 