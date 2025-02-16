export interface SearchResult {
  score: number;
  chunkId: string;
  metadata: {
    chunkText: string;
    title?: string;
    url?: string;
    visitedAt?: string;
    lastModified?: string;
    docId: string;
    [key: string]: any;
  };
}

export interface DoryMessageProps {
  type: 'suggestion' | 'alternative' | 'error';
  children: React.ReactNode;
}

export interface SearchResultCardProps {
  result: SearchResult;
}

export interface ExpandableSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
} 