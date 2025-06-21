const puppeteer = require("puppeteer");
const path = require("path");
const os = require("os");

const STRUDEL_URL = "https://strudel.cc/";

const MESSAGES = {
    CONTENT: "STRUDEL_CONTENT:",
    QUIT: "STRUDEL_QUIT",
    TOGGLE: "STRUDEL_TOGGLE",
    UPDATE: "STRUDEL_UPDATE",
    STOP: "STRUDEL_STOP",
    REFRESH: "STRUDEL_REFRESH",
    READY: "STRUDEL_READY",
    CURSOR: "STRUDEL_CURSOR:",
    EVAL_ERROR: "STRUDEL_EVAL_ERROR:",
};

const SELECTORS = {
    EDITOR: ".cm-content"
};
const EVENTS = {
    CONTENT_CHANGED: "strudel-content-changed"
};
const STYLES = {
    HIDE_EDITOR_SCROLLBAR: `
        .cm-scroller {
            scrollbar-width: none;
        }
    `,
    HIDE_TOP_BAR: `
        header {
            display: none !important;
        }
    `,
    MAX_MENU_PANEL: `
        nav:not(:has(> button:first-child)) {
            position: absolute;
            z-index: 99;
            height: 100%;
            width: 100vw;
            max-width: 100vw;
            background: linear-gradient(var(--lineHighlight), var(--lineHighlight)), var(--background);
        }
    `,
    HIDE_MENU_PANEL: `
        nav {
            display: none !important;
        }
    `,
    HIDE_CODE_EDITOR: `
        .cm-editor {
            display: none !important;
        }
    `,
    HIDE_ERROR_DISPLAY: `
        header + div + div {
            display: none !important;
        }
    `,
    DISABLE_EVAL_BG_FLASH: `
        .cm-line:not(.cm-activeLine):has(> span) {
            background: var(--lineBackground) !important;
            width: fit-content;
        }
        .cm-line.cm-activeLine {
            background: linear-gradient(var(--lineHighlight), var(--lineHighlight)), var(--lineBackground) !important;
        }
        .cm-line > *, .cm-line span[style*="background-color"] {
            background-color: transparent !important;
            filter: none !important;
        }
    `,
};

const CLI_ARGS = {
    HIDE_TOP_BAR: "--hide-top-bar",
    MAXIMISE_MENU_PANEL: "--maximise-menu-panel",
    HIDE_MENU_PANEL: "--hide-menu-panel",
    HIDE_CODE_EDITOR: "--hide-code-editor",
    HIDE_ERROR_DISPLAY: "--hide-error-display",
    CUSTOM_CSS_B64: "--custom-css-b64=",
    HEADLESS: "--headless",
    USER_DATA_DIR: "--user-data-dir=",
};

const userConfig = {
    hideTopBar: false,
    maximiseMenuPanel: false,
    hideMenuPanel: false,
    hideCodeEditor: false,
    hideErrorDisplay: false,
    customCss: null,
    isHeadless: false,
    userDataDir: null,
};

// Process program arguments at launch
for (const arg of process.argv) {
    if (arg === CLI_ARGS.HIDE_TOP_BAR) {
        userConfig.hideTopBar = true;
    } else if (arg === CLI_ARGS.MAXIMISE_MENU_PANEL) {
        userConfig.maximiseMenuPanel = true;
    } else if (arg === CLI_ARGS.HIDE_MENU_PANEL) {
        userConfig.hideMenuPanel = true;
    } else if (arg === CLI_ARGS.HIDE_CODE_EDITOR) {
        userConfig.hideCodeEditor = true;
    } else if (arg === CLI_ARGS.HIDE_ERROR_DISPLAY) {
        userConfig.hideErrorDisplay = true;
    } else if (arg.startsWith(CLI_ARGS.CUSTOM_CSS_B64)) {
        const b64 = arg.slice(CLI_ARGS.CUSTOM_CSS_B64.length);
        try {
            userConfig.customCss = Buffer.from(b64, "base64").toString("utf8");
        } catch (e) {
            console.error("Failed to decode custom CSS:", e);
        }
    } else if (arg === CLI_ARGS.HEADLESS) {
        userConfig.isHeadless = true;
    } else if (arg.startsWith(CLI_ARGS.USER_DATA_DIR)) {
        userConfig.userDataDir = arg.replace(CLI_ARGS.USER_DATA_DIR, "");
    }
}
if (!userConfig.userDataDir) {
    userConfig.userDataDir = path.join(os.homedir(), ".cache", "strudel-nvim");
}

