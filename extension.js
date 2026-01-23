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
let statusBarItem;

function activate(context) {
    // Initialize Output Channel
    outputChannel = vscode.window.createOutputChannel("Kritiq AI Manager");
    log("🚀 Kritiq AI Extension Activated");
    log("📁 Waiting for commands...");

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(beaker) Kritiq";
    statusBarItem.tooltip = "Kritiq AI Code Reviewer";
    statusBarItem.command = "kritiq.startReview";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register the main command
    let disposable = vscode.commands.registerCommand("kritiq.startReview", async (uri) => {
        try {
            await executeReview(uri, context);
        } catch (error) {
            logError(error, "Main Command Handler");
            vscode.window.showErrorMessage(`Kritiq failed: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(outputChannel);
    
    log("✅ Extension successfully registered");
}

async function executeReview(uri, context) {
    outputChannel.clear();
    outputChannel.show(true);
    statusBarItem.text = "$(sync~spin) Kritiq Working";
    
    log("🔍 Starting review process...");

    try {
        // 1. SECURE API KEY (Immediate Check)
        log("🔐 Checking API Key...");
        const apiKey = await getSecureApiKey(context);
        if (!apiKey) {
            log("❌ API Key missing or invalid.");
            statusBarItem.text = "$(beaker) Kritiq";
            vscode.window.showErrorMessage("Please set a valid Gemini API Key to use Kritiq.");
            return;
        }
        log("✅ API Key validated");

        // 2. TARGET SELECTION
        if (!uri && vscode.workspace.workspaceFolders) {
            uri = vscode.workspace.workspaceFolders[0].uri;
            log(`📁 Using workspace root: ${uri.fsPath}`);
        } 
        
        if (!uri) {
            log("❌ No target selected");
            vscode.window.showErrorMessage("Please open a file or folder first.");
            statusBarItem.text = "$(beaker) Kritiq";
            return;
        }
        
        const targetPath = uri.fsPath;
        const isDirectory = fs.statSync(targetPath).isDirectory();
        log(`🎯 Target selected: ${targetPath} (${isDirectory ? 'Directory' : 'File'})`);

        // 3. MODE SELECTION
        log("🤔 Asking user for mode selection...");
        const mode = await vscode.window.showQuickPick(
            [
                { label: "🐞 Bug Fix & Cleanup", id: "cleanup", detail: "Fix bugs, format code, and remove logs." },
                { label: "🛡️ Security Audit", id: "security", detail: "Find vulnerabilities and patch them." },
                { label: "✨ Creator Mode", id: "creator", detail: "Generate full features from scratch." }
            ],
            { 
                placeHolder: "Select Kritiq Agent", 
                ignoreFocusOut: true,
                title: "Select Review Mode"
            }
        );

        if (!mode) {
            log("🛑 Operation cancelled by user.");
            statusBarItem.text = "$(beaker) Kritiq";
            return;
        }

        log(`✅ Mode selected: ${mode.label} (${mode.id})`);

        // Special validation for Creator Mode
        if (mode.id === "creator") {
            if (!isDirectory) {
                log("❌ Creator mode requires a directory, not a file.");
                vscode.window.showErrorMessage("Creator Mode requires a folder. Please select a directory.");
                statusBarItem.text = "$(beaker) Kritiq";
                return;
            }

            // Check if directory is empty (excluding hidden/system files)
            const files = fs.readdirSync(targetPath);
            const nonHiddenFiles = files.filter(file => !file.startsWith('.') && !['node_modules', '.git', '.vscode', '.idea'].includes(file));
            
            if (nonHiddenFiles.length > 0) {
                log(`⚠️ Creator Mode: Directory is not empty (${nonHiddenFiles.length} files found)`);
                const continueChoice = await vscode.window.showWarningMessage(
                    `The folder "${path.basename(targetPath)}" contains ${nonHiddenFiles.length} file(s). Creator Mode works best with empty folders.`,
                    "Continue Anyway",
                    "Cancel"
                );
                
                if (continueChoice !== "Continue Anyway") {
                    log("🛑 Creator mode cancelled by user.");
                    statusBarItem.text = "$(beaker) Kritiq";
                    return;
                }
                log("⚠️ User chose to continue with non-empty folder");
            }
        }

        // 4. INIT LANGCHAIN MODEL
        log("🧠 Initializing AI model...");
        let model;
        try {
            model = new ChatGoogleGenerativeAI({
                apiKey: apiKey,
                model: "gemini-2.5-flash",
                temperature: 0.2, 
            });
            log(`✅ Model initialized: gemini-2.5-flash`);
        } catch (modelError) {
            logError(modelError, "Model Initialization");
            
            // Try fallback model if 2.5-flash fails
            try {
                log("🔄 Trying fallback model: gemini-1.5-flash");
                model = new ChatGoogleGenerativeAI({
                    apiKey: apiKey,
                    model: "gemini-1.5-flash",
                    temperature: 0.2,
                });
                log(`✅ Fallback model initialized: gemini-1.5-flash`);
            } catch (fallbackError) {
                logError(fallbackError, "Fallback Model Initialization");
                vscode.window.showErrorMessage(`Failed to initialize AI model. Please check your API key and ensure you have access to Gemini models. Error: ${modelError.message}`);
                statusBarItem.text = "$(beaker) Kritiq";
                return;
            }
        }

        // 5. FILE GATHERING
        log("📂 Gathering target files...");
        let files = getTargetFiles(targetPath, mode.id);
        
        if (files.length === 0) {
            log("⚠️ No supported files found.");
            vscode.window.showWarningMessage("No supported files found in the selected location.");
            statusBarItem.text = "$(beaker) Kritiq";
            return;
        }
        
        // Safety cap for demo
        if (files.length > 10 && mode.id !== 'creator') {
            log(`⚠️ Large project (${files.length} files). Limiting to first 10.`);
            files = files.slice(0, 10);
        }

        log(`📋 Found ${files.length} file(s) to process`);
        
        // 6. EXECUTE REVIEW
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Kritiq: Running ${mode.label}...`,
            cancellable: true
        }, async (progress, token) => {
            
            log(`🚀 Starting ${mode.id} mode for ${files.length} files`);
            
            for (let i = 0; i < files.length; i++) {
                const filePath = files[i];
                
                if (token.isCancellationRequested) {
                    log("🛑 Operation cancelled by user.");
                    break;
                }

                const fileName = path.basename(filePath);
                const relativePath = path.relative(path.dirname(targetPath), filePath);
                
                progress.report({ 
                    message: `Analyzing ${fileName}...`,
                    increment: (100 / files.length) 
                });
                
                log(`\n📄 Processing file ${i+1}/${files.length}: ${fileName}`);
                log(`📍 Path: ${relativePath}`);

                try {
                    // Read file (if it exists)
                    let originalCode = "";
                    if (fs.existsSync(filePath)) {
                        log(`📖 Reading file content...`);
                        originalCode = fs.readFileSync(filePath, "utf8");
                        log(`📊 File size: ${originalCode.length} characters`);
                    } else {
                        log(`📝 Creating new file: ${fileName}`);
                    }
                    
                    // Skip empty files unless in Creator Mode
                    if (mode.id !== 'creator') {
                        if (!originalCode.trim()) {
                            log(`⏭️ Skipped: Empty file`);
                            continue;
                        }
                        if (originalCode.length > 50000) {
                            log(`⏭️ Skipped: File too large (${originalCode.length} chars)`);
                            continue;
                        }
                    }

                    let newCode = "";
                    log(`🤖 Calling ${mode.id} agent...`);

                    // DELEGATE TO SPECIALIZED AGENTS
                    if (mode.id === "cleanup") {
                        newCode = await cleanupAgent.execute(model, originalCode, fileName);
                        log(`✅ Cleanup agent returned (${newCode?.length || 0} chars)`);
                    } else if (mode.id === "security") {
                        newCode = await securityAgent.execute(model, originalCode, fileName);
                        log(`✅ Security agent returned (${newCode?.length || 0} chars)`);
                    } else if (mode.id === "creator") {
                        // Creator needs user input
                        log("💡 Creator mode - asking for instruction...");
                        const instruction = await vscode.window.showInputBox({
                            prompt: `What should I build in ${path.basename(targetPath)}?`,
                            placeHolder: "e.g., A React todo app with dark mode",
                            ignoreFocusOut: true
                        });
                        
                        if (!instruction || instruction.trim() === "") {
                            log("⏭️ No instruction provided, skipping");
                            break;
                        }
                        
                        log(`📝 Instruction: "${instruction}"`);
                        newCode = await creatorAgent.execute(model, originalCode, filePath, instruction);
                        log(`✅ Creator agent returned (${newCode?.length || 0} chars)`);
                    }

                    // Validate agent response
                    if (!newCode) {
                        log(`⚠️ Agent returned empty result for ${fileName}`);
                        continue;
                    }
                    
                    // Clean the response (remove markdown code fences if present)
                    newCode = newCode.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
                    
                    // For creator mode, handle multiple files differently
                    if (mode.id === 'creator') {
                        // Creator agent might return a summary, not code for each file
                        if (!newCode.includes('\n') && newCode.length < 100) {
                            log(`📋 Creator summary: ${newCode}`);
                            continue;
                        }
                    }
                    
                    if (newCode === originalCode) {
                        log(`✅ No changes needed for ${fileName}`);
                    } else {
                        const diff = Math.abs(newCode.length - originalCode.length);
                        log(`✨ Changes detected: ${diff} character difference`);
                        
                        // Show diff preview (only for existing files with content)
                        if (originalCode && originalCode.trim()) {
                            const applied = await showDiffPreview(filePath, originalCode, newCode, fileName);
                            
                            if (applied) {
                                log(`💾 Changes applied to ${fileName}`);
                                vscode.window.showInformationMessage(`Updated ${fileName}`, "Open File").then(selection => {
                                    if (selection === "Open File") {
                                        vscode.window.showTextDocument(vscode.Uri.file(filePath));
                                    }
                                });
                            } else {
                                log(`🗑️ Changes discarded for ${fileName}`);
                            }
                        } else {
                            // New file or empty file - just save it
                            const saveChoice = await vscode.window.showInformationMessage(
                                `Create new file: ${fileName}?`,
                                "Create File",
                                "Skip"
                            );
                            
                            if (saveChoice === "Create File") {
                                // Ensure directory exists
                                const dir = path.dirname(filePath);
                                if (!fs.existsSync(dir)) {
                                    fs.mkdirSync(dir, { recursive: true });
                                }
                                
                                fs.writeFileSync(filePath, newCode, 'utf8');
                                log(`💾 Created new file: ${fileName}`);
                            } else {
                                log(`🗑️ Skipped creating ${fileName}`);
                            }
                        }
                    }

                } catch (err) {
                    logError(err, `Processing ${fileName}`);
                    vscode.window.showErrorMessage(`Error in ${fileName}: ${err.message}`);
                }
            }
            
            log("\n🎉 Processing complete!");
        });
        
    } catch (error) {
        logError(error, "Execute Review");
        vscode.window.showErrorMessage(`Kritiq operation failed: ${error.message}`);
    } finally {
        statusBarItem.text = "$(beaker) Kritiq";
        log("📊 ====== SESSION COMPLETE ======");
    }
}

// --- UTILITIES ---

async function getSecureApiKey(context) {
    try {
        let key = await context.secrets.get("KRITIQ_GEMINI_KEY");
        
        if (!key) {
            log("🔑 No saved API key found, prompting user...");
            key = await vscode.window.showInputBox({
                prompt: "Enter your Google Gemini API Key",
                placeHolder: "AIzaSy... (Get it from: https://aistudio.google.com/apikey)",
                password: true,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim() === "") {
                        return "API Key cannot be empty";
                    }
                    if (!value.startsWith('AIza')) {
                        return "Invalid format. Gemini keys start with 'AIza'";
                    }
                    if (value.length < 20) {
                        return "API Key seems too short";
                    }
                    return null;
                }
            });
            
            if (key) {
                await context.secrets.store("KRITIQ_GEMINI_KEY", key.trim());
                log("🔐 API Key saved securely");
                vscode.window.showInformationMessage("API Key saved securely!");
            } else {
                log("❌ User cancelled API key input");
                return null;
            }
        } else {
            log("🔑 Using saved API key");
        }
        
        return key;
    } catch (error) {
        logError(error, "API Key Retrieval");
        vscode.window.showErrorMessage(`Failed to get API key: ${error.message}`);
        return null;
    }
}

