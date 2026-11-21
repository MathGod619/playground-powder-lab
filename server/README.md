# Powder Rave · Ollama Scene Director

The browser runs the game. This small Node bridge asks your own Ollama for bounded scene plans. It does not execute model code or change other server services.

## What ships

- Director panel: Adjust world / Create scene, explicit Generate, static ghost preview, Apply / Discard, single-step Undo and 12 locally saved templates.
- Tools: material rectangles, ellipses, diagonal lines, towers, bridges, individual drop-only bombs and speakers.
- Environment: gravity, settling speed, wind, palette hue, water colour, and kick/speaker/spark/slosh music reactions.
- Uploaded photos stay in the browser. Requests include only the prompt, basic world settings and the last photo's bounding rectangle.
- The bridge URL is saved locally. The bearer token stays in panel memory, is never bundled, and clears on close.
- Director is available in Sandbox; it cannot modify a competitive Rave round.

No server connection is preconfigured. Example is an explicitly labelled built-in template and makes no AI request.

## Start privately on Ubuntu

Requires Node 24+ and an already installed Ollama model (default: qwen3:4b-instruct).
Use a separate checkout of this repository. Do not replace the Epsilon/Pipeline services or expose Ollama's port.

From that checkout, on Ubuntu:

```sh
read -rs -p 'Director token (32+ random characters): ' DIRECTOR_TOKEN
export DIRECTOR_TOKEN
export OLLAMA_MODEL=qwen3:4b-instruct
npm run director
```

The token must be a new random secret that you save in your password manager; never use an account password.
The bridge listens only on 127.0.0.1:4190. It needs no npm dependencies.
Run in your existing tmux session to keep it alive. For service management, use a separate unit and private environment file after choosing the permanent install path.

From your Mac, use the established private Tailscale SSH route:

```sh
ssh -N -L 4190:127.0.0.1:4190 serveroverlord@100.97.20.42
```

Keep that tunnel open. In desktop Chrome or Edge, open the game, choose Director → Server connection:

- Bridge URL: http://127.0.0.1:4190
- Bridge token: the secret entered on Ubuntu
- Test connection, then Generate preview.

The browser may ask permission to connect to your local network. Browser/OS rules vary; if localhost access is blocked, use an approved private HTTPS reverse proxy instead. Do not disable browser security. No HTTPS route or Tailscale Serve settings are changed by this package.

For an existing approved private HTTPS route, proxy a dedicated path/port to 127.0.0.1:4190. Put that exact HTTPS URL into the panel. Keep bearer authentication. Never publish the token in Git, frontend env variables or a URL.

## Configuration

- DIRECTOR_TOKEN: required, 32+ characters, startup fails without it.
- OLLAMA_MODEL: qwen3:4b-instruct by default. Health verifies it is installed.
- OLLAMA_URL: http://127.0.0.1:11434 by default, configured only by the server owner.
- PORT: 4190 by default; bind remains loopback-only.
- DIRECTOR_ORIGINS: exact comma-separated browser origins; defaults to https://mathgod619.github.io, https://playground-powder-lab.seshrecs.chatgpt.site and http://127.0.0.1:4185.

## API / guardrails

GET /health (bearer auth): verifies Ollama and the configured model.
POST /plan (bearer auth, application/json): {prompt, mode: adjust|create, context}.
Response: {plan, model}. Schema is in src/director-plan.ts and revalidated in bridge and client.
Requests are capped at 12 KB; prompts at 1,600 characters; plans at 48 tools. One generation at a time, six per minute per socket address, 75-second upstream timeout. Proxy headers are deliberately not trusted.
Unknown tools, scripts, file paths, arbitrary URLs, nonfinite values and scene replacement in Adjust mode are rejected.

Tests exercise the real HTTP bridge with a simulated Ollama upstream; they do not claim verification of your physical server or model quality. Run npm test and npm run build. On the real bridge, confirm Test connection, a generated preview, Apply, Undo, image preservation, template save and both audio modes.
