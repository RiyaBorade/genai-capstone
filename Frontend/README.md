# AI Interior - Frontend Application

A modern, responsive React application for AI-powered interior design with Vastu Shastra integration.

## 🚀 Features

- **Modern UI/UX**: Built with React, TypeScript, and Tailwind CSS
- **Smooth Animations**: Powered by Framer Motion for eye-catching visuals
- **Responsive Design**: Fully responsive across all devices
- **Component-Based**: Modular component architecture
- **Performance Optimized**: Built with Next.js for development and production

## 📦 Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Next.js** - React framework, routing, and build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Animation library
- **Lucide React** - Icon library

## 🛠️ Installation

1. Install dependencies:
```bash
npm ci
```

2. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## 📁 Project Structure

```
Frontend/
├── src/
│   ├── components/
│   │   ├── Header.tsx          # Navigation header
│   │   ├── Hero.tsx            # Hero section with upload
│   │   ├── Features.tsx        # Features showcase
│   │   ├── DesignStyles.tsx   # Design style cards
│   │   ├── Services.tsx        # AI services grid
│   │   ├── HowItWorks.tsx      # Step-by-step process
│   │   ├── Testimonials.tsx    # Customer reviews
│   │   ├── CTA.tsx             # Call-to-action section
│   │   └── Footer.tsx          # Footer component
│   ├── App.tsx                 # Main app component
│   ├── main.tsx                # Entry point
│   └── index.css               # Global styles
├── public/                     # Static assets
├── src/app/                    # Next.js App Router pages and layout
├── package.json                # Dependencies and scripts
├── next.config.js              # Next.js configuration
├── tailwind.config.ts          # Tailwind configuration
└── tsconfig.json               # TypeScript configuration
```

## 🎨 Components Overview

### Header
- Fixed navigation bar with smooth scroll
- Responsive mobile menu
- Glass morphism effect

### Hero
- Animated background elements
- Video upload interface with drag & drop
- Gradient text effects
- Call-to-action buttons

### Features
- Three main feature cards
- Hover animations
- Icon-based design

### Design Styles
- Interactive style cards
- Hover effects
- Gradient backgrounds

### Services
- Grid layout of AI services
- Featured service highlighting
- Icon-based cards

### How It Works
- Step-by-step process visualization
- Animated connection lines
- Numbered steps with icons

### Testimonials
- Customer review cards
- Star ratings
- Avatar initials

### CTA
- Gradient background
- Animated elements
- Multiple action buttons

### Footer
- Multi-column layout
- Contact information
- Service links

## 🎯 Key Features

1. **Smooth Animations**: All components use Framer Motion for smooth, professional animations
2. **Responsive Design**: Mobile-first approach with Tailwind CSS
3. **Modern UI**: Clean, modern design with gradient effects and glass morphism
4. **Performance**: Optimized with Next.js for fast loading
5. **Type Safety**: Full TypeScript support

## 🚀 Build for Production

```bash
npm run build
```

Next.js generates the production build in `.next/`. For Vercel, set the project
Root Directory to `Frontend` and keep the default Next.js output settings.

## 📝 Development

- Hot Module Replacement (HMR) enabled
- Fast refresh for React components
- TypeScript type checking
- ESLint for code quality

## 🎨 Customization

### Colors
Edit `tailwind.config.js` to customize the color scheme.

### Animations
Modify Framer Motion variants in individual components.

### Content
Update component props and data arrays to change content.

## 📄 License

This project is part of the AntarAalay.ai application.

---

Built with ❤️ using React, TypeScript, and Tailwind CSS
