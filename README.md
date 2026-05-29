# ⚡ Voltorb Flip Solver

A Pokémon Crystal–themed GBA-style puzzle solver for the Voltorb Flip mini-game from Pokémon HeartGold / SoulSilver.

Built with React + Vite. Deploys automatically to GitHub Pages.

---

## 🚀 Deploy in 5 steps

### 1 · Create the GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `voltorb-flip` (must match the `base` in `vite.config.js`)
3. Leave it **public**, don't initialise with any files
4. Click **Create repository**

### 2 · Enable GitHub Pages

1. In your new repo, go to **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Save

### 3 · Push the code

```bash
# Inside this project folder
git init
git add .
git commit -m "Initial commit — Voltorb Flip Solver"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/voltorb-flip.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### 4 · Watch it deploy

- Go to your repo → **Actions** tab
- You'll see a **Deploy to GitHub Pages** workflow running
- It takes ~60 seconds to build and deploy

### 5 · Share the link 🎉

Your site will be live at:
```
https://YOUR_USERNAME.github.io/voltorb-flip/
```

---

## 🛠 Local development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 📁 Project structure

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

## 🔧 Custom domain (optional)

If you have a domain like `mysite.com`:

1. In `vite.config.js`, change `base: '/voltorb-flip/'` → `base: '/'`
2. In **Settings → Pages → Custom domain**, enter your domain
3. Add a `CNAME` DNS record pointing to `YOUR_USERNAME.github.io`

---

## How it works

The solver uses **constraint propagation + backtracking**:
1. Each cell starts with possible values `{0, 1, 2, 3}` (0 = Voltorb)
2. Row/column hints prune the possibility space by filtering combinations
3. This repeats until no more deductions can be made
4. If still ambiguous, it guesses the most-constrained cell and backtracks

---

*Inspired by the Voltorb Flip mini-game in Pokémon HeartGold/SoulSilver.*
