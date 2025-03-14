# Dory Backend Documentation

## Overview

This document provides detailed instructions for frontend developers on how to interact with the Dory backend API. The backend is built with FastAPI and provides RESTful endpoints for document processing, semantic search, authentication, and event tracking.

## Base URL

All API endpoints are relative to the base URL:

```
http://localhost:8000/api
```

In production, this will be replaced with the deployed API URL.

## Authentication

The backend uses FastAPI Users for authentication with multiple authentication methods available.

### Token-Based Authentication (for API access)

#### Obtaining an Access Token

```
POST /auth/token/login
```

**Request Body:**
```json
{
  "username": "user@example.com",
  "password": "your_password"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

#### Using the Access Token

Include the token in the Authorization header for all protected requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Cookie-Based Authentication (for web applications)

```
POST /auth/cookie/login
```

**Request Body:**
```json
{
  "username": "user@example.com",
  "password": "your_password"
}
```

This sets a secure cookie named "dory-auth" that is automatically sent with subsequent requests.

### OAuth Authentication (Google)

Begin OAuth flow:
```
GET /auth/google/authorize
```

Handle callback:
```
GET /auth/google/callback
```

### User Registration and Management

Register a new user:
```
POST /auth/register
```

Get current user:
```
GET /users/me
```

Update user:
```
PATCH /users/me
```

### Protected Routes

All routes under `/api/secure` require authentication, including:
- `/api/secure/profile`
- `/api/secure/settings`
- `/api/secure/update-profile`
- `/api/secure/admin/users` (requires admin permission)

## API Endpoints

### Health Check

```
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "uptime": "will compute uptime in python version..."
}
```

### Metrics

```
GET /api/metrics
```

**Response:**
```json
{
  "uptime": 1615582318.4344475,
  "memory_info": {
    "rss": 102432768,
    "vms": 410900816,
    "pfaults": 33408,
    "pageins": 0
  },
  "cpu_times": {
    "user": 2.403193,
    "system": 1.396841,
    "children_user": 0.0,
    "children_system": 0.0
  },
  "timestamp": 1615582318.4344475
}
```

### Search

#### Full Search (Chunk-based)

```
POST /api/search
```

**Request Body:**
```json
{
  "query": "How does machine learning work?",
  "userId": "user123",
  "limit": 5,
  "useHybridSearch": true,
  "useLLMExpansion": true,
  "useReranking": true
}
```

**Response:**
```json
{
  "results": [
    {
      "docId": "doc123",
      "chunkId": "chunk456",
      "text": "Machine learning works by using algorithms to parse data, learn from it, and make predictions...",
      "score": 0.92,
      "metadata": {
        "source": "textbook",
        "title": "Introduction to ML",
        "page": 42
      }
    },
    ...
  ],
  "queryTime": 0.153
}
```

#### Document Search

```
POST /api/search/documents
```

**Request Body:**
```json
{
  "query": "machine learning",
  "userId": "user123",
  "limit": 3,
  "useHybridSearch": true
}
```

**Response:**
```json
{
  "results": [
    {
      "docId": "doc123",
      "score": 0.87,
      "metadata": {
        "title": "Introduction to Machine Learning",
        "author": "Jane Smith",
        "source": "textbook"
      }
    },
    ...
  ],
  "queryTime": 0.089
}
```

#### Parameters Explained:

- `query`: The search query text
- `userId`: User identifier for personalization and analytics
- `limit`: Number of results to return (default: 5)
- `useHybridSearch`: Whether to use hybrid search (dense + sparse embeddings) (default: true)
- `useLLMExpansion`: Whether to use LLM for query expansion (default: true)
- `useReranking`: Whether to rerank results with LLM (default: true)

### Content Management

```
POST /api/content
```

**Request Body:**
```json
{
  "contentId": "cont123",
  "sessionId": "sess456",
  "userId": "user789",
  "timestamp": 1678912345,
  "data": {
    "pageId": "page123",
    "visitId": "visit456",
    "userId": "user789",
    "url": "https://example.com/article",
    "content": {
      "title": "Sample Article",
      "text": "Article content..."
    }
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Content processed successfully"
}
```

### Cold Storage (Analytics)

The cold storage endpoints are used to sync various user interaction data for analytics.

#### Sync Page Views

```
POST /api/cold-storage/pages
```

**Request Body:**
```json
[
  {
    "pageId": "page123",
    "url": "https://example.com/article",
    "title": "Example Article",
    "timestamp": "2025-03-14T12:34:56Z"
  },
  ...
]
```

#### Sync Site Visits

```
POST /api/cold-storage/visits
```

**Request Body:**
```json
[
  {
    "visitId": "visit123",
    "source": "direct",
    "referrer": "",
    "timestamp": "2025-03-14T12:30:00Z",
    "userId": "user123"
  },
  ...
]
```

#### Sync User Sessions

```
POST /api/cold-storage/sessions
```

**Request Body:**
```json
[
  {
    "sessionId": "sess123",
    "userId": "user123",
    "startTime": "2025-03-14T12:30:00Z",
    "endTime": "2025-03-14T13:45:23Z",
    "deviceInfo": {
      "browser": "Chrome",
      "os": "macOS"
    }
  },
  ...
]
```

#### Sync Search Click Events

```
POST /api/cold-storage/search-clicks
```

**Request Body:**
```json
[
  {
    "clickId": "click123",
    "userId": "user123",
    "searchId": "search456",
    "resultId": "result789",
    "position": 2,
    "timestamp": "2025-03-14T12:36:42Z"
  },
  ...
]
```

### Secure Endpoints

All secure endpoints require authentication.

#### Get User Profile

```
GET /api/secure/profile
```

**Response:**
```json
{
  "status": "success",
  "message": "You have successfully accessed a protected endpoint",
  "profile": {
    "id": "user123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Get User Settings

```
GET /api/secure/settings
```

**Response:**
```json
{
  "status": "success",
  "settings": {
    "theme": "dark",
    "notifications": true,
    "search_preferences": {
      "default_top_k": 5,
      "use_hybrid_search": true
    }
  }
}
```

#### Update User Profile

```
POST /api/secure/update-profile
```

**Request Body:**
```json
{
  "name": "John Smith"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Profile updated successfully"
}
```

## Data Models

### Document

```json
{
  "docId": "string",
  "title": "string",
  "content": "string (original document content)",
  "chunks": ["array of chunk IDs"],
  "status": "enum: processing, processed, failed",
  "metadata": {
    "source": "string",
    "author": "string",
    "tags": ["array of strings"],
    "uploaded_at": "ISO timestamp",
    "processed_at": "ISO timestamp"
  }
}
```

### Chunk

```json
{
  "chunkId": "string",
  "docId": "string (parent document ID)",
  "text": "string (chunk content)",
  "embedding": [float array],
  "sparseEmbedding": {
    "indices": [integer array],
    "values": [float array]
  },
  "metadata": {
    "position": "integer (position in document)",
    "page": "integer (for PDFs)",
    "section": "string (document section)"
  }
}
```

### User

```json
{
  "id": "string",
  "email": "string",
  "name": "string (optional)",
  "is_active": true,
  "is_superuser": false,
  "is_verified": false,
  "created_at": "ISO timestamp",
  "last_login": "ISO timestamp (optional)",
  "preferences": {
    "theme": "string",
    "notifications": true,
    "search_preferences": {
      "default_top_k": 5,
      "use_hybrid_search": true
    }
  }
}
```

## Error Handling

The API uses standard HTTP status codes:

- 200: Success
- 400: Bad Request (invalid parameters)
- 401: Unauthorized (missing or invalid token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 500: Internal Server Error

Error responses follow this format:

```json
{
  "detail": "Descriptive error message"
}
```

Or for validation errors:

```json
{
  "detail": [
    {
      "loc": ["body", "field_name"],
      "msg": "Error message",
      "type": "error_type"
    }
  ]
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse. The default rate limit is 100 requests per minute per IP address.

## Example Usage Scenarios

### Complete Search Flow

1. **User Authentication**

```javascript
// Login and get token
const response = await fetch('http://localhost:8000/api/auth/token/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    'username': 'user@example.com',
    'password': 'password123'
  })
});

const { access_token } = await response.json();
const authHeader = { 'Authorization': `Bearer ${access_token}` };
```

2. **Perform Search**

```javascript
// Search for documents
const searchResponse = await fetch('http://localhost:8000/api/search', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    ...authHeader
  },
  body: JSON.stringify({
    query: 'machine learning techniques',
    userId: 'user123',
    limit: 5,
    useHybridSearch: true
  })
});

const searchResults = await searchResponse.json();
```

3. **Track User Interaction**

```javascript
// Track search click event
const clickEvents = [
  {
    clickId: "click-" + Date.now(),
    userId: "user123",
    searchId: "search-" + Date.now(),
    resultId: searchResults.results[0].chunkId,
    position: 0,
    timestamp: new Date().toISOString()
  }
];

await fetch('http://localhost:8000/api/cold-storage/search-clicks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...authHeader
  },
  body: JSON.stringify(clickEvents)
});
```

## Troubleshooting

If you encounter issues with the API:

1. Verify the server is running with `GET /api/health`
2. Check that your authentication token is valid and not expired
3. For 400 errors, review your request parameters
4. For 500 errors, check the server logs and contact the backend team

## Development and Testing

For local development and testing:

1. Ensure the backend server is running (`uvicorn main:app --reload`)
2. Use the Swagger documentation at `http://localhost:8000/docs` for interactive API testing

## OpenAPI Specification

The complete OpenAPI specification is available at `/openapi.json` or through the Swagger UI at `/docs`. 