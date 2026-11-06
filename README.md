# ♔ Grandmaster-AI: Next-Generation 3D Chess Game & Move Predictor Engine

<div align="center">

```
   ██████╗ ██████╗  █████╗ ███╗   ██╗██████╗ ███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗ 
  ██╔════╝ ██╔══██╗██╔══██╗████╗  ██║██╔══██╗████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  ██║  ███╗██████╔╝███████║██╔██╗ ██║██║  ██║██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝
  ██║   ██║██╔══██╗██╔══██║██║╚██╗██║██║  ██║██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗
  ╚██████╔╝██║  ██║██║  ██║██║ ╚████║██████╔╝██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║
   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
```

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 240" width="100%" height="240">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d" />
      <stop offset="50%" stop-color="#121829" />
      <stop offset="100%" stop-color="#060911" />
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="cyan" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <rect width="1000" height="240" rx="16" fill="url(#bg)" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.3"/>

  <!-- 3D Isometric Chess Board Illusion -->
  <g transform="translate(140, 20) scale(0.85)">
    <!-- Isometric Grid -->
    <polygon points="120,40 240,100 120,160 0,100" fill="#1e293b" opacity="0.6" stroke="#475569" stroke-width="1"/>
    <polygon points="120,160 240,100 240,115 120,175" fill="#0f172a" />
    <polygon points="120,160 0,100 0,115 120,175" fill="#0b1120" />

    <!-- Isometric Pieces -->
    <circle cx="120" cy="85" r="14" fill="url(#gold)" filter="url(#glow)"/>
    <text x="120" y="91" font-size="20" font-family="serif" text-anchor="middle" fill="#000" font-weight="bold">♔</text>
    
    <circle cx="65" cy="115" r="11" fill="url(#cyan)" filter="url(#glow)"/>
    <text x="65" y="120" font-size="16" font-family="serif" text-anchor="middle" fill="#fff" font-weight="bold">♞</text>

    <circle cx="175" cy="115" r="11" fill="url(#cyan)" filter="url(#glow)"/>
    <text x="175" y="120" font-size="16" font-family="serif" text-anchor="middle" fill="#fff" font-weight="bold">♜</text>
  </g>

  <!-- Typography -->
  <text x="440" y="85" font-family="'Cinzel', 'Times New Roman', serif" font-size="34" font-weight="800" fill="#ffffff" letter-spacing="3">GRANDMASTER-AI</text>
  <text x="440" y="122" font-family="'Inter', sans-serif" font-size="16" font-weight="500" fill="#38bdf8">Adversarial Minimax + Alpha-Beta Pruning + Quiescence</text>
  <text x="440" y="152" font-family="'Inter', sans-serif" font-size="13" fill="#94a3b8">Interactive WebGL 3D Platform & Tactical Move Explainer</text>

  <!-- Badges in SVG -->
  <rect x="440" y="180" width="95" height="26" rx="6" fill="#1e293b" stroke="#10b981" stroke-width="1"/>
  <text x="487" y="197" font-family="monospace" font-size="11" font-weight="700" fill="#10b981" text-anchor="middle">α-β PRUNING</text>

  <rect x="545" y="180" width="105" height="26" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1"/>
  <text x="597" y="197" font-family="monospace" font-size="11" font-weight="700" fill="#38bdf8" text-anchor="middle">PeSTO TABLES</text>

  <rect x="660" y="180" width="100" height="26" rx="6" fill="#1e293b" stroke="#fbbf24" stroke-width="1"/>
  <text x="710" y="197" font-family="monospace" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">THREE.JS 3D</text>

  <rect x="770" y="180" width="115" height="26" rx="6" fill="#1e293b" stroke="#a855f7" stroke-width="1"/>
  <text x="827" y="197" font-family="monospace" font-size="11" font-weight="700" fill="#a855f7" text-anchor="middle">ZOBRIST HASH</text>
</svg>

<p align="center">
  <b>Production-grade college capstone project delivering an adversarial Chess AI engine and a luxury 3D WebGL gaming platform.</b>
</p>

