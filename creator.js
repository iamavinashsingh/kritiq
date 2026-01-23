/* creator.js - Autonomous Coding Agent */
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
// Fixed: Added AIMessage to imports to prevent type confusion
const { HumanMessage, SystemMessage, ToolMessage, AIMessage } = require("@langchain/core/messages");

const asyncExecute = promisify(exec);

// --- TOOLS DEFINITION ---
const tools = [
    {
        name: "executeCommand",
        description: "Execute a terminal command. Use for 'mkdir', 'npm install', etc.",
        schema: {
            type: "object",
            properties: {
                command: { type: "string", description: "The terminal command to execute." }
            },
            required: ["command"]
        }
    },
    {
        name: "writeFile",
        description: "Writes code to a file.",
        schema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Relative path (e.g., style.css)" },
                content: { type: "string", description: "The full content/code." }
            },
            required: ["path", "content"]
        }
    },
    {
        name: "readFile",
        description: "Reads a file to verify content.",
        schema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Relative path to read." }
            },
            required: ["path"]
        }
    }
];

// --- MAIN EXECUTION FUNCTION ---
async function execute(model, currentCode, fileName, userInstruction) {
    // We bind tools to the model instance passed from extension.js
    const modelWithTools = model.bindTools(tools);
    const workspaceRoot = vscode.workspace.workspaceFolders 
        ? vscode.workspace.workspaceFolders[0].uri.fsPath 
        : path.dirname(fileName);

    const outputChannel = vscode.window.createOutputChannel("Kritiq Creator Agent");
    outputChannel.show(true);

    const log = (msg) => outputChannel.appendLine(`[Agent]: ${msg}`);
    log(`Agent Activated for: "${userInstruction}"`);

    // Initial History
    // @ts-ignore - Ignores the "ToolMessage" type warning in JS files
    const messages = [
        new SystemMessage(`
            <SYSTEM_CORE>
            YOU ARE "KRITIQ ARCHITECT", A PRINCIPAL AUTONOMOUS AGENT.
            YOUR MISSION: EXECUTE COMPLEX DEVELOPMENT TASKS INSIDE A VS CODE ENVIRONMENT.
            YOUR OPERATING MODE: AUTONOMOUS, DETERMINISTIC, & PRODUCTION-GRADE.

            CURRENT CONTEXT:
            - WORKSPACE ROOT: ${workspaceRoot}
            - ACTIVE FILE: ${fileName}
            - USER GOAL: "${userInstruction}"
            </SYSTEM_CORE>

            <TOOL_USAGE_PROTOCOL>
            YOU HAVE ACCESS TO REAL SYSTEM TOOLS. USE THEM STRATEGICALLY.

            1. [executeCommand]: 
               - USE FOR: System operations (mkdir, npm install, git init, npx create-...).
               - RESTRICTION: DO NOT run blocking/infinite processes (e.g., 'npm start', 'nodemon', 'node server.js'). The system will hang.
               - SAFETY: DO NOT use destructive commands (rm -rf) unless absolutely necessary for the goal.

            2. [writeFile]: 
               - USE FOR: Creating or overwriting source code (HTML, CSS, JS, JSON, MD).
               - REQUIREMENT: Always write the FULL content. NO placeholders (e.g., "// ...rest of code").
               - REQUIREMENT: Ensure the target directory exists (via 'mkdir') before writing a file to a deep path.

            3. [readFile]: 
               - USE FOR: Context gathering. Read existing config files (package.json) or verify your own writes.
            </TOOL_USAGE_PROTOCOL>

            <EXECUTION_STRATEGY>
            STEP 1: ARCHITECTURAL PLAN
            - Analyze the "User Goal" deeply.
            - Determine the file structure (e.g., "I need an index.html, a /css folder, and a script.js").
            
            STEP 2: SYSTEM SCAFFOLDING
            - Create necessary directories first using 'executeCommand' (e.g., "mkdir src", "mkdir public").
            - If dependencies are required (e.g., React, Express), run 'npm init -y' and 'npm install ...'.

            STEP 3: IMPLEMENTATION (THE CODE)
            - Write the code for each file using 'writeFile'.
            - PRIORITY: Functionality > Robustness > Style.
            - Ensure code is modern (ES6+), clean, and error-handled.

            STEP 4: FINAL VERIFICATION
            - (Optional) Use 'readFile' to check if a critical file exists.
            </EXECUTION_STRATEGY>

            <OUTPUT_CONTRACT>
            - INTERMEDIATE: Use tool calls to perform actions.
            - FINAL: When finished, your final text response MUST be a concise summary of what you built.
            - FORMAT: "Task Complete. Created [folder/file structure]. Installed [dependencies]."
            </OUTPUT_CONTRACT>
        `),
        new HumanMessage(`Here is the current content of ${fileName} (if any):\n\n${currentCode}\n\nStart working on the goal.`)
    ];

    let finalResponse = currentCode; // Default to original if no changes to current file

    // --- AGENT LOOP (Max 10 steps to prevent infinite loops) ---
    for (let i = 0; i < 10; i++) {
        const response = await modelWithTools.invoke(messages);
        
        // @ts-ignore
        messages.push(response);

        // 1. If AI wants to stop or just talk
        if (!response.tool_calls || response.tool_calls.length === 0) {
            log("Agent finished thinking.");
            // If the AI outputted code for the CURRENT file in text, we capture it
            // Simple heuristic: if the response contains code blocks, return that as the new code
            if (response.content && response.content.includes("```")) {
                finalResponse = cleanCodeFences(response.content);
            }
            break;
        }

        // 2. Execute Tools
        for (const toolCall of response.tool_calls) {
            const toolName = toolCall.name;
            const args = toolCall.args;
            let toolResult = "";

            log(`Executing: ${toolName}`);

            try {
                if (toolName === "executeCommand") {
                    // Safety: Run inside workspace
                    log(`> ${args.command}`);
                    const { stdout, stderr } = await asyncExecute(args.command, { cwd: workspaceRoot });
                    toolResult = stderr ? `Error: ${stderr}` : `Success: ${stdout}`;
                } 
                else if (toolName === "writeFile") {
                    const fullPath = path.join(workspaceRoot, args.path);
                    
                    // Ensure directory exists
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                    fs.writeFileSync(fullPath, args.content, 'utf8');
                    toolResult = `Success: File written to ${args.path}`;
                    log(`Created/Updated: ${args.path}`);

                    // If we updated the MAIN file being reviewed, update our return value
                    if (fullPath.endsWith(fileName)) {
                        finalResponse = args.content;
                    }
                } 
                else if (toolName === "readFile") {
                    const fullPath = path.join(workspaceRoot, args.path);
                    if (fs.existsSync(fullPath)) {
                        toolResult = fs.readFileSync(fullPath, 'utf8');
                        log(`Read file: ${args.path}`);
                    } else {
                        toolResult = "Error: File not found.";
                    }
                }
            } catch (err) {
                toolResult = `Error executing tool: ${err.message}`;
                log(`Tool Error: ${err.message}`);
            }

            // 3. Feed result back to AI
            // @ts-ignore
            messages.push(new ToolMessage({
                tool_call_id: toolCall.id,
                content: toolResult,
                name: toolName
            }));
        }
    }
    
    return finalResponse;
}

function cleanCodeFences(code) {
    return code.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
}

module.exports = { execute };