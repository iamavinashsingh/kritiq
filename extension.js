const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

let outputChannel;
let isRunning = false;

function activate(context) {
  // 1. Initialize Matrix Logs
  outputChannel = vscode.window.createOutputChannel("Kritiq AI Logs");
  log("🚀 Kritiq AI: System Initialized & Ready.");

  let disposable = vscode.commands.registerCommand(
    "kritiq.startReview",
    async function (uri) {
      outputChannel.clear();
      outputChannel.show(true);

      // --- SAFETY: CONCURRENCY LOCK ---
      if (isRunning) {
        vscode.window.showWarningMessage(
          "⚠️ Kritiq is already running! Please wait."
        );
        return;
      }

      if (!uri || !uri.fsPath) {
        vscode.window.showErrorMessage("Please right-click on a folder.");
        return;
      }

      try {
        isRunning = true;
        const folderPath = uri.fsPath;
        const config = vscode.workspace.getConfiguration("kritiq");
        const apiKey = config.get("apiKey");

        if (!apiKey) {
          const action = await vscode.window.showErrorMessage(
            "Gemini API Key missing! Set it in Settings.",
            "Open Settings"
          );
          if (action === "Open Settings") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "kritiq.apiKey"
            );
          }
          return;
        }

        // 2. SMART SCANNING (Enhanced Blocklist from Version B)
        log(`📂 Scanning folder: ${folderPath}`);
        let files = getAllFiles(folderPath);

        if (files.length === 0) {
          vscode.window.showWarningMessage("No supported code files found.");
          log("⚠️ No supported code files found.");
          return;
        }

        // 3. IMPRESSIVE LOGGING (List files first)
        log("---------------------------------------------------");
        log(`📋 Found ${files.length} files to review:`);
        files.forEach((f, index) => {
          log(`${index + 1}. ${path.basename(f)}`);
        });
        log("---------------------------------------------------");

        // Safety: Hard Cap at 15 files (Version A simplicity)
        if (files.length > 15) {
          log(
            `⚠️ Large project detected. Limiting to top 15 files for safety.`
          );
          files = files.slice(0, 15);
        }

        const projectStructure = files
          .map((f) => path.basename(f))
          .join("\n- ");

        // --- STATS TRACKING (From Version B) ---
        let stats = { fixed: 0, clean: 0, errors: 0 };

        // 4. START PROCESSING
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Kritiq: Senior Review in progress...",
            cancellable: true,
          },
          async (progress, token) => {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
              model: "gemini-2.5-flash",
            });

            for (const filePath of files) {
              // Check Cancel
              if (token.isCancellationRequested) {
                log("🛑 Operation cancelled by user.");
                break;
              }

              const fileName = path.basename(filePath);
              progress.report({ message: `Reviewing ${fileName}...` });

              try {
                const code = fs.readFileSync(filePath, "utf8");

                // Skip empty or huge files
                if (!code.trim() || code.length > 40000) {
                  log(`⏭️ Skipped ${fileName} (Empty or Too Large)`);
                  stats.clean++;
                  continue;
                }

                // --- THE GOLDEN PROMPT (Version A - Senior Engineer) ---
                const prompt = `
                        SYSTEM ROLE:
                        You are KRITIQ, a senior-level code editor and reviewer embedded inside a developer’s IDE.
                        You are NOT a chatbot. You are a deterministic reviewer whose output is written directly to files.
                        Your priority order is: SAFETY > CORRECTNESS > MINIMAL CHANGE > CLARITY.

                        TASK:
                        Review and fix bugs in the provided source file: ${fileName}

                        You are operating under STRICT engineering constraints.

                        ────────────────────────────────────────
                        CRITICAL OUTPUT CONTRACT (NON-NEGOTIABLE)
                        ────────────────────────────────────────
                        1. OUTPUT ONLY VALID SOURCE CODE.
                           - Do NOT use markdown.
                           - Do NOT include explanations outside code.
                           - Do NOT wrap output in \`\`\` blocks.
                           - Any extra text will BREAK the program.

                        2. RETURN THE FULL FILE CONTENT.
                           - Do NOT omit lines.
                           - Do NOT summarize.
                           - Do NOT use placeholders like “…rest of code”.

                        3. IF NO ISSUES ARE FOUND:
                           - Return the ORIGINAL CODE verbatim, byte-for-byte.

                        ────────────────────────────────────────
                        CHANGE RULES (TRUST & TRANSPARENCY)
                        ────────────────────────────────────────
                        4. MAKE ONLY NECESSARY CHANGES.
                           - Do NOT refactor for style.
                           - Do NOT reformat.
                           - Do NOT rename symbols unless they are clearly broken or misspelled.

                        5. EVERY CHANGE MUST BE TRACEABLE.
                           - On the SAME LINE where a fix is applied, add:
                             // KRITIQ FIX: <short reason>
                           - For HTML/CSS use appropriate comment syntax (or /* KRITIQ FIX: ... */).
                           - Do NOT add file-level or summary comments.

                        6. PRESERVE PUBLIC CONTRACTS.
                           - Do NOT change exported functions, classes, or APIs.

                        ────────────────────────────────────────
                        WHAT TO FIX (FOCUSED SCOPE)
                        ────────────────────────────────────────
                        ONLY fix the following categories:

                        • Syntax errors (missing brackets, invalid tokens)
                        • Clear typos (e.g., backgroud → background)
                        • Runtime errors (null/undefined access, type errors)
                        • Security risks (eval, unsafe input handling, hardcoded secrets)
                        • Deprecated or invalid constructs (e.g., <center>)
                        • Broken logic that causes incorrect behavior
                        ────────────────────────────────────────
                        CONDITIONAL END-TO-END COMPLETION (STRICTLY GUARDED)
                        ────────────────────────────────────────
                        You may complete an implementation END-TO-END across related HTML, CSS, and JavaScript files
                        ONLY IF ALL of the following conditions are true:

                        1. The files together clearly represent a single feature or mini-application
                        (e.g., Calculator, LeetCode-style problem runner, Swiggy/Amazon UI clone).

                        2. The intent of the feature is obvious from the code structure, naming, and UI elements.

                        3. The implementation is clearly incomplete, broken, or non-functional
                        (e.g., missing event handlers, incomplete logic, disconnected UI).

                        4. The expected behavior is standard and unambiguous to any frontend developer.
                        5. UI/CSS HANDLING:
                        - If UI/CSS is complete and intentional, do NOT modify it.
                        - If partially implemented, complete it following the existing design direction.
                        - If missing or severely broken, you may create minimal, clean, user-friendly UI.

                        6. UI SAFETY:
                        - Do NOT redesign, rebrand, or add visual flair.
                        - Do NOT change structure, classes, or IDs unless clearly broken.

                        7. TRACEABILITY:
                        - Every UI/CSS change MUST include a KRITIQ FIX comment.


                        WHEN these conditions are met:
                        • You MAY complete missing logic so the feature works correctly.
                        • You MUST preserve existing structure, layout, and naming.
                        • You MUST NOT introduce new features beyond the obvious intent.
                        • You MUST add "KRITIQ FIX" comments on EVERY modified or newly added line.

                        IF ANY condition above is NOT met:
                        → DO NOT attempt end-to-end completion.
                        → Fall back to minimal bug fixing only.
                        → If uncertain, return the original code unchanged.


                        ────────────────────────────────────────
                        PROJECT CONTEXT (READ-ONLY)
                        ────────────────────────────────────────
                        The following files exist in the same project.
                        ${projectStructure}

                        ────────────────────────────────────────
                        SOURCE CODE TO REVIEW
                        ────────────────────────────────────────
                        ${code}
                        `;

                // --- 120s TIMEOUT ---
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("TIMEOUT")), 120000)
                );

                const apiCall = model.generateContent(prompt);
                const result = await Promise.race([apiCall, timeoutPromise]);
                const response = await result.response;
                let fixedCode = response.text();

                // Cleanup (Markdown Strip)
                fixedCode = fixedCode
                  .replace(/^```[a-z]*\n/i, "")
                  .replace(/\n```$/, "")
                  .trim();

                // Validation
                if (fixedCode && fixedCode.length > 10 && fixedCode !== code) {
                  await applyFileEdit(filePath, fixedCode);
                  log(`✅ FIXED: ${fileName}`);
                  stats.fixed++;
                } else {
                  log(`✨ CLEAN: ${fileName}`);
                  stats.clean++;
                }
              } catch (err) {
                stats.errors++;

                // --- QUOTA PROTECTION (From Version B) ---
                if (err.message.includes("429")) {
                  log(`⛔ GEMINI QUOTA EXCEEDED. Stopping.`);
                  vscode.window.showErrorMessage(
                    "Gemini API Quota Exceeded. Stopping review."
                  );
                  break; // Stop loop immediately
                }

                log(`❌ ERROR ${fileName}: ${err.message}`);
              }
            }

            // --- FINAL SUMMARY (From Version B) ---
            vscode.window.showInformationMessage(
              `Review Complete! 🎯 Fixed: ${stats.fixed} | Clean: ${stats.clean} | Skipped/Err: ${stats.errors}`
            );
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
        log(`💥 CRITICAL ERROR: ${error.message}`);
      } finally {
        isRunning = false; // UNLOCK
      }
    }
  );

  context.subscriptions.push(disposable);
}

