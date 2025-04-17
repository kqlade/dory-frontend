/**
 * Graph and concept-related type definitions
 */

/**
 * Page data representing a web page in a concept
 */
export interface PageData {
  pageId: string;
  title: string;
  url: string;
  confidence?: number;
  assignedAt?: string;
  [key: string]: any;
}

/**
 * Properties of a relationship between pages
 */
export interface RelationshipProperties {
  transitionCount?: number;
  avgTimeSpentSeconds?: number;
  coOccurrenceCount?: number;
  lastCoOccurrence?: string;
  [key: string]: any;
}

/**
 * Relationship between two pages
 */
export interface RelationshipData {
  source: string;
  target: string;
  type: string;
  properties?: RelationshipProperties;
}

/**
 * Concept data structure
 */
export interface ConceptData {
  conceptId: string;
  userId: string;
  label: string;
  description: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  parentConceptId: string | null;
  lastActivated: number;
  pages: PageData[];
}

/**
 * Complete graph data structure containing concept and relationships
 */
export interface GraphData {
  concept: ConceptData;
  relationships: RelationshipData[];
}

/**
 * Relationship types
 */
export enum RelationshipType {
  TRANSITIONS_TO = "TRANSITIONS_TO",
  CO_OCCURRING = "CO_OCCURRING",
  CONCEPT_TO_PAGE = "CONCEPT_TO_PAGE"
} 