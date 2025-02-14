declare module 'snowball-stemmers' {
  export interface Stemmer {
    stem: (word: string) => string;
  }

  export const stemmer: (language: string) => Stemmer;
} 