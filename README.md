<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a3ed6c13-1fb4-4614-96b7-5b1ad12dc8cb

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

The local development server is available at `http://localhost:3000`. You can
override the port when needed, for example with `PORT=4000 npm run dev`.

## Run on Replit

Import this repository into Replit and click **Run**. The included `.replit`
configuration installs dependencies and starts the same Vite development server.
Replit supplies its public port through the `PORT` environment variable, so no
manual port configuration is needed.

Add `GEMINI_API_KEY` in Replit's Secrets tool if the app uses Gemini API calls.
