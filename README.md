# AEGIS 🌍 - AI-Powered Tactical Globe

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-blue)
![Vite](https://img.shields.io/badge/Vite-5-purple)
![Three.js](https://img.shields.io/badge/Three.js-r160-black)

AEGIS is an interactive 3D globe visualization platform featuring a built-in AI assistant. Powered by **Groq** and **Hindsight Memory**, the AEGIS Agent can manipulate the globe via tool calls—adding custom disaster events, mapping supply routes, placing command centers, and retaining important contextual memory across sessions.

## 🚀 Features

- **Interactive 3D Globe**: Built with `react-three-fiber` and `three.js`, featuring beautiful atmospheres, glowing markers, and animated supply routes.
- **AEGIS AI Agent**: A tactical AI assistant utilizing Groq's high-speed inference (Llama-3).
- **Function Calling**: The agent can dynamically plot disaster zones, evacuation routes, and critical pins based on your natural language commands.
- **Hindsight Memory**: Long-term persistent memory for the AI. Tell the agent your mission objectives or HQ location, and it will remember them in future sessions!
- **Real-time Live Data**: Support for live disaster events via USGS and NASA EONET feeds.
- **Modern UI**: Polished glassmorphism dashboard built with TailwindCSS and shadcn/ui.

## 🛠️ Tech Stack

### Frontend
- React 18 & Vite
- TypeScript
- TailwindCSS + shadcn/ui
- Zustand (Global State Management)
- React Three Fiber & Drei (3D rendering)

### Backend
- Node.js & Express
- Hindsight API (Long-term Agent Memory)

### AI & Data
- Groq Cloud API (Primary LLM)
- OpenRouter API (Fallback LLM)

## 📦 Getting Started

### Prerequisites
- Node.js (v18+)
- API keys for **Groq**, **OpenRouter**, and **Hindsight**.

### 1. Installation

Clone the repository and install dependencies for both frontend and backend:

```bash
# Clone the repository
git clone https://github.com/zubair03222006-sudo/earth-2.git
cd earth-2

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Variables

Create `.env` files in both `frontend` and `backend` directories.

**frontend/.env**
```env
VITE_GROQ_API_KEY=your_groq_api_key
VITE_OPENROUTER_API_KEY=your_openrouter_api_key
```

**backend/.env**
```env
PORT=3001
HINDSIGHT_API_KEY=your_hindsight_api_key
```

### 3. Running the App

You need to run both the frontend and backend servers concurrently.

**Start the backend server:**
```bash
cd backend
npm run dev
```

**Start the frontend development server:**
```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` in your browser.

## 🤖 Example Agent Commands

Try asking the AEGIS Agent:
- *"Add a critical M7.2 earthquake in Tokyo."*
- *"Draw an evacuation route from London to Madrid."*
- *"Remember that our primary command center is in New York."*
- *"Clear all custom disaster events."*

## 📜 License

This project is licensed under the MIT License.
