declare module 'wink-nlp-utils' {
  // Declare the structure we are using: nlpUtils.string.stem(word)
  export namespace string {
    /**
     * Stems the input word using Porter Stemmer V1.
     * @param word The word to stem.
     * @returns The stemmed word.
     */
    export function stem(word: string): string;
    // Add other functions from nlpUtils.string here if needed in the future
  }
  // Add other namespaces like nlpUtils.tokens here if needed
} 