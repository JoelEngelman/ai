# Joel AI

A local-first coding AI built for repository work.

## What it does

- Runs an open-source LLM **in your browser** with WebGPU.
- No OpenAI/Anthropic/Gemini API key required for inference.
- No per-message AI bill and no server-side model quota.
- Connects directly to GitHub with a token you provide.
- Explores repository trees and reads files.
- Edits the open file and commits it back to GitHub.
- Keeps the AI context grounded in the repository tree and currently opened file.
- Works as a static site, so it can be hosted on GitHub Pages, Netlify, Cloudflare Pages, etc.

## Important meaning of “free + unlimited”

Inference is local. That means there is no hosted AI usage meter, but your practical limit is your computer's RAM/VRAM, browser WebGPU support, and the model you choose. The first model load downloads model weights into the browser cache and can take a while.

## GitHub setup

1. Create a GitHub fine-grained personal access token.
2. Give it access only to the repositories you want Joel AI to edit, with repository contents read/write permission.
3. Open the app and click **GitHub**.
4. Paste the token.
5. Enter a repository such as `JoelEngelman/ai` and its branch.

The token is stored in `sessionStorage`, not in source code and not in the AI prompt. It disappears when the browser session is cleared.

## Run

There is no build step for the current prototype. Open `index.html` through a static web host. Some browsers restrict WebGPU/module behavior for local `file://` pages, so a hosted URL is recommended.

## Roadmap

- GitHub OAuth instead of manually entering a token.
- Multi-file AI edits with a reviewable diff before committing.
- Branch creation, commits, pull requests, and rollback.
- Better repository indexing and symbol-aware context.
- Search across the whole repository.
- Test/build command execution in a secure sandbox.
- Automatic error diagnosis from CI logs.
- Conversation history and project memory.
- Multiple local coding models, including larger coding-focused models where the device can handle them.
- Optional remote model adapters for users who want stronger models.
