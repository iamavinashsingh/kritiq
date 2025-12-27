const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
// USING THE STABLE, COMMONJS-FRIENDLY SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- GLOBAL STATE ---
let outputChannel;
let isRunning = false; // Prevents double-clicking (Concurrency Lock)

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

    // Initialize "Matrix" Logs
    outputChannel = vscode.window.createOutputChannel("Kritiq AI Logs");
    log("🚀 Kritiq AI: System Initialized.");

    let disposable = vscode.commands.registerCommand('kritiq.startReview', async function (uri) {
        
        outputChannel.clear();
        outputChannel.show(true);

        // --- SAFETY 1: CONCURRENCY LOCK ---
        if (isRunning) {
            vscode.window.showWarningMessage("⚠️ Kritiq is already running! Please wait.");
            return;
        }

        // --- SAFETY 2: WORKSPACE CHECK ---
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage("Please open a folder/workspace first.");
            return;
        }

        try {
            isRunning = true; // LOCK ENGAGED

            // 1. INPUT VALIDATION
            if (!uri || !uri.fsPath) {
                vscode.window.showErrorMessage('Please right-click on a folder.');
                return;
            }

            const folderPath = uri.fsPath;
            const config = vscode.workspace.getConfiguration('kritiq');
            const apiKey = config.get('apiKey');
            const reviewMode = config.get('reviewMode') || "Standard";

            log(`📂 Target: ${folderPath}`);
            log(`⚙️ Mode: ${reviewMode}`);

            // 2. API KEY CHECK
            if (!apiKey || apiKey.trim() === "") {
                const action = await vscode.window.showErrorMessage(
                    'Gemini API Key missing! Set it in Settings.',
                    'Open Settings'
                );
                if (action === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'kritiq.apiKey');
                }
                return;
            }

            // 3. SMART SCANNING (With Filter)
            vscode.window.setStatusBarMessage("Kritiq: Scanning files...", 2000);
            let files = getAllFiles(folderPath);

            if (files.length === 0) {
                log("⚠️ No supported files found.");
                vscode.window.showWarningMessage("No supported code files found.");
                return;
            }

            // 4. USER CONSENT (Quota Protection)
            if (files.length > 12) {
                const choice = await vscode.window.showQuickPick(
                    [
                        { label: `Review All (${files.length} files)`, description: "May use more quota", value: 'all' },
                        { label: `Review Priority (First 15)`, description: "Faster demo mode", value: 'limit' },
                        { label: "Cancel", value: 'cancel' }
                    ],
                    { placeHolder: `Found ${files.length} files. Proceed?` }
                );

                if (!choice || choice.value === 'cancel') {
                    log("⛔ Operation cancelled by user.");
                    return;
                }
                
                if (choice.value === 'limit') {
                    files = files.slice(0, 15);
                    log("✂️ Priority Mode selected (First 15 files).");
                }
            }

            // --- CONTEXT PREPARATION (Project Map) ---
            const projectStructure = files.map(f => path.basename(f)).join('\n- ');

            // 5. EXECUTION LOOP
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Kritiq AI: Analyzing...",
                cancellable: true
            }, async (progress, token) => {
                
                // Initialize Standard SDK
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

                let stats = { fixed: 0, skipped: 0, errors: 0 };

                for (let i = 0; i < files.length; i++) {
                    // Check Cancellation
                    if (token.isCancellationRequested) {
                        log("🛑 User cancelled operation.");
                        break;
                    }

                    const filePath = files[i];
                    const fileName = path.basename(filePath);
                    
                    progress.report({ 
                        message: `Checking ${fileName}...`, 
                        increment: (1 / files.length) * 100 
                    });

                    try {
                        // Read File (UTF-8 Safe)
                        const code = fs.readFileSync(filePath, 'utf8');
                        
                        // Safety: Skip empty or huge files
                        if (!code.trim() || code.length > 30000) {
                            log(`⏭️ Skipped ${fileName} (File too large/empty)`);
                            stats.skipped++;
                            continue;
                        }

                        // --- INTELLIGENCE: DYNAMIC CHECKLIST ---
                        const ext = path.extname(fileName).toLowerCase();
                        const checklists = {
                            'web': `
                            1. SECURITY: Remove hardcoded keys/secrets. Fix XSS/Injection risks.
                            2. PERFORMANCE: Remove console.logs. Optimize loops.
                            3. BEST PRACTICE: Fix null/undefined errors. Use const/let properly.
                            4. HTML/CSS: Fix semantic tags, accessibility (ARIA), and vendor prefixes.`,
                            'python': `
                            1. PEP8: Fix naming conventions (snake_case) and indentation.
                            2. SECURITY: Fix SQL injection risks.
                            3. PERFORMANCE: Optimize list comprehensions vs loops.
                            4. LOGIC: Fix TypeErrors and uncaught exceptions.`,
                            'cpp': `
                            1. MEMORY: Fix leaks (delete/free). Check pointer safety.
                            2. PERFORMANCE: Pass large objects by reference.
                            3. SYNTAX: Fix missing semicolons and header guards.`,
                            'java': `
                            1. SAFETY: Fix NullPointerExceptions. Close resources.
                            2. STYLE: Follow CamelCase. Clean imports.`
                        };

                        let selectedChecklist = checklists['web'];
                        let languageName = "JavaScript/Web";

                        if (['.py'].includes(ext)) { selectedChecklist = checklists['python']; languageName = "Python"; }
                        else if (['.cpp', '.c', '.h'].includes(ext)) { selectedChecklist = checklists['cpp']; languageName = "C++"; }
                        else if (['.java'].includes(ext)) { selectedChecklist = checklists['java']; languageName = "Java"; }

                        // --- THE PROMPT ---
                        const prompt = `
                        ROLE: Senior ${languageName} Expert.
                        TASK: Review the code below and Apply Fixes based on the checklist.
                        MODE: ${reviewMode}

                        CONTEXT - PROJECT FILES (Do NOT break imports from these):
                        - ${projectStructure}

                        YOUR CHECKLIST:
                        ${selectedChecklist}

                        CRITICAL RULES:
                        1. RETURN ONLY CODE. No markdown (no \`\`\`), no text explanation.
                        2. PRESERVE EXPORTS/IMPORTS: Do not break project links.
                        3. VISIBILITY: Add comment "// KRITIQ FIX: <reason>" for every change.
                        4. IF NO ISSUES: Return the exact original code.

                        CODE TO FIX (${fileName}):
                        ${code}
                        `;

                        // --- TIMEOUT PROTECTION (15s) ---
                        // Prevents editor freeze if API hangs
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error("TIMEOUT_90S")), 90000)
                        );

                        const apiCall = model.generateContent(prompt);
                        const result = await Promise.race([apiCall, timeoutPromise]);
                        const response = await result.response;
                        let fixedCode = response.text();

                        // Clean Output (Markdown Strip)
                        fixedCode = fixedCode.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '').trim();

                        if (fixedCode && fixedCode !== code) {
                            await applyFileEdit(filePath, fixedCode);
                            stats.fixed++;
                            log(`✏️ FIXED: ${fileName}`);
                        } else {
                            stats.skipped++;
                            log(`✨ CLEAN: ${fileName}`);
                        }

                    } catch (err) {
                        stats.errors++;
                        if (err.message === "TIMEOUT_15S") {
                            log(`⏳ TIMEOUT: ${fileName} took too long.`);
                        } else {
                            log(`💥 ERROR ${fileName}: ${err.message}`);
                        }
                        
                        // Critical Stop on Quota Limit
                        if (err.message.includes('429')) {
								vscode.window.showErrorMessage("Gemini Quota Exceeded. Stopping early.");
								break;
                        }
                    }
                }
                
                vscode.window.showInformationMessage(`Review Complete! 🎯 Fixed: ${stats.fixed} | Clean: ${stats.skipped} | Errors: ${stats.errors}`);
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Fatal Error: ${error.message}`);
        } finally {
            isRunning = false; // UNLOCK
        }
    });

    context.subscriptions.push(disposable);
}

// ------------------------------------------
// HELPER FUNCTIONS
// ------------------------------------------

function log(message) {
    if (outputChannel) {
        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
}

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.py', '.cpp', '.java', '.c', '.h'];
    
    // STRICT BLOCKLIST (Never Touch)
    const blockedFiles = [
        'package.json', 'package-lock.json', 'yarn.lock', 
        '.env', '.env.local', 'README.md', 'LICENSE', 
        '.gitignore', 'tsconfig.json', 'jsconfig.json'
    ];
    
    const ignoredSuffixes = ['.min.js', '.test.js', '.spec.js', '.d.ts', '.map'];
    
    // Ignored Folders (System)
    const ignoredFolders = ['node_modules', 'dist', 'build', '.git', '.vscode', 'coverage', 'public', 'assets', 'bin', 'obj', 'venv', '__pycache__'];

    files.forEach(function(file) {
        const fullPath = path.join(dirPath, file);
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (!ignoredFolders.includes(file)) {
                    arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
                }
            } else {
                const ext = path.extname(file);
                const isBlocked = blockedFiles.includes(file);
                const isIgnored = ignoredSuffixes.some(s => file.endsWith(s));

                if (allowedExtensions.includes(ext) && !isBlocked && !isIgnored) {
                    arrayOfFiles.push(fullPath);
                }
            }
        } catch (e) {
            // Skip unreadable
        }
    });

    return arrayOfFiles;
}

// SAFE EDIT (Allows Undo)
async function applyFileEdit(filePath, newContent) {
    const uri = vscode.Uri.file(filePath);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(Number.MAX_VALUE, Number.MAX_VALUE)
    );
    edit.replace(uri, fullRange, newContent);
    await vscode.workspace.applyEdit(edit);
    
    const doc = await vscode.workspace.openTextDocument(uri);
    await doc.save();
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};