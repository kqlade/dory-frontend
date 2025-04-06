/**
 * @file workspaceAdapter.ts
 * 
 * Adapter utility that converts the new workspace-oriented clustering API response
 * into the existing ClusterResponse format that our UI components expect.
 */

import { ClusterResponse, ClusterSuggestion, ClusterPage } from '../types';

/**
 * Generates a unique page ID from a URL if one is not provided
 */
function generatePageId(url: string): string {
  return `page_${url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)}_${Date.now()}`;
}

/**
 * Extract clusters from the workspace structure in priority order
 */
function extractClustersFromWorkspace(workspace: any): ClusterSuggestion[] {
  if (!workspace || !workspace.contexts) {
    console.warn('[workspaceAdapter] Invalid or empty workspace structure');
    return [];
  }

  const contextPriority = ['current_work', 'recent_projects', 'knowledge_areas'];
  const allClusters: ClusterSuggestion[] = [];
  
  // Process contexts in priority order
  contextPriority.forEach(contextId => {
    const context = workspace.contexts.find((ctx: any) => ctx.id === contextId);
    if (context && Array.isArray(context.clusters)) {
      // Convert each cluster to our expected format
      context.clusters.forEach((cluster: any) => {
        // Skip invalid clusters
        if (!cluster.id || !cluster.name) return;
        
        // Extract pages
        const pages: ClusterPage[] = [];
        if (cluster.content && Array.isArray(cluster.content.keyPages)) {
          cluster.content.keyPages.forEach((page: any) => {
            if (page.title && page.url) {
              pages.push({
                page_id: generatePageId(page.url),
                title: page.title,
                url: page.url
              });
            }
          });
        }
        
        // Create cluster in format expected by UI
        allClusters.push({
          cluster_id: cluster.id,
          label: cluster.name,
          page_count: pages.length,
          top_pages: pages
        });
      });
    }
  });
  
  return allClusters;
}

/**
 * Transforms the new workspace API response into the ClusterResponse format
 * that our existing UI components expect
 */
export function adaptWorkspaceToClusterResponse(response: any): ClusterResponse {
  // Handle case where response might already be in expected format
  if (response && response.suggestions) {
    return response;
  }
  
  // Handle job status response format
  if (response && response.status && response.result) {
    if (response.result.workspace) {
      // Extract from workspace field in the result
      const clusters = extractClustersFromWorkspace(response.result.workspace);
      return { suggestions: clusters };
    } else if (response.result.contexts) {
      // The result itself is the workspace structure
      const clusters = extractClustersFromWorkspace(response.result);
      return { suggestions: clusters };
    }
  }
  
  // Handle direct API response with a workspace field
  if (response && response.workspace) {
    const clusters = extractClustersFromWorkspace(response.workspace);
    return { suggestions: clusters };
  }
  
  // Handle case where response itself is the workspace
  if (response && response.contexts) {
    const clusters = extractClustersFromWorkspace(response);
    return { suggestions: clusters };
  }
  
  // Fallback for unexpected response formats
  console.warn('[workspaceAdapter] Unexpected response format:', response);
  return { suggestions: [] };
}

/**
 * Intercepts and processes fetch responses from clustering API endpoints.
 * Use this as a wrapper around fetch calls to auto-adapt the response format.
 * 
 * @example
 * // Instead of: const data = await response.json();
 * const data = await adaptFetchResponse(response);
 */
export async function adaptFetchResponse(response: Response): Promise<any> {
  const data = await response.json();
  
  // If this is a direct API response with workspace data
  if (data && data.workspace) {
    // Store the full workspace data for future use
    try {
      await chrome.storage.local.set({
        'workspace_data': data.workspace
      });
    } catch (error) {
      console.warn('[workspaceAdapter] Failed to store full workspace data:', error);
    }
    
    // Transform and return the adapted format
    return adaptWorkspaceToClusterResponse(data);
  }
  
  // Pass through for other response types
  return data;
} 