// State
let page = null;
let lastContent = null;
let browser = null;

// Event queue for sequential message processing
const eventQueue = [];
let isProcessingEvent = false;

async function updateEditorContent(content) {
    if (!page) return;

    try {
        await page.evaluate((newContent) => {
            // Can't simply set the whole content because it breaks inline annimations
            // https://codeberg.org/uzu/strudel/issues/1393
            const view = window.strudelMirror.editor;
            const oldContent = view.state.doc.toString();

            // Find the first position where the content differs
            let start = 0;
            while (
                start < oldContent.length &&
                start < newContent.length &&
                oldContent[start] === newContent[start]
            ) {
                start++;
            }

            // Find the last position where the content differs
            let endOld = oldContent.length - 1;
            let endNew = newContent.length - 1;
            while (
                endOld >= start &&
                endNew >= start &&
                oldContent[endOld] === newContent[endNew]
            ) {
                endOld--;
                endNew--;
            }

            // If there is a change, apply it
            if (start <= endOld || start <= endNew) {
                view.dispatch({
                    changes: {
                        from: start,
                        to: endOld + 1,
                        insert: newContent.slice(start, endNew + 1)
                    }
                });
            }

            // Emulate interaction for audio playback
            window.strudelMirror.root.click();
        }, content);
    } catch (error) {
        console.error("Error updating editor:", error);
    }
}

async function moveEditorCursor(position) {
    await page.evaluate((pos) => {
        // Clamp pos to valid range in the editor
        const docLength = window.strudelMirror.editor.state.doc.length;
        if (pos < 0) pos = 0;
        if (pos > docLength) pos = docLength;
        window.strudelMirror.setCursorLocation(pos);
        window.strudelMirror.editor.dispatch({ scrollIntoView: true });
    }, position);
}

// Handle messages from Neovim
process.stdin.on("data", (data) => {
    const message = data.toString().trim();
    eventQueue.push(message);
    processEventQueue();
});

async function processEventQueue() {
    if (isProcessingEvent) return;
    isProcessingEvent = true;

    while (eventQueue.length > 0) {
        const message = eventQueue.shift();
        try {
            await handleEvent(message);
        } catch (err) {
            console.error("Error processing event:", err);
        }
    }

    isProcessingEvent = false;
}

async function handleEvent(message) {
    if (message === MESSAGES.QUIT) {
        if (browser) {
            await browser.close();
            process.exit(0);
        }
    } else if (message === MESSAGES.TOGGLE) {
        await page.evaluate(() => {
            window.strudelMirror.toggle();
        });
    } else if (message === MESSAGES.UPDATE) {
        await page.evaluate(() => {
            window.strudelMirror.evaluate();
        });
    } else if (message === MESSAGES.REFRESH) {
        await page.evaluate(() => {
            if (window.strudelMirror.repl.state.started) {
                window.strudelMirror.evaluate();
            }
        });
    } else if (message === MESSAGES.STOP) {
        await page.evaluate(() => {
            window.strudelMirror.stop();
        });
    } else if (message.startsWith(MESSAGES.CONTENT)) {
        const base64Content = message.slice(MESSAGES.CONTENT.length);
        if (base64Content === lastContent) return;

        lastContent = base64Content;

        const content = Buffer.from(base64Content, "base64").toString("utf8");
        await updateEditorContent(content);
    } else if (message.startsWith(MESSAGES.CURSOR)) {
        // TODO: Continue cursor location message implementation
        return;
        // Handle cursor location message
        const cursorStr = message.slice(MESSAGES.CURSOR.length);
        const cursorPos = parseInt(cursorStr, 10);
        await moveEditorCursor(cursorPos);
    }
}

