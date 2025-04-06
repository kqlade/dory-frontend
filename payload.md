# Clustering API: Request and Response Payloads

This document outlines how frontend applications should interact with the clustering API, including request formats and expected response structures.

## Overview

The clustering API provides a rich, contextual representation of a user's browsing data, organized into meaningful clusters. The new workspace-oriented API format delivers a comprehensive view of a user's activity patterns, relationships, and contexts.

## API Endpoints

### Synchronous Request (Quick Responses)

```
GET /api/clustering/suggestions_sync?user_id={USER_ID}&count={COUNT}
```

Parameters:
- `user_id` (required): The user's unique identifier
- `count` (optional, default: 3): Number of top suggestions to consider

This endpoint returns immediately with results. Best for small datasets or when immediate response is critical.

### Asynchronous Request (Background Processing)

```
GET /api/clustering/suggestions?user_id={USER_ID}&count={COUNT}
```

Parameters:
- `user_id` (required): The user's unique identifier
- `count` (optional, default: 3): Number of top suggestions to consider

This endpoint starts a background job and returns a job ID. Best for large datasets or when results can be polled later.

### Job Status (For Background Processing)

```
GET /api/clustering/job_status?job_id={JOB_ID}
```

Parameters:
- `job_id` (required): The job ID returned from the async endpoint

Use this to check the status of a background clustering job.

### Force Refresh

```
POST /api/clustering/refresh?user_id={USER_ID}
```

Parameters:
- `user_id` (required): The user's unique identifier

Forces a full refresh of the user's clusters.

## Request Example

```javascript
// Example 1: Synchronous request
fetch('/api/clustering/suggestions_sync?user_id=67e9c230f0899c9299f1f768&count=5')
  .then(response => response.json())
  .then(data => console.log(data.workspace));

// Example 2: Asynchronous request
fetch('/api/clustering/suggestions?user_id=67e9c230f0899c9299f1f768')
  .then(response => response.json())
  .then(data => {
    const jobId = data.job_id;
    // Poll for results
    checkJobStatus(jobId);
  });

// Function to poll job status
function checkJobStatus(jobId) {
  fetch(`/api/clustering/job_status?job_id=${jobId}`)
    .then(response => response.json())
    .then(data => {
      if (data.status === 'COMPLETED') {
        console.log(data.result.workspace);
      } else if (data.status === 'FAILED') {
        console.error('Job failed:', data.error);
      } else {
        // Still processing, poll again after delay
        setTimeout(() => checkJobStatus(jobId), 2000);
      }
    });
}
```

## Response Format

The API returns a rich workspace structure organized as follows:

```json
{
  "workspace": {
    "userId": "67e9c230f0899c9299f1f768",
    "metrics": {
      "totalClusters": 32,
      "totalPages": 1117,
      "totalEntities": 248,
      "lastActivity": "2025-04-06T18:14:32Z"
    },
    "contexts": [
      {
        "id": "current_work",
        "label": "What you're working on now",
        "clusters": [
          {
            "id": "14",
            "name": "AWS Infrastructure Monitoring",
            "relevance": {
              "level": "high",
              "reason": "You're currently working with CloudWatch services",
              "timeContext": "Weekday mornings"
            },
            "summary": "Collection of AWS monitoring dashboards and documentation",
            "content": {
              "keyPages": [
                {"title": "CloudWatch Dashboard", "url": "https://console.aws.amazon.com/cloudwatch/"},
                {"title": "EC2 Monitoring", "url": "https://docs.aws.amazon.com/ec2/monitoring"}
              ],
              "keyEntities": [
                {"text": "CloudWatch", "type": "Service", "salience": 0.85},
                {"text": "EC2", "type": "Service", "salience": 0.65}
              ],
              "domains": ["aws.amazon.com", "docs.aws.amazon.com"]
            },
            "patterns": {
              "usageTime": "Weekday mornings",
              "workflow": {
                "preceding": "AWS Login",
                "following": "Incident Response"
              }
            }
          }
        ]
      },
      {
        "id": "recent_projects",
        "label": "Your recent projects",
        "clusters": [/* Similar structure for project-related clusters */]
      },
      {
        "id": "knowledge_areas",
        "label": "Your knowledge areas",
        "clusters": [/* Similar structure for reference/learning clusters */]
      }
    ],
    "relationships": {
      "workflows": [
        {
          "name": "Infrastructure Monitoring Process",
          "steps": ["AWS Login", "AWS Infrastructure Monitoring", "Incident Response"],
          "frequency": "Daily"
        }
      ],
      "relatedClusters": [
        {
          "source": "14", 
          "target": "3",
          "relationship": "often_used_together",
          "strength": 0.82
        }
      ]
    }
  }
}
```

## Field Descriptions

### Workspace

| Field | Type | Description |
|-------|------|-------------|
| userId | string | User's unique identifier |
| metrics | object | Overall workspace metrics |
| contexts | array | Groupings of related clusters |
| relationships | object | Connections between clusters |

### Metrics

| Field | Type | Description |
|-------|------|-------------|
| totalClusters | number | Total number of clusters in the workspace |
| totalPages | number | Total number of pages across all clusters |
| totalEntities | number | Total number of entities extracted |
| lastActivity | string | ISO timestamp of most recent activity |

### Contexts

Each context represents a different way of viewing the workspace:

| Context ID | Description |
|------------|-------------|
| current_work | Clusters most relevant to current activity |
| recent_projects | Recently active clusters |
| knowledge_areas | Clusters with rich entity relationships |

### Clusters

Each cluster includes:

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique cluster identifier |
| name | string | Human-readable cluster name |
| relevance | object | Why this cluster matters now |
| summary | string | Brief description of cluster purpose |
| content | object | Key pages, entities, and domains |
| patterns | object | Usage patterns and workflows |

## Error Handling

For failed requests, the API returns:

```json
{
  "workspace": {
    "userId": "requested_user_id",
    "metrics": {},
    "contexts": [],
    "relationships": {"workflows": [], "relatedClusters": []}
  }
}
```

For job status endpoints, failed jobs return:

```json
{
  "job_id": "requested_job_id",
  "status": "FAILED",
  "error": "Error message details"
}
```

## Implementation Examples

### React Component Example

```jsx
function ClusterWorkspace({ userId }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchWorkspace() {
      try {
        const response = await fetch(`/api/clustering/suggestions_sync?user_id=${userId}`);
        const data = await response.json();
        setWorkspace(data.workspace);
      } catch (error) {
        console.error("Failed to fetch workspace:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchWorkspace();
  }, [userId]);
  
  if (loading) return <div>Loading your workspace...</div>;
  if (!workspace) return <div>No workspace data available</div>;
  
  return (
    <div className="workspace">
      <h1>Your Workspace</h1>
      
      {workspace.contexts.map(context => (
        <section key={context.id} className="context">
          <h2>{context.label}</h2>
          <div className="clusters">
            {context.clusters.map(cluster => (
              <div 
                key={cluster.id} 
                className="cluster-card"
              >
                <div className="cluster-header">
                  <h3>{cluster.name}</h3>
                </div>
                <p>{cluster.summary}</p>
                <div className="key-pages">
                  {cluster.content.keyPages.map((page, i) => (
                    <a key={i} href={page.url}>{page.title}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      
      {workspace.relationships.workflows.length > 0 && (
        <section className="workflows">
          <h2>Your Workflows</h2>
          <ul>
            {workspace.relationships.workflows.map((workflow, i) => (
              <li key={i}>
                <strong>{workflow.name}</strong> ({workflow.frequency}):
                {workflow.steps.join(" → ")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
``` 