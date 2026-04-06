# TAD Social Dashboard

Post review dashboard for TAD Entertainment social media pipeline.

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → Add New Project → Import that repo
3. In Vercel project settings → Environment Variables, add:
   - `ANTHROPIC_API_KEY` — your Anthropic API key
   - `AIRTABLE_API_KEY` — your Airtable PAT
4. Deploy

## Local Development

```bash
npm install
npm run dev
```

For local dev, create a `.env.local` file:
```
ANTHROPIC_API_KEY=your_key_here
AIRTABLE_API_KEY=your_pat_here
```

Then run with Vercel CLI for the API functions:
```bash
npm install -g vercel
vercel dev
```

## Features

- Live post feed from Airtable Social Marketing Requests
- Filter by status (To Do, In Progress, Ready to Post, Completed, Cancelled)
- Inline copy editing — saves directly to Airtable
- One-click approve → marks Ready to Post in Airtable
- AI regeneration via Claude — rewrites copy and saves back
- Character counter (flags over 160 chars)
- Cancel individual posts
