// Tell TypeScript about the module and its exported classes
declare module 'snowball-stemmer.jsx/dest/english-stemmer.common.js' {
    // Abstract base class
    export class Stemmer {
        constructor();
        
        // Abstract methods
        stemWord(word: string): string;
        stemWords(words: string[]): string[];
    }
    
    // Common base class implementation
    export class BaseStemmer extends Stemmer {
        constructor();
        
        // Implementation of abstract methods
        stemWord(word: string): string;
        stemWords(words: string[]): string[];
        
        // Additional methods
        setCurrent(word: string): void;
        getCurrent(): string;
        stem(): void;
    }
    
    // Concrete English stemmer implementation
    export class EnglishStemmer extends BaseStemmer {
        constructor();
        
        // Inherits all methods from BaseStemmer
        // Overrides stem() with language-specific implementation
        stem(): void;
    }
} 