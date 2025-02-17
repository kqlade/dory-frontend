import { SearchResult } from '../api/types';

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