import { execSync } from 'node:child_process';

/**
 * Check if Playwright Chromium browser is installed.
 */
export function isPlaywrightInstalled(): boolean {
  try {
    const result = execSync('npx playwright install --dry-run chromium 2>&1', {
      encoding: 'utf-8',
      timeout: 10000,
    });
    // If dry-run succeeds without "browser needs to be installed", it's installed
    return !result.includes('needs to be installed');
  } catch {
    // Check if chromium binary exists in common locations
    try {
      execSync('npx playwright chromium --version 2>/dev/null', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Install Playwright Chromium browser.
 */
export function installPlaywright(): void {
  console.log('Installing Playwright Chromium browser (~200MB)...');
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    timeout: 300000, // 5 minute timeout
  });
}
