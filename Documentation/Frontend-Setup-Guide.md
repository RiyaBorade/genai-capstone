# Frontend Setup Guide - AntarAalay.ai

## 🎯 Recommended Setup: Vite + React + TypeScript + Tailwind + Shadcn/ui

This guide will help you set up the frontend from scratch using the recommended modern stack.

---

## Step 1: Create the Project

```bash
# Navigate to your project root
cd D:\AntarAalay.ai

# Create Vite React TypeScript project
npm create vite@latest Frontend -- --template react-ts

# Navigate to Frontend folder
cd Frontend

# Install dependencies
npm install
```

---

## Step 2: Install Tailwind CSS

```bash
# Install Tailwind CSS and dependencies
npm install -D tailwindcss postcss autoprefixer

# Initialize Tailwind
npx tailwindcss init -p
```

**Update `tailwind.config.js`:**
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Update `src/index.css`:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Step 3: Install Shadcn/ui

```bash
# Install shadcn/ui CLI
npx shadcn-ui@latest init
```

**Follow the prompts:**
- Style: Default
- Base color: Slate
- CSS variables: Yes

**Install essential components:**
```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add form
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add tabs
```

---

## Step 4: Install Core Dependencies

```bash
# Routing
npm install react-router-dom

# State Management
npm install zustand

# API Client
npm install axios

# File Upload
npm install react-dropzone

# Image Gallery
npm install react-image-gallery

# Form Handling
npm install react-hook-form @hookform/resolvers zod

# Authentication (Choose one)
npm install firebase
# OR
npm install @supabase/supabase-js

# Data Fetching
npm install @tanstack/react-query

# Icons
npm install lucide-react

# Animations
npm install framer-motion
```

---

## Step 5: Project Structure

Create the following folder structure:

```
Frontend/
├── public/
├── src/
│   ├── components/
│   │   ├── ui/              # Shadcn/ui components
│   │   ├── layout/          # Layout components (Header, Sidebar, Footer)
│   │   ├── auth/            # Auth components (Login, Signup)
│   │   ├── upload/          # Image upload components
│   │   ├── gallery/         # Image gallery components
│   │   └── vastu/           # Vastu suggestion components
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Upload.tsx
│   │   ├── Designs.tsx
│   │   └── Vastu.tsx
│   ├── services/
│   │   ├── api.ts           # API configuration
│   │   ├── auth.ts          # Authentication service
│   │   ├── upload.ts        # File upload service
│   │   └── vastu.ts         # Vastu API service
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useUpload.ts
│   │   └── useVastu.ts
│   ├── store/
│   │   ├── authStore.ts     # Zustand store for auth
│   │   └── designStore.ts   # Zustand store for designs
│   ├── context/
│   │   └── AuthContext.tsx
│   ├── utils/
│   │   ├── constants.ts
│   │   └── helpers.ts
│   ├── types/
│   │   ├── user.ts
│   │   ├── design.ts
│   │   └── vastu.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
└── vite.config.ts
```

---

## Step 6: Environment Variables

Create `.env` file in Frontend folder:

```env
# Firebase (if using Firebase)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# OR Supabase (if using Supabase)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend API
VITE_API_BASE_URL=http://localhost:8000

# Vastu API
VITE_VASTU_API_KEY=your_vastu_api_key
```

---

## Step 7: Basic App Setup

**Update `src/App.tsx`:**
```tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Designs from './pages/Designs';
import Vastu from './pages/Vastu';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/designs" element={<Designs />} />
          <Route path="/vastu" element={<Vastu />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
```

---

## Step 8: Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

---

## 🎨 Alternative: Material-UI Setup

If you prefer Material-UI instead:

```bash
# Create project
npm create vite@latest Frontend -- --template react-ts
cd Frontend
npm install

# Install Material-UI
npm install @mui/material @emotion/react @emotion/styled
npm install @mui/icons-material
npm install @mui/lab

# Install other dependencies (same as Step 4)
```

---

## 📚 Next Steps

1. Set up authentication (Firebase/Supabase)
2. Create layout components (Header, Sidebar, Footer)
3. Build upload page with drag-and-drop
4. Create image gallery for AI designs
5. Integrate Vastu API
6. Add routing guards for protected routes
7. Set up state management stores

---

## 🔗 Useful Resources

- [Vite Documentation](https://vitejs.dev/)
- [React Router](https://reactrouter.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Shadcn/ui Components](https://ui.shadcn.com/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [React Query](https://tanstack.com/query/latest)

---

## ⚡ Quick Commands Reference

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint
npm run lint

# Add new shadcn/ui component
npx shadcn-ui@latest add [component-name]
```

