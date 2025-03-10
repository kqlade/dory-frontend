declare module 'jaro-winkler' {
  /**
   * Calculate the Jaro-Winkler distance between two strings.
   * @param s1 First string
   * @param s2 Second string
   * @returns A number between 0 and 1, where 1 means the strings are identical
   */
  function jaroWinkler(s1: string, s2: string): number;
  
  export = jaroWinkler;
} 