// Initialize browser and set up event handlers
(async () => {
    try {
        browser = await puppeteer.launch({
            headless: userConfig.isHeadless,
            defaultViewport: null,
            userDataDir: userConfig.userDataDir,
            ignoreDefaultArgs: ["--mute-audio"],
            args: [
                `--app=${STRUDEL_URL}`,
                "--autoplay-policy=no-user-gesture-required",
            ],
        });

        // Wait for the page to be ready (found the editor)
        const pages = await browser.pages();
        page = pages[0];
        await page.waitForSelector(SELECTORS.EDITOR, { timeout: 10000 });

        // Listen for browser disconnect or page close
        browser.on("disconnected", () => {
            process.exit(0);
        });
        page.on("close", () => {
            process.exit(0);
        });

        // Register additional styles
        await page.addStyleTag({ content: STYLES.HIDE_EDITOR_SCROLLBAR });
        await page.addStyleTag({ content: STYLES.DISABLE_EVAL_BG_FLASH });

        if (userConfig.maximiseMenuPanel) {
            await page.addStyleTag({ content: STYLES.MAX_MENU_PANEL });
        }
        if (userConfig.hideTopBar) {
            await page.addStyleTag({ content: STYLES.HIDE_TOP_BAR });
        }
        if (userConfig.hideMenuPanel) {
            await page.addStyleTag({ content: STYLES.HIDE_MENU_PANEL });
        }
        if (userConfig.hideCodeEditor) {
            await page.addStyleTag({ content: STYLES.HIDE_CODE_EDITOR });
        }
        if (userConfig.hideErrorDisplay) {
          await page.addStyleTag({ content: STYLES.HIDE_ERROR_DISPLAY });
        }
        if (userConfig.customCss) {
            await page.addStyleTag({ content: userConfig.customCss });
        }

        // Handle content sync
        await page.exposeFunction("sendEditorContent", async () => {
            const content = await page.evaluate(() => {
                return window.strudelMirror.code;
            });

            const base64Content = Buffer.from(content).toString("base64");

            if (base64Content !== lastContent && !isProcessingEvent) {
                lastContent = base64Content;

                process.stdout.write(MESSAGES.CONTENT + base64Content + "\n");
            }
        });
        if (!userConfig.isHeadless) {
            await page.evaluate((editorSelector, eventName) => {
                const editor = document.querySelector(editorSelector);

                // Listen for content changes
                const observer = new MutationObserver(() => {
                    editor.dispatchEvent(new CustomEvent(eventName));
                });
                observer.observe(editor, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });

                editor.addEventListener(eventName, window.sendEditorContent);
            }, SELECTORS.EDITOR, EVENTS.CONTENT_CHANGED);
        }

        // Handle eval errors reporting
        await page.exposeFunction("notifyEvalError", (evalErrorMessage) => {
            if (evalErrorMessage) {
                const b64 = Buffer.from(evalErrorMessage).toString("base64");
                process.stdout.write(MESSAGES.EVAL_ERROR + b64 + "\n");
            }
        });
        await page.evaluate(() => {
            let lastError = null;
            setInterval(() => {
                try {
                    const currentError = window.strudelMirror.repl.state.evalError.message;
                    if (currentError !== lastError) {
                        lastError = currentError;
                        window.notifyEvalError(currentError);
                    }
                } catch (e) {
                    // Ignore errors (e.g., page not ready)
                }
            }, 300);
        });

        // Signal that browser is ready
        process.stdout.write(MESSAGES.READY + "\n");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
})();
