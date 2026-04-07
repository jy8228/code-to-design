import type { Page } from 'playwright';

/**
 * Inline all external stylesheets into <style> tags and remove <script> tags.
 *
 * This makes the captured HTML self-contained so it can be displayed
 * outside the dev server context. Shared by both the main render pipeline
 * and the interaction capturer.
 */
export async function inlineStylesAndCleanup(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(link => {
      try {
        const href = link.getAttribute('href');
        if (!href) return;
        for (const sheet of document.styleSheets) {
          if (sheet.href && sheet.href.includes(href.replace(/^\\//, ''))) {
            const rules = Array.from(sheet.cssRules).map(r => r.cssText).join('\\n');
            const style = document.createElement('style');
            style.textContent = rules;
            link.parentNode.replaceChild(style, link);
            break;
          }
        }
      } catch (e) {}
    });
    document.querySelectorAll('script').forEach(s => s.remove());
  })()`);
}