// Enhanced file gathering with mode-specific logic
function getTargetFiles(targetPath, mode = "cleanup") {
    let files = [];
    try {
        const stats = fs.statSync(targetPath);
        
        if (stats.isFile()) {
            log(`📄 Single file selected: ${targetPath}`);
            
            // For creator mode, we need a directory, not a file
            if (mode === "creator") {
                log("⚠️ Creator mode requires a directory. Using parent directory.");
                const parentDir = path.dirname(targetPath);
                return getTargetFiles(parentDir, mode);
            }
            
            return [targetPath];
        }
        
        if (stats.isDirectory()) {
            log(`📁 Directory selected, scanning for files...`);
            
            // For creator mode, return only the directory itself (no recursive scan)
            if (mode === "creator") {
                // In creator mode, we start with common project files
                const commonFiles = [
                    "index.html",
                    "style.css", 
                    "script.js",
                    "package.json",
                    "README.md"
                ];
                
                return commonFiles.map(file => path.join(targetPath, file));
            }
            
            // For cleanup/security modes, scan recursively
            return getAllFilesRecursive(targetPath);
        }
    } catch (e) {
        logError(e, `Reading path: ${targetPath}`);
    }
    return files;
}

function getAllFilesRecursive(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir);
        const blockedFolders = ["node_modules", ".git", "dist", "build", "out", ".vscode", "coverage", "__pycache__", ".idea", ".kritiq-temp"];
        const blockedFiles = ["package-lock.json", ".env", "yarn.lock"];
        const allowedExts = [".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".html", ".css", ".c", ".cpp", ".json", ".md", ".txt", ".yml", ".yaml", ".xml"];

        files.forEach(file => {
            const filePath = path.join(dir, file);
            
            try {
                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                    if (!blockedFolders.includes(file)) {
                        getAllFilesRecursive(filePath, fileList);
                    }
                } else {
                    const ext = path.extname(file).toLowerCase();
                    if (allowedExts.includes(ext) && !blockedFiles.includes(file)) {
                        fileList.push(filePath);
                    }
                }
            } catch (statError) {
                log(`⚠️ Could not stat ${filePath}: ${statError.message}`);
            }
        });
    } catch (readError) {
        logError(readError, `Reading directory: ${dir}`);
    }
    
    return fileList;
}

