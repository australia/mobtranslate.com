# Wajarri Language Quiz

An interactive quiz application to learn Wajarri vocabulary, built with Next.js and powered by the Wajarri dictionary database.

## Features

- 🎯 Multiple choice questions for vocabulary learning
- 📊 Real-time scoring and streak tracking
- 🎨 Clean, modern UI with Tailwind CSS
- 📱 Responsive design for all devices
- 🗄️ SQLite database with 1,600+ Wajarri words

## Getting Started

### Prerequisites
- Node.js 18+ installed
- The Wajarri dictionary database (`wajarri_dictionary.db`)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Ensure the database file is in the project root:
```bash
# Database should be at: ./wajarri_dictionary.db
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## How to Play

1. Each question shows a Wajarri word
2. Select the correct English translation from 4 options
3. Get instant feedback on your answer
4. Track your score, accuracy, and streak
5. Click "Next Question" to continue learning

## Project Structure

```
wajarri-quiz/
├── app/
│   ├── api/
│   │   ├── quiz/question/   # Quiz question generator
│   │   └── words/           # Word search API
│   ├── page.tsx             # Main quiz page
│   └── layout.tsx           # App layout
├── components/
│   └── Quiz.tsx             # Quiz component
├── lib/
│   └── db.ts                # Database utilities
└── wajarri_dictionary.db    # SQLite database
```

## API Endpoints

- `GET /api/quiz/question` - Get a random quiz question
- `GET /api/words?q=search` - Search for words
- `GET /api/words?limit=10` - Get random words

## Database Schema

The app uses a SQLite database with:
- **lexical_entries** - Wajarri words and translations
- **examples** - Usage examples
- **grammar_features** - Linguistic data
- Full-text search capabilities

## Technologies Used

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **SQLite** - Database
- **Turbopack** - Fast bundling

## Future Enhancements

- [ ] Reverse quiz mode (English to Wajarri)
- [ ] Difficulty levels
- [ ] Audio pronunciation
- [ ] Progress tracking with localStorage
- [ ] Leaderboard system
- [ ] Category-based quizzes

## License

This project is part of the MobTranslate.com Wajarri dictionary initiative.