function log(message) {
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
  }
}

// --- ENHANCED FILE FILTER (From Version B) ---
function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  // Supported Languages
  const allowed = [
    ".js",
    ".jsx",
    ".ts",
    ".html",
    ".css",
    ".py",
    ".java",
    ".c",
    ".cpp",
  ];

  // Strict Blocklist (Files to NEVER touch)
  const blockedFiles = [
    "package.json",
    "package-lock.json",
    "yarn.lock",
    ".env",
    ".env.local",
    "README.md",
    "LICENSE",
    ".gitignore",
    "tsconfig.json",
  ];

  // Ignored Suffixes
  const ignoredSuffixes = [".min.js", ".test.js", ".spec.js", ".d.ts", ".map"];

  // Blocked Folders
  const blockedFolders = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".vscode",
    "coverage",
    "bin",
    "obj",
    "venv",
    "__pycache__",
  ];

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!blockedFolders.includes(file)) getAllFiles(fullPath, arrayOfFiles);
      } else {
        const ext = path.extname(file);
        const isBlocked = blockedFiles.includes(file);
        const isIgnored = ignoredSuffixes.some((s) => file.endsWith(s));

        if (allowed.includes(ext) && !isBlocked && !isIgnored) {
          arrayOfFiles.push(fullPath);
        }
      }
    } catch (e) {}
  });
  return arrayOfFiles;
}

async function applyFileEdit(filePath, newContent) {
  const uri = vscode.Uri.file(filePath);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE);
  edit.replace(uri, fullRange, newContent);
  await vscode.workspace.applyEdit(edit);
  const doc = await vscode.workspace.openTextDocument(uri);
  await doc.save();
}

function deactivate() {}

module.exports = { activate, deactivate };
