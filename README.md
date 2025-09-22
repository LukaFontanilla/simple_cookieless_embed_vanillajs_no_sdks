# Looker Cookieless Embed Demo

This project provides a minimal example of how to implement Looker's cookieless embedding feature without the use of any Frontend or Backend SDK's. It consists of a simple Node.js Express server that authenticates with the Looker API and serves an HTML page containing an embedded Looker dashboard.

## Purpose

The goal of this repository is to serve as a clear and concise educational resource for developers looking to understand and implement cookieless embedding. The server-side code handles the API authentication and token exchange with the Looker API, while the client-side HTML and JavaScript demonstrate how to load the embedded content and handle the token refresh lifecycle.

## Getting Started

Follow these instructions to get the project running on your local machine.

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed on your system.

### Installation

1. Clone the repository (if you haven't already).
2. Install the required npm packages:
   ```bash
   npm install
   ```

### Configuration

Before running the application, you need to configure your Looker API credentials and specify the dashboard you want to embed.

1.  **Create a `.env` file** in the root of the project. You can copy the `.env_example` file as a template.

2.  **Add the following variables** to your `.env` file:

    ```
    # The URL of your Looker API (e.g., https://your.looker.instance:19999)
    LOOKER_API_URL=

    # The base URL of your Looker instance (e.g., https://your.looker.instance)
    LOOKER_BASE_URL=

    # Your Looker API Client ID
    LOOKER_CLIENT_ID=

    # Your Looker API Client Secret
    LOOKER_CLIENT_SECRET=

    # The ID of the Looker dashboard you want to embed
    LOOKER_DASHBOARD_ID=
    ```

3.  **(Optional) Modify `user.json`**: This file defines the properties of the embed user, such as permissions and user attributes. You can modify this file to change the embed user's settings.

4. Add the `http://localhost:8000` url to your Looker instance's Admin -> Embed -> Embed Domain Allowlist, to enable Cookieless Embed for that host.

## Running the Application

Once the project is configured, you can start the server by running:

```bash
npm run start
```

The server will start on port 8000. You can access the application by navigating to `http://localhost:8000` in your web browser.

## In Production

In production there are a few things you'll want to take note of, that this minimal impelementation does not do:
* The Cookieless session tokens are persisted in a simple in memory json object, meaning on server restart/page load these tokens will be regenerated. Recomendation is to use a proper cache to store these tokens and their TTL's.
* We use a static user profile for the Embed User, in production this profile would typically be dynamic and either stored in a database table OR created on the fly given the app user identity.
* Never expose the `session_reference_token` to the browser, not even in a HTTP Only Cookie. Instead your backend should generate a `session_id` that can be used to fetch the `session_reference_token` and other tokens from the server-side cache.
* For simplicity, the Looker Admin API Access token is not cached in the sample and instead generated on each request to the cookieless endpoints. We recommend caching this token and it's TTL and syncing that with the parent application's session duration.
