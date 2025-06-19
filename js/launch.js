const puppeteer = require("puppeteer");
const path = require("path");
const os = require("os");

const STRUDEL_URL = "https://strudel.cc/";

const MESSAGES = {
    CONTENT: "STRUDEL_CONTENT:",
    STOP: "STRUDEL_STOP",
    PLAY_STOP: "STRUDEL_PLAY_STOP",
    UPDATE: "STRUDEL_UPDATE",
    READY: "STRUDEL_READY",
    CURSOR: "STRUDEL_CURSOR:",
};

const SELECTORS = {
    EDITOR: ".cm-content"
};
const EVENTS = {
    CONTENT_CHANGED: "strudel-content-changed"
};

// Additional styles
const MAX_MENU_PANEL_STYLES = `
nav:not(:has(> button:first-child)) {
    position: absolute;
    z-index: 99;
    height: 100%;
    width: 100vw;
    max-width: 100vw;
    background: linear-gradient(var(--lineHighlight), var(--lineHighlight)), var(--background);
}
`;
const HIDE_TOP_BAR_STYLES = `
header {
    display: none !important;
}
`;
const HIDE_MENU_PANEL_STYLES = `
nav {
    display: none !important;
}
`;
const HIDE_CODE_EDITOR_STYLES = `
.cm-editor {
    display: none !important;
}
`;
const HIDE_EDITOR_SCROLLBAR_STYLES = `
.cm-scroller {
    scrollbar-width: none;
}
`;

// State
let page = null;
let lastContent = null;
let browser = null;

// User configuration
const USER_DATA_DIR_ARG = "--user-data-dir=";
let userDataDir = null;
let maximiseMenuPanel = true;
let hideTopBar = true;
let hideMenuPanel = false;
let hideCodeEditor = false;
let isHeadless = false;
const CUSTOM_CSS_ARG = "--custom-css-b64=";
let customCss = null;
for (const arg of process.argv) {
    if (arg.startsWith(USER_DATA_DIR_ARG)) {
        userDataDir = arg.replace(USER_DATA_DIR_ARG, "");
    }
    if (arg === "--no-maximise-menu-panel") {
        maximiseMenuPanel = false;
    }
    if (arg === "--no-hide-top-bar") {
        hideTopBar = false;
    }
    if (arg === "--hide-menu-panel") {
        hideMenuPanel = true;
    }
    if (arg === "--hide-code-editor") {
        hideCodeEditor = true;
    }
    if (arg === "--headless") {
        isHeadless = true;
    }
    if (arg.startsWith(CUSTOM_CSS_ARG)) {
        const b64 = arg.slice(CUSTOM_CSS_ARG.length);
        try {
            customCss = Buffer.from(b64, "base64").toString("utf8");
        } catch (e) {
            console.error("Failed to decode custom CSS:", e);
        }
    }
}
if (!userDataDir) {
    userDataDir = path.join(os.homedir(), ".cache", "strudel-nvim");
}

async function updateEditorContent(content) {
    if (!page) return;

    try {
        await page.evaluate(async (content) => {
            window.strudelMirror.editor.contentDOM.textContent = content;
            window.strudelMirror.root.click();
        }, content);
    } catch (error) {
        console.error("Error updating editor:", error);
    }
}

// Handle messages from Neovim
process.stdin.on("data", async (data) => {
    const message = data.toString().trim();

    if (message === MESSAGES.STOP) {
        if (browser) {
            await browser.close();
            process.exit(0);
        }
    } else if (message === MESSAGES.PLAY_STOP) {
        await page.evaluate(() => {
            window.strudelMirror.toggle();
        });
    } else if (message === MESSAGES.UPDATE) {
        await page.evaluate(() => {
            window.strudelMirror.evaluate();
        });
    } else if (message.startsWith(MESSAGES.CONTENT)) {
        const base64Content = message.slice(MESSAGES.CONTENT.length);
        if (base64Content === lastContent) return;

        lastContent = base64Content;

        const content = Buffer.from(base64Content, "base64").toString("utf8");
        await updateEditorContent(content);
    } else if (message.startsWith(MESSAGES.CURSOR)) {
        return;
        // Handle cursor location message
        const cursorStr = message.slice(MESSAGES.CURSOR.length);
        const cursorPos = parseInt(cursorStr, 10);
        await page.evaluate((pos) => {
            // Clamp pos to valid range in the editor
            const docLength = window.strudelMirror.editor.state.doc.length;
            if (pos < 0) pos = 0;
            if (pos > docLength) pos = docLength;
            window.strudelMirror.setCursorLocation(pos);
            window.strudelMirror.editor.dispatch({ scrollIntoView: true });
        }, cursorPos);
    }
});

// Initialize browser and set up event handlers
(async () => {
    try {
        browser = await puppeteer.launch({
            headless: isHeadless,
            defaultViewport: null,
            userDataDir: userDataDir,
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
        await page.addStyleTag({ content: HIDE_EDITOR_SCROLLBAR_STYLES });
        if (maximiseMenuPanel) {
            await page.addStyleTag({ content: MAX_MENU_PANEL_STYLES });
        }
        if (hideTopBar) {
            await page.addStyleTag({ content: HIDE_TOP_BAR_STYLES });
        }
        if (hideMenuPanel) {
            await page.addStyleTag({ content: HIDE_MENU_PANEL_STYLES });
        }
        if (hideCodeEditor) {
            await page.addStyleTag({ content: HIDE_CODE_EDITOR_STYLES });
        }
        if (customCss) {
            await page.addStyleTag({ content: customCss });
        }

        // Handle content sync
        await page.exposeFunction("sendEditorContent", async () => {
            const content = await page.evaluate(() => {
                return window.strudelMirror.code;
            });

            const base64Content = Buffer.from(content).toString("base64");

            if (base64Content !== lastContent) {
                lastContent = base64Content;

                process.stdout.write(MESSAGES.CONTENT + base64Content + "\n");
            }
        });

        if (!isHeadless) {
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

        // Signal that browser is ready
        process.stdout.write(MESSAGES.READY + "\n");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
})();
