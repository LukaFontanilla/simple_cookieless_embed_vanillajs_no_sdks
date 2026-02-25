# Looker Cookieless Embed Flow Documentation

This document details the implementation of Looker's cookieless embed flow in this application, which allows for embedding Looker content without relying on third-party cookies.

## Architecture Overview

The flow is split between the frontend (Vanilla JS with Looker Embed SDK) and the backend (Node.js/Express).

### Initial Session Acquisition
1.  **Browser**: Requests `/api/acquire-embed-session`.
2.  **Backend**: 
    - Authenticates as Admin with Looker API to get an `admin_token`.
    - Generates a `cacheKey` (UserID + UserAgent).
    - Calls Looker's `cookieless_session/acquire` endpoint.
    - Caches the sensitive `session_reference_token` server-side.
    - Sends only the public `client_tokens` back to the Browser.
3.  **Browser**: Loads the Looker iframe using these tokens.

### Token Refresh Loop
1.  **Browser**: Looker iframe triggers a refresh; Browser calls `/api/generate-embed-tokens`.
2.  **Backend**:
    - Retrieves the `session_reference_token` from the local cache.
    - Calls Looker's `cookieless_session/generate_tokens` endpoint.
    - **Session Recovery**: If the session has expired, it automatically re-acquires a new session.
    - Sends the updated public tokens back to the Browser.
3.  **Browser**: Updates the iframe tokens.

## Detailed Steps

### 1. Initialization (Frontend)
The frontend initializes the Looker Embed SDK to use cookieless session management. It points to the backend endpoints that will handle the sensitive token management.

```javascript
LookerEmbedSDK.getEmbedSDK().initCookieless(
  lookerHost,
  '/api/acquire-embed-session',
  '/api/generate-embed-tokens'
);
```

### 2. Acquire Session (Backend)
When the SDK needs a session, it calls `/api/acquire-embed-session`.

1.  **Admin Auth**: The backend uses `LOOKER_CLIENT_ID` and `LOOKER_CLIENT_SECRET` to get a short-lived admin token.
2.  **State Management**: It generates a unique `cacheKey` using the user's ID and `User-Agent` to ensure session isolation.
3.  **Looker Acquire**: It calls Looker's `acquire` endpoint. 
    *   If a `session_reference_token` already exists in cache, it's passed along to potentially resume or refresh the session.
4.  **Security Partitioning**: 
    *   The `session_reference_token` (highly sensitive) is **stored on the server**.
    *   Only `api_token` and `navigation_token` are sent to the browser.

### 3. Generate Tokens / Refresh (Backend)
As tokens approach expiry, the Looker iframe sends a message to the parent window, which triggers a call to `/api/generate-embed-tokens`.

1.  **Retrieve State**: The backend pulls the `session_reference_token` from its internal cache.
2.  **Token Refresh**: It calls Looker's `generate_tokens` endpoint.
3.  **Automatic Recovery**: If the session has fully expired (`session_reference_token_ttl === 0`), the backend automatically initiates a new `acquire` call to seamlessly recreate the session without user intervention.

## Benefits of this Implementation
- **No Third-Party Cookies**: Works in browsers that block 3PC by default (Safari, Brave, Chrome Incognito).
- **Secure Token Handling**: Sensitive reference tokens never leave the server.
- **Stateless Frontend**: The frontend doesn't need to know how to handle admin credentials or complex session logic.
