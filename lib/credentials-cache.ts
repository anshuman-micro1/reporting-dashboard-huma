let cache: Record<string, string> | null = null;

export function getCachedCredentials() {
  return cache;
}

export function setCachedCredentials(creds: Record<string, string>) {
  cache = creds;
}

export function clearCredentialsCache() {
  cache = null;
}
