# AI Paper Reader

A web application that helps you read and understand research papers with AI assistance using Google Gemini.

## Features

- **PDF Upload & Viewing**: Upload and view PDF papers with a clean interface
- **Text Selection**: Select any passage from the PDF
- **AI Chat**: Ask questions about selected text with instant AI responses
- **Persistent Highlights**: Previously queried passages are marked with grey highlights
- **Conversation History**: Continue conversations about specific passages
- **Instant Access**: All highlights and conversations are preloaded for zero-latency access

## Setup

### Prerequisites

- Node.js 18+ and npm
- Google AI Studio API key (get one at https://aistudio.google.com/)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
Create a `.env` file in the root directory:
```
GEMINI_API_KEY=your_google_ai_studio_api_key_here
DATABASE_URL=file:./dev.db
GEMINI_MODEL=gemini-1.5-pro  # Optional: specify model name (default: gemini-1.5-pro)
```

3. Set up the database:
```bash
npx prisma generate
npx prisma db push
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Upload a PDF**: Click "Upload PDF" and select a PDF file
2. **Select Text**: Click and drag to select any text in the PDF
3. **Ask Questions**: Click the "Ask AI" button that appears, then type your question
4. **View Highlights**: Previously queried passages appear as grey highlights
5. **Resume Conversations**: Click any grey highlight to reopen and continue that conversation

## Technology Stack

- **Next.js 15** - React framework with API routes
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Prisma + SQLite** - Database
- **react-pdf** - PDF rendering
- **Google Gemini API** - AI chat

## Project Structure

```
paper-reader/
├── app/
│   ├── api/          # API routes (PDFs, highlights, chat)
│   ├── page.tsx      # Main application page
│   └── layout.tsx   # Root layout
├── components/       # React components
├── lib/              # Utilities (database, Gemini client)
├── prisma/           # Database schema
└── uploads/          # Uploaded PDF files
```

## Notes

- PDFs are stored in the `uploads/` directory
- Database is stored as `dev.db` (SQLite)
- All data persists locally
- For production deployment, ensure proper file storage and database configuration
