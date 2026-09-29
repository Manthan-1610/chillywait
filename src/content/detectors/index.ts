import type { PlatformId } from '../../shared/constants';
import { createGeminiDetector } from './gemini';
import type { PlatformDetector } from './types';

export function createDetector(platform: PlatformId): PlatformDetector {
  switch (platform) {
    case 'gemini':
      return createGeminiDetector();
  }
}
