# ⚡ Voltorb Flip Solver

A Pokémon Crystal–themed GBA-style puzzle solver for the Voltorb Flip mini-game from Pokémon HeartGold / SoulSilver.

Built with React + Vite. Deploys automatically to GitHub Pages here: <https://mecort.github.io/voltorb-flip-solver/>

---

## Project structure

```
voltorb-flip/
├── .github/
│   └── workflows/
│       └── deploy.yml      ← Auto-deploy on push to main
├── src/
│   ├── App.jsx             ← GBA-style solver UI + engine
│   └── main.jsx            ← React entry point
├── index.html
├── vite.config.js          ← Set base: '/your-repo-name/'
├── package.json
└── .gitignore
```

## How it works

The solver uses **constraint propagation + backtracking**:

1. Each cell starts with possible values `{0, 1, 2, 3}` (0 = Voltorb)
2. Row/column hints prune the possibility space by filtering combinations
3. This repeats until no more deductions can be made
4. If still ambiguous, it guesses the most-constrained cell and backtracks

---

*Inspired by the Voltorb Flip mini-game in Pokémon HeartGold/SoulSilver.*

## To Do List

1. Implement feature to take photo and autofill cells
2. Fix mobile formatting issues
3. rework front end UI