[![Python](https://img.shields.io/badge/Python-3.13%2B-blue.svg?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![Three.js](https://img.shields.io/badge/Three.js-r128-black.svg?logo=three.js)](https://threejs.org)
[![Tests](https://img.shields.io/badge/Tests-16%20Passed-10b981.svg)](https://pytest.org)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 🌟 Key Highlights & Engineering Features

### 1. Adversarial Search Engine (`backend/engine/search.py`)
- **Minimax with Alpha-Beta Pruning**: Reduces effective branching factor from $b \approx 35$ towards $b \approx \sqrt{35} \approx 6$.
- **Quiescence Search with Delta Pruning**: Eliminates the *horizon effect* by dynamically extending tactical capture chains until quiet positions are reached.
- **Transposition Tables (Polyglot Zobrist Hashing)**: High-performance $O(1)$ state lookup caching evaluations, flags (`EXACT`, `LOWERBOUND`, `UPPERBOUND`), and optimal hash moves across transpositions.
- **Tournament Move Ordering**:
  - **TT Hash Move**: Priority $+200,000$.
  - **MVV-LVA (Most Valuable Victim - Least Valuable Attacker)**: Priority $+100,000 + (10 \times \text{Victim} - \text{Attacker})$.
  - **Killer Move Heuristic**: Priority $+80,000$ (stores non-capture moves that caused beta cutoffs at the same ply).
  - **History Heuristic**: Dynamic cutoff frequency weighting.

### 2. Multi-Factor Board Evaluator (`backend/engine/evaluator.py`)
- **PeSTO Tapered Piece-Square Tables**: Separate positional matrices for Middlegame (MG) and Endgame (EG) smoothly interpolated by non-linear game phase:
  $$\text{Score} = \frac{\text{MG} \cdot \text{phase} + \text{EG} \cdot (24 - \text{phase})}{24}$$
- **Pawn Structure Evaluation**: Penalizes doubled and isolated pawns; exponentially rewards passed pawns advancing toward the 8th rank.
- **King Safety**: Castled pawn shield evaluation dynamically scaled with enemy proximity and attacking pieces.
- **Center Control**: Dominance scoring for $\{d4, e4, d5, e5\}$ and extended quadrant squares.

### 3. AI Move Predictor & Tactical Explainer (`backend/engine/predictor.py`)
- **Ranked Candidate Moves**: Top 3-5 moves evaluated with centipawn differentials.
- **Win Probability Sigmoid**:
  $$P(\text{win}) = \frac{1}{1 + 10^{-\text{eval} / 400}}$$
- **Tactical Motif Pattern Detection**: Automatically detects **Forks**, **Pins**, **Skewers**, **Discovered Attacks**, **Central Outposts**, and **Open File Invasions**.
- **Move Quality Badges**: Classifies candidate moves as `Brilliant`, `Best`, `Excellent`, `Good`, `Inaccuracy`, `Mistake`, or `Blunder`.
- **64-Square Control Heatmap**: Real-time matrix calculating White vs. Black attacking differentials.

### 4. Interactive 3D WebGL Gaming Experience (`frontend/`)
- **High-Fidelity 3D Staunton Geometries**: Turn-crafted 3D King, Queen, Bishop, Knight, Rook, and Pawn models.
- **Parabolic Jump & Slide Animations**: Smooth cubic bezier curve trajectories when pieces move.
- **Explosive Capture Particles**: Physics-driven fragment bursts upon piece captures.
- **3D Move Predictor Arrow**: Curved golden/emerald neon arrow hovering above the board representing the AI's predicted move.
- **3D Threat Heatmap Overlay**: Colored volumetric pads visualizing board control directly on the tiles.
- **Procedural Web Audio Engine**: Zero-dependency acoustic synthesis for clicks, impacts, check alarms, and victory fanfares.
- **Camera Presets**: 3D Free Orbit, 2D Top-Down Tactical, White POV, Black POV.
- **Themes**: Classic Mahogany, Carrara Marble, Obsidian Cyberpunk, Royal Gold.

### 5. Dual Interfaces:
- **Web App**: Full-screen 3D glassmorphic application served via FastAPI.
- **Terminal CLI Script**: Full Unicode/ANSI playable chess game in the command-line with side-by-side evaluation meter, move predictor box, depth controls, undo, FEN, and PGN export.

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome, Firefox, Edge, Safari)

### Installation
```bash
# 1. Clone repository
git clone https://github.com/<your-username>/Ai-chess-game.git
cd "Ai chess game"

# 2. Install dependencies
python -m pip install -r requirements.txt
```

### Launching the 3D Web Application
```bash
# Windows
run_web.bat

# Or direct command:
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser to experience the 3D game.

### Launching the Terminal CLI Game
```bash
# Windows
run_cli.bat

# Or direct command:
python backend/cli_game.py
```

### Running Test Suite
```bash
# Windows
run_tests.bat

# Or direct command:
python -m pytest -v
```

---

## 🏛 Project Architecture

```
Ai chess game/
├── backend/
│   ├── engine/
│   │   ├── __init__.py         # Package exports
│   │   ├── evaluator.py        # PeSTO PST, pawn structure, king safety, game phase
│   │   ├── search.py           # Minimax, Alpha-Beta, Quiescence, Transposition Tables
│   │   └── predictor.py        # Move prediction, motifs, win probability, heatmap
│   ├── cli_game.py             # Rich interactive Unicode terminal game
│   └── server.py               # FastAPI server & static file mounts
├── frontend/
│   ├── index.html              # Modern 3D web application layout
│   ├── css/
│   │   └── style.css           # Luxury glassmorphic styling & animations
│   └── js/
│       ├── audio.js            # Procedural Web Audio API sound generator
│       ├── models.js           # Procedural 3D Staunton piece geometries & materials
│       ├── board3d.js          # Three.js scene, lighting, arcs, particles, heatmap
│       ├── api.js              # Client interface for FastAPI REST endpoints
│       └── app.js              # State coordinator & UI event orchestration
├── tests/
│   ├── test_engine.py          # Search, evaluation, and predictor unit tests
│   └── test_api.py             # FastAPI REST endpoints integration tests
├── requirements.txt            # Python dependencies
├── run_web.bat                 # One-click 3D web launcher
├── run_cli.bat                 # One-click terminal CLI launcher
├── run_tests.bat               # One-click test suite executor
├── LICENSE                     # MIT License
└── README.md                   # Architectural documentation
```

---

## 🔬 Mathematical Formulations

### Tapered Phase Evaluation
$$\text{Phase}(S) = \min\left(24, \sum_{p \in \{\text{Minor}\}} 1 + \sum_{r \in \{\text{Rook}\}} 2 + \sum_{q \in \{\text{Queen}\}} 4\right)$$
$$\text{Eval}(S) = \frac{\text{MG}(S) \cdot \text{Phase}(S) + \text{EG}(S) \cdot (24 - \text{Phase}(S))}{24}$$

### Alpha-Beta Pruning Cutoff Condition
$$\alpha = \max(\alpha, \text{Score}), \quad \beta = \min(\beta, \text{Score})$$
$$\text{If } \beta \le \alpha \implies \text{Branch Pruned (Cutoff)}$$

### Win Probability Sigmoid
$$P(\text{Win}) = \frac{1}{1 + 10^{-\text{Eval}_{\text{cp}} / 400}}$$

---

## 📜 License
Distributed under the **MIT License**. See `LICENSE` for details.
