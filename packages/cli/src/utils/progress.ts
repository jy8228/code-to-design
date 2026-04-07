/**
 * Simple console progress utilities for the CLI.
 */

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

export function log(message: string): void {
  console.log(`${COLORS.dim}[c2d]${COLORS.reset} ${message}`);
}

export function success(message: string): void {
  console.log(`${COLORS.green}  ✓${COLORS.reset} ${message}`);
}

export function warn(message: string): void {
  console.log(`${COLORS.yellow}  ⚠${COLORS.reset} ${message}`);
}

export function error(message: string): void {
  console.error(`${COLORS.red}  ✗${COLORS.reset} ${message}`);
}

export function header(message: string): void {
  console.log(`\n${COLORS.bold}${COLORS.cyan}${message}${COLORS.reset}`);
}

export function step(current: number, total: number, message: string): void {
  console.log(`${COLORS.dim}  [${current}/${total}]${COLORS.reset} ${message}`);
}

export function banner(): void {
  console.log(`
${COLORS.bold}${COLORS.cyan}  Code to Design${COLORS.reset} ${COLORS.dim}v0.1.0${COLORS.reset}
${COLORS.dim}  AI-powered UI review canvas${COLORS.reset}
`);
}
