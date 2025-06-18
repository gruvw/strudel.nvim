const puppeteer = require("puppeteer");
const path = require("path");
const os = require("os");

const STRUDEL_URL = "https://strudel.cc/";
const MESSAGES = {
    CONTENT: "STRUDEL_CONTENT:",
    STOP: "STRUDEL_STOP",
    PLAY_STOP: "STRUDEL_PLAY_STOP",
    UPDATE: "STRUDEL_UPDATE",
    READY: "STRUDEL_READY"
};

const SELECTORS = {
    EDITOR: ".cm-content",
    PLAY_BUTTON: "header button:nth-child(1)",
    UPDATE_BUTTON: "header button:nth-child(2)"
};

const EVENTS = {
    CONTENT_CHANGED: "strudel-content-changed"
};

// Additional styles
const MENU_PANEL_MAX_STYLE = `
    nav:not(:has(> button:first-child)) {
        position: absolute;
        z-index: 99;
        height: 100%;
        width: 100vw;
        max-width: 100vw;
        background: linear-gradient(var(--lineHighlight), var(--lineHighlight)), var(--background);
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
const CUSTOM_CSS_ARG = "--custom-css-b64=";
let customCss = null;
for (const arg of process.argv) {
    if (arg.startsWith(USER_DATA_DIR_ARG)) {
        userDataDir = arg.replace(USER_DATA_DIR_ARG, "");
    }
    if (arg === "--no-maximise-menu-panel") {
        maximiseMenuPanel = false;
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

const clickButton = async (selector) => {
    if (!page) return;
    await page.evaluate((sel) => {
        const button = document.querySelector(sel);
        if (button) button.click();
    }, selector);
};

async function updateEditorContent(content) {
    if (!page) return;

    try {
        await page.evaluate((text, editorSelector) => {
            const editor = document.querySelector(editorSelector);
            if (editor) {
                editor.textContent = "";
                const lines = text.split("\n");
                lines.forEach(line => {
                    const div = document.createElement("div");
                    div.textContent = line;
                    editor.appendChild(div);
                });
            }
        }, content, SELECTORS.EDITOR);
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
        await clickButton(SELECTORS.PLAY_BUTTON);
    } else if (message === MESSAGES.UPDATE) {
        await clickButton(SELECTORS.UPDATE_BUTTON);
    } else if (message.startsWith(MESSAGES.CONTENT)) {
        const base64Content = message.slice(MESSAGES.CONTENT.length);
        if (base64Content === lastContent) return;

        lastContent = base64Content;

        const content = Buffer.from(base64Content, "base64").toString("utf8");
        await updateEditorContent(content);
    }
});

// Initialize browser and set up event handlers
(async () => {
    try {
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            userDataDir: userDataDir,
            args: [`--app=${STRUDEL_URL}`],
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
        if (maximiseMenuPanel) {
            await page.addStyleTag({ content: MENU_PANEL_MAX_STYLE });
        }
        if (customCss) {
            await page.addStyleTag({ content: customCss });
        }

        // Handle content sync
        await page.exposeFunction("sendEditorContent", async () => {
            const content = await page.evaluate((sel) => {
                const editor = document.querySelector(sel);
                if (editor) {
                    return Array.from(editor.children)
                        .map(child => child.textContent)
                        .join("\n");
                }
                return "";
            }, SELECTORS.EDITOR);

            const base64Content = Buffer.from(content).toString("base64");

            if (base64Content !== lastContent) {
                lastContent = base64Content;

                process.stdout.write(MESSAGES.CONTENT + base64Content + "\n");
            }
        });

        await page.evaluate((editorSelector, eventName) => {
            const editor = document.querySelector(editorSelector);

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

        // Signal that browser is ready
        process.stdout.write(MESSAGES.READY + "\n");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
})();
