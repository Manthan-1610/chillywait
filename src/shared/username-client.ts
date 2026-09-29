import type { ClaimUsernameResult } from './username-api';
import { isExtensionContextValid } from './extension-context';

function sendMessage<T>(message: unknown): Promise<T> {
  if (!isExtensionContextValid()) {
    return Promise.reject(new Error('Extension context unavailable'));
  }
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response as T);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export type UsernameCheckResponse = { available: boolean; configured: boolean };

export type UsernameClaimResponse = ClaimUsernameResult & { configured: boolean };

export async function checkUsername(username: string): Promise<UsernameCheckResponse> {
  return sendMessage<UsernameCheckResponse>({ type: 'username_check', username });
}

export async function claimUsername(username: string): Promise<UsernameClaimResponse> {
  return sendMessage<UsernameClaimResponse>({ type: 'username_claim', username });
}
