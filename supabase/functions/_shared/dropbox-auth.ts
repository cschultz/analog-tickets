/**
 * Dropbox OAuth2 Token Management
 * Handles automatic token refresh for Scoped Apps with short-lived tokens
 */

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// In-memory cache for the current access token
let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;

/**
 * Get a valid Dropbox access token, refreshing if necessary
 * Uses DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, and DROPBOX_APP_SECRET
 */
export async function getDropboxAccessToken(): Promise<string> {
  // Check if we have a cached token that's still valid (with 5 min buffer)
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const refreshToken = Deno.env.get("DROPBOX_REFRESH_TOKEN");
  const appKey = Deno.env.get("DROPBOX_APP_KEY");
  const appSecret = Deno.env.get("DROPBOX_APP_SECRET");

  // If we have refresh token config, use OAuth refresh flow
  if (refreshToken && appKey && appSecret) {
    console.log("Dropbox: Refreshing access token using refresh token");
    
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Dropbox token refresh failed:", errorText);
      throw new Error(`Failed to refresh Dropbox token: ${response.status} - ${errorText}`);
    }

    const tokenData: TokenResponse = await response.json();
    
    // Cache the new token
    cachedToken = tokenData.access_token;
    tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
    
    console.log(`Dropbox: Token refreshed, expires in ${tokenData.expires_in} seconds`);
    return cachedToken;
  }

  // Fallback to static access token (for backwards compatibility)
  const staticToken = Deno.env.get("DROPBOX_ACCESS_TOKEN");
  if (staticToken) {
    console.log("Dropbox: Using static access token (no refresh token configured)");
    return staticToken;
  }

  throw new Error("No Dropbox credentials configured. Set DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + DROPBOX_APP_SECRET, or DROPBOX_ACCESS_TOKEN");
}

/**
 * Clear the cached token (useful if a request fails with 401)
 */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = null;
}

/**
 * Make a Dropbox API request with automatic token refresh on 401
 */
export async function dropboxFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getDropboxAccessToken();
  
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  
  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If we get a 401, clear cache and retry once with fresh token
  if (response.status === 401) {
    console.log("Dropbox: Got 401, clearing token cache and retrying");
    clearTokenCache();
    
    const newToken = await getDropboxAccessToken();
    headers.set("Authorization", `Bearer ${newToken}`);
    
    return fetch(url, {
      ...options,
      headers,
    });
  }

  return response;
}
