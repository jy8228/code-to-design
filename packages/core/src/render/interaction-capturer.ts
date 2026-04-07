import type { Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RouteInfo } from '../discovery/types.js';
import { inlineStylesAndCleanup } from './style-inliner.js';

/**
 * Result of capturing a single interaction variant.
 */
export interface InteractionResult {
  /** Human-readable description, e.g. "Tab: Settings", "Button: Open Modal" */
  elementDescription: string;
  /** Relative path to captured HTML file */
  htmlPath: string;
  /** Whether the interaction capture succeeded */
  success: boolean;
  /** Error message if capture failed */
  error?: string;
}

/**
 * Serializable info about a clickable element found on the page.
 */
interface ClickableElement {
  /** CSS selector path to re-find the element */
  selector: string;
  /** Human-readable description */
  description: string;
}

/**
 * Slugify a URL path for use as a directory name.
 */
function slugifyRoute(urlPath: string): string {
  if (urlPath === '/') return 'index';
  return urlPath
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/:/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Find clickable interactive elements on the current page.
 *
 * Looks for tabs, buttons, and anchor-like elements, excluding
 * already-active, disabled, submit, and external link elements.
 * Uses a string-based evaluate to avoid DOM type issues in Node context.
 */
async function findClickableElements(
  page: Page,
  maxElements: number,
): Promise<ClickableElement[]> {
  return page.evaluate(`((max) => {
    const selectors = [
      '[role="tab"]:not([aria-selected="true"]):not([aria-disabled="true"])',
      '[role="button"]:not([aria-disabled="true"]):not([disabled])',
      'button:not([disabled]):not([type="submit"])',
      '[data-tab]:not(.active):not(.selected)',
      '.tab:not(.active):not(.selected)',
      'a[href="#"]:not(.active)',
      'a[href^="#"]:not([href="#"]):not(.active)',
    ];

    const seen = new Set();
    const results = [];

    for (const sel of selectors) {
      if (results.length >= max) break;
      const elements = document.querySelectorAll(sel);

      for (const el of elements) {
        if (results.length >= max) break;
        if (seen.has(el)) continue;
        seen.add(el);

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        if (el.tagName === 'A') {
          const href = el.getAttribute('href') || '';
          if (href.startsWith('http') || href.startsWith('//')) continue;
        }

        if (el.tagName === 'BUTTON' && el.type === 'submit') continue;

        const text = (el.textContent || '').trim().slice(0, 50);
        const ariaLabel = el.getAttribute('aria-label');
        const role = el.getAttribute('role');
        const tag = el.tagName.toLowerCase();

        let desc = '';
        if (role === 'tab') desc = 'Tab: ' + (ariaLabel || text || 'unnamed');
        else if (role === 'button') desc = 'Button: ' + (ariaLabel || text || 'unnamed');
        else if (tag === 'button') desc = 'Button: ' + (ariaLabel || text || 'unnamed');
        else desc = 'Clickable: ' + (ariaLabel || text || 'unnamed');

        let uniqueSelector = '';
        const id = el.getAttribute('id');
        if (id) {
          uniqueSelector = '#' + CSS.escape(id);
        } else {
          const dataTestId = el.getAttribute('data-testid');
          if (dataTestId) {
            uniqueSelector = '[data-testid="' + CSS.escape(dataTestId) + '"]';
          } else {
            const allMatching = document.querySelectorAll(sel);
            const idx = Array.from(allMatching).indexOf(el);
            uniqueSelector = '__INDEX__' + sel + '__' + idx;
          }
        }

        results.push({ selector: uniqueSelector, description: desc });
      }
    }

    return results;
  })(${maxElements})`) as Promise<ClickableElement[]>;
}

/**
 * Capture interaction variants by clicking interactive elements on a rendered page.
 *
 * This function expects the page to already be rendered and navigated to the target URL.
 * It finds clickable elements, clicks each one, captures the resulting HTML,
 * then reloads the page to reset state before the next interaction.
 *
 * @param page - Already rendered Playwright page
 * @param pageUrl - The full URL to reload between interactions
 * @param route - Route info for file naming
 * @param stateName - State variant name (e.g. "success")
 * @param outputDir - Base output directory
 * @param options - Configuration options
 * @returns Array of interaction results
 */
export async function captureInteractions(
  page: Page,
  pageUrl: string,
  route: RouteInfo,
  stateName: string,
  outputDir: string,
  options?: { maxInteractions?: number; settleTime?: number },
): Promise<InteractionResult[]> {
  const maxInteractions = options?.maxInteractions ?? 5;
  const settleTime = options?.settleTime ?? 500;
  const routeSlug = slugifyRoute(route.urlPath);
  const stateDir = join(outputDir, 'renders', routeSlug);
  await mkdir(stateDir, { recursive: true });

  // Find clickable elements
  const clickables = await findClickableElements(page, maxInteractions);
  if (clickables.length === 0) return [];

  const results: InteractionResult[] = [];

  for (let i = 0; i < clickables.length; i++) {
    const clickable = clickables[i];
    const htmlRelPath = join('renders', routeSlug, `${stateName}_interaction_${i}.html`);
    const htmlAbsPath = join(outputDir, htmlRelPath);

    try {
      // Re-find and click the element
      let clicked = false;

      if (clickable.selector.startsWith('__INDEX__')) {
        // Parse the fallback selector format: __INDEX__{selector}__{index}
        const parts = clickable.selector.slice('__INDEX__'.length);
        const lastUnderscoreIdx = parts.lastIndexOf('__');
        const sel = parts.slice(0, lastUnderscoreIdx);
        const idx = parseInt(parts.slice(lastUnderscoreIdx + 2), 10);

        const elements = await page.$$(sel);
        if (elements[idx]) {
          await elements[idx].click();
          clicked = true;
        }
      } else {
        const element = await page.$(clickable.selector);
        if (element) {
          await element.click();
          clicked = true;
        }
      }

      if (!clicked) {
        results.push({
          elementDescription: clickable.description,
          htmlPath: htmlRelPath,
          success: false,
          error: 'Element not found on re-query',
        });
        continue;
      }

      // Wait for state change
      await page.waitForTimeout(settleTime);

      // Inline styles and clean up (same as main render pipeline)
      await inlineStylesAndCleanup(page);

      // Capture HTML
      const html = await page.content();
      await writeFile(htmlAbsPath, html, 'utf-8');

      results.push({
        elementDescription: clickable.description,
        htmlPath: htmlRelPath,
        success: true,
      });
    } catch (err) {
      results.push({
        elementDescription: clickable.description,
        htmlPath: htmlRelPath,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Reset page state for next interaction by reloading
    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(settleTime);
    } catch {
      // If reload fails, remaining interactions will likely fail too
      break;
    }
  }

  return results;
}
