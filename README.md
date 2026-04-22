# SDE Career Coach

Minimal chat-style interface for a coursework demo agent: `The SDE Career Negotiator & Communicator`.

## What this app does

- Provides a simple browser chat UI that looks like a lightweight LLM interface
- Includes both a career coach mode and an evaluator mode
- Sends messages to Gemini through a tiny Node server
- Stores no conversation data in any database
- Keeps the current chat only in browser memory for the active tab

## Run it

1. Copy `.env.example` to `.env`
2. Fill in one provider's API settings
3. Add your Gemini settings:

```env
GEMINI_API_KEY=your_real_key_here
GEMINI_MODEL=gemini-2.5-flash
```

4. Start the app:

```bash
node server.js
```

5. Open `http://localhost:3000`

## Modes

- `Career Coach`: ask for help with negotiation, workplace communication, and scripts
- `Evaluator`: paste a full transcript and get 1-5 ratings for the five evaluation criteria plus an overall assessment

## Gemini setup

Recommended model for this homework:

- `gemini-2.5-flash`

You can create a free Gemini API key in Google AI Studio:

- [Google AI Studio API keys](https://aistudio.google.com/app/apikey)
- [Gemini API quickstart](https://ai.google.dev/gemini-api/docs/quickstart)

## Notes

- If you want screenshots for the report, the quick-start scenario buttons help you generate five distinct conversation types quickly.
- The system prompt lives in [server.js](/Users/Wilson1/Desktop/sde-career-coach/server.js).
