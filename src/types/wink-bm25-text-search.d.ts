declare module 'wink-bm25-text-search' {
  export interface BM25Instance {
    init: (corpus: string[][]) => void;
    search: (query: string[]) => number[];
  }

  export function BM25(): BM25Instance;
} 