/* extension.js - The Controller */
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");

// --- IMPORT AGENTS ---
const cleanupAgent = require("./cleanup");
const securityAgent = require("./security");
const creatorAgent = require("./creator");

let outputChannel;

function activate(context) {
    // Initialize Output Channel
    outputChannel = vscode.window.createOutputChannel("Kritiq AI Manager");
    log("Kritiq AI: Waiting for commands...");

    let disposable = vscode.commands.registerCommand("kritiq.startReview", async (uri) => {
        outputChannel.clear();
        outputChannel.show(true);

        // 1. SECURE API KEY (Immediate Check)
        const apiKey = await getSecureApiKey(context);
        if (!apiKey) {
            log("⚠️API Key missing.");
            return;
        }

        // 2. TARGET SELECTION
        // If triggered from command palette (no uri), default to workspace root
        if (!uri && vscode.workspace.workspaceFolders) {
            uri = vscode.workspace.workspaceFolders[0].uri;
        } 
        
        if (!uri) {
            vscode.window.showErrorMessage("Please open a file or folder first.");
            return;
        }
        
        const targetPath = uri.fsPath;
        log(`📂 Target selected: ${targetPath}`);

        // 3. MODE SELECTION
        const mode = await vscode.window.showQuickPick(
            [
                { label: "🐞 Bug Fix & Cleanup", id: "cleanup", detail: "Fix bugs, format code, and remove logs." },
                { label: "🛡️ Security Audit", id: "security", detail: "Find vulnerabilities and patch them." },
                { label: "✨ Creator Mode", id: "creator", detail: "Generate full features from scratch." }
            ],
            { placeHolder: "Select Kritiq Agent", ignoreFocusOut: true }
        );

        if (!mode) {
             log("🛑 Operation cancelled by user.");
             return;
        }

        // 4. INIT LANGCHAIN (Shared Instance)
        const model = new ChatGoogleGenerativeAI({
            // @ts-ignore
            modelName: "gemini-2.5-flash",
            apiKey: apiKey,
            temperature: 0.2, // Low temp for precision
        });

        // 5. FILE GATHERING (Smart Filter from Team Avi)
        let files = getTargetFiles(targetPath);
        if (files.length === 0) {
            vscode.window.showWarningMessage("No supported files found.");
            return;
        }
        
        // Safety cap for hackathon demo
        if (files.length > 10) {
            log(`⚠️ Large project. Limiting to first 10 files.`);
            files = files.slice(0, 10);
        }

        log(`📋 Processing ${files.length} file(s) with mode: ${mode.label}`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Kritiq: Running ${mode.label}...`,
            cancellable: true
        }, async (progress, token) => {
            
            for (const filePath of files) {
                if (token.isCancellationRequested) break;

                const fileName = path.basename(filePath);
                progress.report({ message: `Analyzing ${fileName}...` });
                log(`🔍 Analyzing: ${fileName}`);

                try {
                    const originalCode = fs.readFileSync(filePath, "utf8");
                    
                    // Skip empty files unless in Creator Mode
                    if (mode.id !== 'creator' && (!originalCode.trim() || originalCode.length > 50000)) {
                         log(`⏭️ Skipped (Empty/Too Large): ${fileName}`);
                         continue;
                    }

                    let newCode = "";

                    // 6. DELEGATE TO SPECIALIZED AGENTS
                    if (mode.id === "cleanup") {
                        newCode = await cleanupAgent.execute(model, originalCode, fileName);
                    } else if (mode.id === "security") {
                        newCode = await securityAgent.execute(model, originalCode, fileName);
                    } else if (mode.id === "creator") {
                        // Creator needs user input
                        const instruction = await vscode.window.showInputBox({
                            prompt: `What should I build in ${fileName}?`,
                            placeHolder: "e.g., A login form with validation"
                        });
                        if (!instruction) continue; // Skip if no instruction
                        newCode = await creatorAgent.execute(model, originalCode, fileName, instruction);
                    }

                    // 7. THE "WINNING" DIFF VIEW
                    if (newCode && newCode !== originalCode) {
                        const applied = await showDiffPreview(filePath, originalCode, newCode, fileName);
                        if (applied) {
                             log(`Changes applied to ${fileName}`);
                        } else {
                             log(`Changes discarded for ${fileName}`);
                        }
                    } else {
                        log(`No critical issues found in ${fileName}`);
                    }

                } catch (err) {
                    vscode.window.showErrorMessage(`Agent Failure: ${err.message}`);
                    log(`❌ Error in ${fileName}: ${err.message}`);
                }
            }
        });
        
        log("Operation Complete...");
    });

    context.subscriptions.push(disposable);
}

// --- UTILITIES ---

async function getSecureApiKey(context) {
    let key = await context.secrets.get("KRITIQ_GEMINI_KEY");
    if (!key) {
        key = await vscode.window.showInputBox({
            prompt: "Enter Google Gemini API Key",
            placeHolder: "Starts with AIza...",
            password: true,
            ignoreFocusOut: true
        });
        if (key) {
            await context.secrets.store("KRITIQ_GEMINI_KEY", key);
            vscode.window.showInformationMessage("Key saved securely!");
        }
    }
    return key;
}

// The "Smart Filter" Logic (Kept from Team Avi)
function getTargetFiles(targetPath) {
    let files = [];
    try {
        const stats = fs.statSync(targetPath);
        if (stats.isFile()) return [targetPath];
        if (stats.isDirectory()) return getAllFilesRecursive(targetPath);
    } catch (e) {
        log(`Error reading path: ${e.message}`);
    }
    return files;
}

function getAllFilesRecursive(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    const blockedFolders = ["node_modules", ".git", "dist", "build", "out", ".vscode", "coverage", "__pycache__"];
    const blockedFiles = ["package-lock.json", ".env", "yarn.lock", "package.json"];
    const allowedExts = [".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".html", ".css", ".c", ".cpp"];

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            if (!blockedFolders.includes(file)) getAllFilesRecursive(filePath, fileList);
        } else {
            if (allowedExts.includes(path.extname(file)) && !blockedFiles.includes(file)) {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}

async function showDiffPreview(filePath, original, modified, fileName) {
    // Create temp file for diff comparison
    const tempUri = vscode.Uri.parse(`untitled:${fileName}.preview`);
    const doc = await vscode.workspace.openTextDocument(tempUri);
    const edit = new vscode.WorkspaceEdit();
    
    // Replace temp content with AI modifications
    const fullRange = new vscode.Range(0, 0, doc.lineCount + 1, 0); // Ensure full range cover
    edit.replace(tempUri, fullRange, modified);
    await vscode.workspace.applyEdit(edit);

    // Show Diff Editor
    await vscode.commands.executeCommand("vscode.diff", vscode.Uri.file(filePath), tempUri, `Kritiq Review: ${fileName}`);

    // Ask User for Action
    const choice = await vscode.window.showQuickPick(["Apply Changes", "Discard"], { 
        placeHolder: `Accept AI changes for ${fileName}?`,
        ignoreFocusOut: true 
    });
    
    // Close Diff Editor (Best Effort)
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

    if (choice === "Apply Changes") {
        fs.writeFileSync(filePath, modified, 'utf8');
        vscode.window.showInformationMessage(`Updated ${fileName}`);
        return true;
    }
    return false;
}

function log(msg) { 
    if (outputChannel) {
        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`); 
    }
}

function deactivate() {}
module.exports = { activate, deactivate };