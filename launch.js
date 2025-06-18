const puppeteer = require('puppeteer');

let page = null;
let lastNeovimContent = null;

// Function to update editor content
async function updateEditor(base64Content) {
    if (!page) return;
    
    try {
        lastNeovimContent = base64Content; // Store base64 content coming from Neovim
        const content = Buffer.from(base64Content, 'base64').toString('utf8');
        await page.evaluate((text) => {
            const editor = document.querySelector('.cm-content');
            if (editor) {
                // Clear existing content and set new content
                editor.textContent = '';
                const lines = text.split('\n');
                lines.forEach(line => {
                    const div = document.createElement('div');
                    div.textContent = line;
                    editor.appendChild(div);
                });
                
                // Trigger input event to ensure Strudel processes the changes
                // editor.dispatchEvent(new InputEvent('input', {
                //     bubbles: true,
                //     cancelable: true,
                // }));
            }
        }, content);
    } catch (error) {
        console.error('Error updating editor:', error);
    }
}

// Handle input from stdin (from Neovim)
process.stdin.on('data', async (data) => {
    const base64Content = data.toString().trim();
    await updateEditor(base64Content);
});

(async () => {
    try {
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--app=https://strudel.cc/', '--start-maximized'] 
        });

        // Wait for the page to be ready
        const pages = await browser.pages();
        page = pages[0];
        await page.waitForSelector('.cm-content', { timeout: 10000 }); // Wait for editor to be ready

        // Set up mutation observer for the editor
        await page.evaluate(() => {
            const editor = document.querySelector('.cm-content');
            if (editor) {
                const observer = new MutationObserver(() => {
                    // Get the current content
                    const content = Array.from(editor.children)
                        .map(child => child.textContent)
                        .join('\n');
                    
                    // Encode content as base64 and send via console
                    const base64Content = btoa(unescape(encodeURIComponent(content)));
                    console.log('STRUDEL_CONTENT:' + base64Content);
                });

                // Observe changes in the editor
                observer.observe(editor, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });
            }
        });

        // Handle console messages from the page
        page.on('console', async (msg) => {
            const text = msg.text();
            if (text.startsWith('STRUDEL_CONTENT:')) {
                const base64Content = text.slice('STRUDEL_CONTENT:'.length);
                // Only send if base64 content is different from what Neovim sent
                if (base64Content !== lastNeovimContent) {
                    process.stdout.write('STRUDEL_CONTENT:' + base64Content + '\n');
                }
            }
        });
        
        // Signal that we're ready to receive content
        process.stdout.write("STRUDEL_READY\n");
        
        // Keep the browser open
        process.on('SIGINT', async () => {
            await browser.close();
            process.exit();
        });
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
})(); 