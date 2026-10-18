# AntarAalay.ai

AI-Powered Interior Design Platform with Vastu Integration

Transform your space with AI-generated interior designs that align with ancient Vastu principles. Perfect harmony between modern aesthetics and 5000-year-old Vastu Shastra science.

## Features

- **AI Design Generation**: Upload one room photo or capture one with the in-app camera, set its facing direction manually or with the compass, then generate designs guided by room type, style, custom wishes, and Vastu recommendations
- **Before-and-after results**: Compare the original room photo with its AI redesign and view additional design variations
- **Per-image Vastu review**: A vision model analyzes each generated variation against room-type Vastu guidance and reports its score, confidence, and visible evidence
- **Budget Planning**: Accurate cost estimates and furniture breakdowns
- **Style Options**: Modern, Traditional Indian, Minimalist, Luxury, Bohemian, Scandinavian, Industrial, Contemporary
- **Honest scoring**: No fixed score is substituted when image analysis is unavailable or evidence is insufficient

## Tech Stack

### Backend
- Python 3.11 + FastAPI
- SQLAlchemy + Supabase PostgreSQL
- Firebase cloud storage
- Firebase Authentication
- Stability AI (Stable Diffusion)

### Frontend
- Next.js + TypeScript
- Tailwind CSS
- Zustand (state management)
- React Query (data fetching)
- Firebase Auth
- Axios

## Quick Start

### Prerequisites
- Node.js 20.9+
- Python 3.11+
- PostgreSQL (or Supabase account)
- Firebase storage bucket
- Firebase project
- Stability AI API key
- Gemini API key for image-based Vastu analysis

### Backend Setup

```bash
cd Backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy and fill environment variables
cp env.example .env

# Set GEMINI_API_KEY in Backend/.env for per-image visual Vastu assessments.
# Scores are not returned when the vision key is missing or evidence is insufficient.

# Run development server
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd Frontend
npm ci

# Set the NEXT_PUBLIC_* values from Documentation/DEPLOYMENT.md
# in Frontend/.env.local before running the frontend.

# Run development server
npm run dev
```

## API Endpoints

### Room Management
- `POST /api/room/upload-single` - Upload one room photo with its facing direction and optional compass heading
- `POST /api/room/upload` - Legacy endpoint for four directional room images
- `GET /api/room/{room_id}` - Get room details
- `GET /api/room/user/rooms` - Get user's rooms

### Design Generation
- `POST /api/design/generate` - Generate AI designs from the saved photo, room type, style, direction, and optional custom prompt; analyzes each saved variation when Gemini is configured
- `GET /api/design/{design_id}` - Get design details and each image's Vastu assessment
- `GET /api/design/room/{room_id}` - Get room designs

### Vastu Analysis
- `POST /api/vastu/analyze` - Look up rule-based room-type/direction guidance (not an image analysis)
- `GET /api/vastu/direction/{direction}` - Get direction info
- `GET /api/vastu/score/{direction}/{room_type}` - Get Vastu score
- `GET /api/vastu/remedies/{direction}/{room_type}` - Get remedies

The image assessment is a limited visual estimate, not a full floor-plan audit. The saved direction is where the camera faces; it does not identify the room's location within a home's cardinal grid. The report includes that limitation and does not assign a score when visible evidence is insufficient.

## Project Structure

```
AntarAalay.ai/
├── Backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── dependencies.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── room.py
│   │   │   └── design.py
│   │   ├── schemas/
│   │   │   ├── room.py
│   │   │   ├── design.py
│   │   │   └── vastu.py
│   │   ├── routes/
│   │   │   ├── room.py
│   │   │   ├── design.py
│   │   │   └── vastu.py
│   │   └── services/
│   │       ├── ai_engine.py
│   │       ├── vastu_engine.py
│   │       ├── storage.py
│   │       └── budget_engine.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── Frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Upload.tsx
│   │   │   ├── Designs.tsx
│   │   │   └── Vastu.tsx
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── upload.ts
│   │   │   ├── design.ts
│   │   │   └── vastu.ts
│   │   ├── store/
│   │   │   └── authStore.ts
│   │   ├── lib/
│   │   │   └── firebase.ts
│   │   └── App.tsx
│   ├── package.json
│   └── .env.example
└── DEPLOYMENT.md
```

<!-- ## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

**Backend**: Docker → Render/EC2
**Frontend**: Vercel
**Database**: Supabase
**Storage**: AWS S3 -->

## License

MIT License - Built for production use.

## Support

For issues or questions, please open a GitHub issue.

---

Built with ❤️ for the Indian home design market.
