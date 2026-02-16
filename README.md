# Kritiq

> **Kritiq** is a workspace‑aware AI code review, security audit, and creation system for Visual Studio Code.
>
> It behaves like a calm, opinionated senior engineer: reviewing code transparently, fixing only what is broken, and never acting as a black box.

---
## Link :-[Kritiq AI](https://marketplace.visualstudio.com/items?itemName=AvinashSingh.kritiq)

---
## Zero‑Friction Workflow (Right‑Click → Review)

No chat windows. No copy‑paste. No context switching.

1. Right‑click any **file or folder** in the VS Code Explorer
2. Select **“Kritiq: Auto‑Fix & Review Code”**
3. Choose a mode
4. Review AI changes via **diff preview**
5. Apply, discard, or edit manually

Everything happens **inside your editor**.

---

## Modes (Specialized AI Agents)

Kritiq is not one model doing everything. It uses **specialized agents**, each with strict responsibilities.

### 🐞 Bug Fix & Cleanup (KRITIQ)

* Fixes syntax errors, runtime crashes, typos
* Removes dead/debug code
* Makes **minimal, traceable changes only**
* Never refactors for style

### 🛡️ Security Audit (SENTINEL)

* Detects and patches:

  * SQL / command injection
  * XSS vulnerabilities
  * `eval`, unsafe execution
  * Hardcoded secrets
* Replaces secrets with `process.env.*`
* Does **not** touch logic or formatting unless required

### ✨ Creator Mode (KRITIQ ARCHITECT)

* Builds **entire features or projects** from scratch
* Can create folders, files, and install dependencies
* Uses real system tools (`mkdir`, `npm install`, file writes)
* Designed for **empty or near‑empty folders**

---

## How to Use

1. Open a project folder in VS Code
2. Run the command:

   * Right‑click → **Kritiq: Auto‑Fix & Review Code**
3. On first run, enter your **Google Gemini API Key**

   * Stored securely using VS Code Secrets API
4. Select a mode (Cleanup / Security / Creator)
5. Review each file via diff preview

Progress is visible via:

* Notification bar
* Output panel: **“Kritiq AI Manager”**

---

## Transparent by Design (No Black Box)

Every AI change is marked **inline**:

```js
// KRITIQ FIX: reason for the change
// SECURITY PATCH: reason for the patch
```

This guarantees:

* You always know **what changed**
* You always know **why it changed**
* You can delete or adjust fixes manually

---

## Diff‑First Review (Trust Before Write)

Kritiq **never silently edits your files**.

For every meaningful change:

* Original vs AI‑modified diff is shown
* You choose:

  * ✅ Apply changes
  * ❌ Discard
  * 📝 Edit manually

This makes Kritiq safe even in production codebases.

---

## Smart File Filtering (Token‑Efficient)

Kritiq scans intelligently and **never sends your entire repo blindly**.

Automatically ignored:

* `node_modules`, `dist`, `build`, `.git`, `.vscode`
* `.env`, `.env.local`, secrets
* Lock files, generated files, minified files
* Test and spec files

Result: **massive token savings** and faster reviews.

---

## Safety & Engineering Guarantees

Kritiq is intentionally defensive.

### Built‑In Protections

* 🔒 Concurrency lock (prevents double execution)
* 🧠 File count caps for demos
* ⏭️ Huge file skip (>50k chars)
* ⛔ Secret protection by default
* ⏱️ Timeout protection on AI calls
* 🔁 Undo‑safe edits via VS Code APIs

If anything fails, Kritiq stops safely and reports clearly.

---

## Logs & Observability

Kritiq provides **live, timestamped logs**:

* Files scanned
* Files skipped
* Agent invoked
* Changes detected
* Errors and fallbacks

This makes demos, debugging, and trust effortless.

---

## How Kritiq Thinks (High‑Level)

1. Select target (file or folder)
2. Filter unsafe / irrelevant files
3. Choose specialized agent
4. Apply strict AI contract
5. Preview diffs
6. Apply changes only with consent

Kritiq never trades safety for cleverness.

---

## Who Kritiq Is For

* 🧑‍🎓 Beginners → Learn from precise inline fixes
* 👨‍💻 Professionals → Catch bugs before PRs
* 🏆 Hackathons → Fast, safe, impressive demos
* 🧠 Senior engineers → Deterministic, controllable AI

---

## Known Limitations (By Design)

* Not a replacement for human reviews
* Does not refactor entire architectures
* Creator Mode assumes **clear, standard intent**
* Limited to supported languages in v2

---

## Roadmap

* CI / PR integration
* Dependency‑aware refactors
* Security‑only quick scan
* Local LLM support
* Review‑only (no‑write) global mode

---

## Philosophy

> **Kritiq is not a chatbot.**
> It is a reviewer, an auditor, and a builder — with strict rules.

It values:

* Safety over magic
* Transparency over hype
* Trust over automation

---

## License

MIT — Hackathon and startup friendly

---

**Built for developers who care about correctness, not shortcuts.**
