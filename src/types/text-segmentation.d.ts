declare module 'text-segmentation' {
  interface SegmentOptions {
    minLength?: number;
    maxLength?: number;
    // Add other options as needed
  }

  export function segment(text: string, options?: SegmentOptions): string[];
} 