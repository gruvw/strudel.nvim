const puppeteer = require('puppeteer');

let page = null;
let lastContent = null;
let browser = null;

// Function to update editor content
async function updateEditor(base64Content) {
    if (!page) return;

    if (base64Content === lastContent) return;
    lastContent = base64Content;
    
    try {
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
                editor.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                }));
            }
        }, content);
    } catch (error) {
        console.error('Error updating editor:', error);
    }
}

// Handle input from stdin (from Neovim)
process.stdin.on('data', async (data) => {
    const message = data.toString().trim();
    
    if (message === 'STRUDEL_STOP') {
        if (browser) {
            await browser.close();
            process.exit(0);
        }
    } else if (message.startsWith('STRUDEL_CONTENT:')) {
        const base64Content = message.slice('STRUDEL_CONTENT:'.length);
        await updateEditor(base64Content);
    }
});

(async () => {
    try {
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--app=https://strudel.cc/', '--start-maximized'] 
        });

        // Wait for the page to be ready
        const pages = await browser.pages();
        page = pages[0];
        await page.waitForSelector('.cm-content', { timeout: 10000 }); // Wait for editor to be ready

        // Listen for the custom event and handle content sync in Node.js context
        await page.exposeFunction('getEditorContent', async () => {
          const content = await page.evaluate(() => {
              const editor = document.querySelector('.cm-content');
              if (editor) {
                  return Array.from(editor.children)
                      .map(child => child.textContent)
                      .join('\n');
              }
              return '';
          });
          const base64Content = Buffer.from(content).toString('base64');
          if (base64Content !== lastContent) {
            lastContent = base64Content;
            process.stdout.write('STRUDEL_CONTENT:' + base64Content + '\n');
          }
      });

        // Enable DOM mutation monitoring
        await page.evaluate(() => {
            // Just set up a basic mutation observer that triggers a custom event
            const editor = document.querySelector('.cm-content');
            if (editor) {
                const observer = new MutationObserver(() => {
                    editor.dispatchEvent(new CustomEvent('strudel-content-changed'));
                });
                observer.observe(editor, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });
            }
            document.querySelector('.cm-content').addEventListener('strudel-content-changed', window.getEditorContent);
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