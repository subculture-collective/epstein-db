/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme optimized for document analysis
        background: '#0a0a0a',
        surface: '#141414',
        'surface-hover': '#1a1a1a',
        border: '#262626',
        
        // Layer colors
        'layer-0': '#ef4444', // Epstein - red
        'layer-1': '#f97316', // Direct - orange
        'layer-2': '#eab308', // One removed - yellow
        'layer-3': '#22c55e', // Two removed - green
        
        // Entity type colors
        'entity-person': '#3b82f6',
        'entity-org': '#8b5cf6',
        'entity-location': '#14b8a6',
      },
    },
  },
  plugins: [],
}
