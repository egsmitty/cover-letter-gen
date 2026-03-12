# Cover Letter Generator

Upload a resume + paste a job posting and get a personalized cover letter example that sounds like you -- The customize to perfection.

## Features

- Upload resume as PDF, DOCX, or TXT
- Paste any job description
- Tune tone (Professional / Friendly / Formal), length, and focus area
- Optionally specify company name and position title
- Editable output — refine before copying

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **AI:** Claude API (Anthropic)
- **Parsing:** pdf-parse, mammoth

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/cover-letter-gen.git
cd cover-letter-gen
```

### 2. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 3. Add your API key

```bash
cd server
cp .env.example .env
# Edit .env and add your Anthropic API key
```

Get an API key at [console.anthropic.com](https://console.anthropic.com).

### 4. Run

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (required) |
| `PORT` | Server port (default: 3001) |
| `CORS_ORIGIN` | Allowed frontend origin (default: http://localhost:5173) |