async function showDiffPreview(filePath, original, modified, fileName) {
    log(`🔍 Showing diff preview for ${fileName}...`);
    
    try {
        // Create a temp directory in the workspace for preview files
        const workspaceRoot = vscode.workspace.workspaceFolders 
            ? vscode.workspace.workspaceFolders[0].uri.fsPath 
            : path.dirname(filePath);
        
        const tempDir = path.join(workspaceRoot, '.kritiq-temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Create a unique temp file
        const timestamp = Date.now();
        const tempFileName = `${fileName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.preview`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        // Write modified content to temp file
        fs.writeFileSync(tempFilePath, modified, 'utf8');
        log(`📝 Created temp preview file: ${tempFileName}`);
        
        // Show diff between original and temp file
        await vscode.commands.executeCommand("vscode.diff", 
            vscode.Uri.file(filePath), 
            vscode.Uri.file(tempFilePath), 
            `Kritiq Review: ${fileName}`
        );

        // Ask user for action
        log("🤔 Asking user to accept/reject changes...");
        const choice = await vscode.window.showQuickPick(
            [
                { label: "✅ Apply Changes", description: "Accept and save all AI changes" },
                { label: "❌ Discard", description: "Reject all changes" },
                { label: "📝 Edit Manually", description: "Open file to edit manually" }
            ], 
            { 
                placeHolder: `What would you like to do with ${fileName}?`,
                ignoreFocusOut: true,
                title: "Review AI Changes"
            }
        );
        
        // Clean up temp file
        try {
            fs.unlinkSync(tempFilePath);
            log(`🗑️ Cleaned up temp file: ${tempFileName}`);
        } catch (cleanupError) {
            log(`⚠️ Could not delete temp file: ${cleanupError.message}`);
        }
        
        // Try to close the diff editor if it's still open
        try {
            await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        } catch (closeError) {
            // Ignore close errors
            log(`⚠️ Could not close diff editor: ${closeError.message}`);
        }

        if (choice?.label === "✅ Apply Changes") {
            fs.writeFileSync(filePath, modified, 'utf8');
            log(`💾 Changes applied to ${fileName}`);
            return true;
        } else if (choice?.label === "📝 Edit Manually") {
            vscode.window.showTextDocument(vscode.Uri.file(filePath));
            log(`📝 Opening ${fileName} for manual editing`);
        } else {
            log(`🗑️ Changes discarded for ${fileName}`);
        }
        
        return false;
    } catch (error) {
        logError(error, "Diff Preview");
        vscode.window.showErrorMessage(`Failed to show diff: ${error.message}`);
        return false;
    }
}

// Enhanced logging functions
function log(msg) { 
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${msg}`;
    
    if (outputChannel) {
        outputChannel.appendLine(logMessage);
    }
    
    // Also log to console for debugging
    console.log(logMessage);
}

function logError(error, context = "") {
    const timestamp = new Date().toLocaleTimeString();
    const errorMsg = `[ERROR${context ? ` - ${context}` : ''}] ${error.message}`;
    const stackMsg = error.stack ? `\nStack: ${error.stack}` : '';
    
    const fullMessage = `[${timestamp}] ${errorMsg}${stackMsg}`;
    
    if (outputChannel) {
        outputChannel.appendLine(fullMessage);
    }
    
    console.error(fullMessage);
}

function deactivate() {
    log("👋 Kritiq AI Extension Deactivated");
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
}

module.exports = { activate, deactivate };