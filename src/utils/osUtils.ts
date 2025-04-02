/**
 * @file osUtils.ts
 * 
 * Utility functions related to operating system detection and platform-specific behavior.
 */

/**
 * Detects the user's operating system based on navigator properties.
 * Used for displaying appropriate keyboard shortcuts and platform-specific UI elements.
 * 
 * @returns The detected OS as a string ('Mac OS', 'Windows', 'Linux', or 'Unknown')
 */
export function detectOS(): string {
  const userAgent = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
  const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
  
  if (macosPlatforms.indexOf(platform) !== -1) {
    return 'Mac OS';
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    return 'Windows';
  } else if (/Linux/.test(platform)) {
    return 'Linux';
  } 
  
  // Default to detecting based on userAgent if platform check is inconclusive
  if (userAgent.indexOf('Mac') !== -1) {
    return 'Mac OS';
  } else if (userAgent.indexOf('Win') !== -1) {
    return 'Windows';
  }
  
  return 'Unknown';
}
