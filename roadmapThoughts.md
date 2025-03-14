# Implementing Auto-Grouped Task Cards for Dory MVP

## Feature Overview
The goal is to automatically group related browsing activities into coherent "tasks" or "projects" that users can easily identify and interact with. This provides immediate organization to a user's browsing history and transforms Dory from a search tool into a productivity assistant.

## Implementation Approach: Frontend vs. Backend

### Key Considerations
- **Data Availability**: What browsing data do we have access to?
- **Computation Resources**: Where should the clustering computation happen?
- **Privacy**: How do we maintain the user's privacy?
- **Performance**: How do we ensure the feature is responsive?
- **Iteration Speed**: How quickly can we improve the algorithm based on feedback?

## Frontend Implementation

### Approach
1. **Leverage Local Data**:
   - Use the existing browsing history and metadata stored locally
   - Utilize the semantic embeddings already generated for search
   - Process everything client-side in the browser

2. **Clustering Algorithm**:
   - Apply hierarchical clustering or DBSCAN to group semantically similar pages
   - Use temporal data (when pages were visited) as an additional clustering signal
   - Consider domain/URL patterns to identify related pages

3. **Implementation Details**:
   - Build upon the existing `localDoryRanking.ts` service
   - Create a new service like `taskClusteringService.ts` that runs periodically
   - Store cluster assignments in the local IndexedDB

### Pros
- **Privacy-Preserving**: All data remains on the user's device
- **Works Offline**: No dependency on server connectivity
- **Lower Infrastructure Costs**: No need for server-side processing
- **Immediate Deployment**: Can ship without setting up new backend services

### Cons
- **Limited Computational Resources**: Browser environments have constraints
- **Performance Concerns**: Complex clustering could slow down the browser
- **Less Sophisticated Models**: May need to use simpler algorithms
- **Difficult to Update**: Algorithm improvements require extension updates

## Backend Implementation

### Approach
1. **Centralized Processing**:
   - Send anonymized browsing data to a secure backend service
   - Run more sophisticated clustering algorithms on powerful servers
   - Return cluster assignments to the client

2. **Advanced Algorithms**:
   - Utilize transformer-based models for better semantic understanding
   - Implement LLM-based clustering to identify complex relationships
   - Apply advanced NLP to extract topics and entities for better grouping

3. **Implementation Details**:
   - Create a secure API endpoint for receiving browsing data
   - Develop a scalable clustering service with batch processing
   - Implement privacy-preserving techniques (differential privacy, etc.)

### Pros
- **More Computational Power**: Can run more sophisticated algorithms
- **Centralized Improvements**: Algorithm updates benefit all users immediately
- **Cross-Device Sync**: Clusters can be synced across user devices
- **Analytics Potential**: Aggregate, anonymized insights could improve the product

### Cons
- **Privacy Concerns**: Requires sending browsing data to servers
- **Infrastructure Costs**: Need to set up and maintain server infrastructure
- **Connectivity Dependency**: Requires internet connection to function fully
- **Development Complexity**: Requires both frontend and backend changes

## Hybrid Approach (Recommended)

I recommend a hybrid approach that combines the best aspects of both:

1. **Initial Local Clustering**:
   - Start with basic clustering on the frontend
   - Use existing embeddings and a lightweight algorithm
   - Provide immediate value without waiting for server response

2. **Optional Server Enhancement**:
   - Allow users to opt-in to server-side processing for improved clustering
   - Implement end-to-end encryption to preserve privacy
   - Use the server for "overnight processing" of more complex analysis

3. **Implementation Strategy**:
   - Extend `localDoryRanking.ts` to include basic clustering functionality
   - Create a new `taskManagement.ts` service that handles both local and remote clusters
   - Develop a simple UI in the new tab page to display and interact with these clusters

## Technical Implementation Sketch

```typescript
// New interface in types/
interface TaskCluster {
  id: string;
  name: string; // Auto-generated or user-modified
  pages: {
    url: string;
    title: string;
    lastVisited: Date;
    visitCount: number;
  }[];
  createdAt: Date;
  lastActive: Date;
  embeddings?: Float32Array; // Cluster centroid for matching
}

// Add to existing services/localDoryRanking.ts or create new service
class TaskClusteringService {
  // Perform basic clustering on local browsing data
  async generateClusters(): Promise<TaskCluster[]> {
    // 1. Fetch recent browsing history (last 2 weeks)
    const history = await this.browsingStore.getRecentHistory();
    
    // 2. For pages with embeddings, apply clustering algorithm
    const pagesToCluster = history.filter(page => page.embedding);
    
    // 3. Apply hierarchical clustering or DBSCAN
    //    with time-weighted similarity metric
    const clusters = this.applyClustering(pagesToCluster);
    
    // 4. Generate names for clusters based on common terms
    const namedClusters = this.generateClusterNames(clusters);
    
    // 5. Store in local DB
    await this.saveClustersToDB(namedClusters);
    
    return namedClusters;
  }
  
  // Other methods for managing and updating clusters
  // ...
}
```

## User Experience

1. **New Tab Display**:
   - Show 3-5 most recent/relevant task cards at the top of the new tab
   - Each card shows the task name and 2-3 recent pages
   - Visual indicators for active vs. dormant tasks

2. **Interaction Model**:
   - Click to expand a task and see all associated pages
   - Option to rename tasks or manually adjust page assignments
   - Simple toggle to pin important tasks to the top

3. **Progressive Enhancement**:
   - Start with basic clustering and improve the algorithm over time
   - Add features like task-specific search as we gather feedback

## Next Steps

1. **Prototype**: Build a simple version using frontend-only implementation
2. **User Testing**: Gather feedback on cluster quality and usefulness
3. **Iteration**: Refine the clustering algorithm based on user feedback
4. **Enhancement**: Gradually introduce more sophisticated features (optional backend, manual adjustments)

This approach lets us deliver a compelling "wow" feature quickly while establishing a foundation for more advanced capabilities in the future. 