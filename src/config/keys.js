// Keys are loaded from environment variables (Vite exposes VITE_* vars)
// Create a .env file locally (git-ignored) or set in Vercel dashboard:
// VITE_GROQ_API_KEY=...
// VITE_GOOGLE_CLIENT_ID=...
// VITE_GOOGLE_CLIENT_SECRET=...
// VITE_SHEET_ID=...

export const KEYS = {
  GROQ: import.meta.env.VITE_GROQ_API_KEY || '',
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: import.meta.env.VITE_GOOGLE_CLIENT_SECRET || '',
  GOOGLE_API_KEY: import.meta.env.VITE_GOOGLE_API_KEY || 'AIzaSyDx2_XFjDK0blY3Oe1KozO-ji0HqyAWnNk',
  SHEET_ID: import.meta.env.VITE_SHEET_ID || '1Qw2LRgQuIR1CHox1XNJ3DPLipEEPE7k16tJLMYaoyt0',
};
