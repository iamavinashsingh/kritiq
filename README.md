# Kritiq

> **Kritiq** is an AI-powered code review and auto-fix agent for Visual Studio Code. It reviews entire folders, understands project context, and applies transparent, reversible fixes directly inside your editor — like a calm senior engineer reviewing your codebase.

---
### Right-Click → Review (Zero Context Switching)

No chat windows. No copy-paste.

Just:

1. Right-click any folder in the VS Code Explorer
2. Select **“Kritiq: Auto-Fix & Review Code”**
3. Watch Kritiq analyze and fix files in place

---
## How to Use

1. Open a project folder in VS Code
2. Set your Gemini API key:

   * Settings → `Kritiq AI` → `API Key`
3. Right-click a folder
4. Select **Kritiq: Auto-Fix & Review Code**
5. Watch progress in:

   * Notification bar
   * Output panel: **“Kritiq AI Logs”**

---

## Why Kritiq Exists

Modern developers lose focus constantly:

* Copy code → paste into ChatGPT → read response → paste back → hope nothing broke.
* Large projects waste AI tokens by sending irrelevant files.
* AI tools feel like black boxes that silently change code.

**Kritiq fixes this by bringing a workspace-aware AI reviewer directly into VS Code**, with strong safety rails, transparency, and undo support.

---

## What Kritiq Does (At a Glance)

* Reviews **entire folders**, not just open files
* Understands **project context** (multiple files, imports)
* Applies **safe, reversible fixes**
* Marks every change clearly
* Protects your API quota
* Never touches secrets or config files

Think of Kritiq as:

> *“A second pair of senior eyes before you ship.”*

---

## Key Features

### 1. Workspace-Level Code Review

Kritiq scans all supported code files inside a selected folder and reviews them one by one using AI — with awareness of other project files.

Supported languages (v1):

* JavaScript / TypeScript
* HTML / CSS
* Python
* C / C++
* Java

---



### 2. Smart File Filtering (Token & Cost Efficient)

Kritiq **never sends your entire project blindly**.

It automatically ignores:

* `node_modules`, `dist`, `build`, `.git`, `.vscode`
* `.env`, `.env.local`, secrets
* `package.json`, lock files, config files
* Minified, generated, and test files

Result: **~80% token savings** vs naive AI scripts.

---

### 3. Transparent AI Fixes (No Black Box)

Every AI change is clearly marked:

```js
// KRITIQ FIX: reason for the change
```

You can:

* Review changes instantly
* Understand *why* something changed
* Delete or modify fixes manually

---

### 4. Safe Editing with Full Undo

Kritiq **never overwrites files directly**.

It uses VS Code’s `WorkspaceEdit` API:

* All changes are undoable
* Press `Ctrl + Z` to revert instantly
* No permanent file damage

---



## Safety & Engineering Guarantees

Kritiq is intentionally defensive.

### Built-in Protections

* 🔒 **Concurrency lock** – Prevents double execution
* 🧠 **Large project guard** – Asks consent if too many files
* ⏭️ **Huge file skip** – Ignores files >30k characters
* ⛔ **Secret protection** – `.env` is never read
* ⏱️ **Timeout protection** – Stops hanging AI calls
* 🔁 **Undo-safe edits** – No destructive writes

If something fails, Kritiq **stops safely and reports clearly**.

---

## How to Install (Local Development)

```bash
npm install
```

Press **F5** to launch a Development Host of VS Code.

---



## Output & Logs

Kritiq provides **Matrix-style live logs**:

* Files being scanned
* Files skipped
* Fixes applied
* Errors or timeouts

This makes demos and debugging extremely clear.

---

## How Kritiq Thinks (High-Level)

1. Scan folder
2. Filter files
3. Build project context
4. Review file safely
5. Apply minimal fix
6. Log everything

Kritiq never tries to be clever at the cost of safety.

---

## Who Is Kritiq For?

* 🧑‍🎓 Beginners → Learn from commented fixes
* 👨‍💻 Professionals → Catch bugs before PRs
* 🏆 Hackathons → Fast, safe, impressive demos
* 🧠 Senior engineers → Transparent, controllable AI

---

## Known Limitations (Honest)

* Not a replacement for human code reviews
* Does not refactor entire architectures (by design)
* Limited to supported languages in v1

---

## Roadmap Ideas

* Dependency-aware refactors
* Security-only scan mode
* CI / PR integration
* Local LLM support
* Diff-only preview mode

---

## Philosophy

> **Kritiq is not a chatbot.**
> It is a reviewer.

It values:

* Safety over cleverness
* Transparency over magic
* Developer trust over hype

---

## License

MIT (Hackathon-friendly)

---

**Built with care for developers who ship.**
