/**
 * Headless playtest for Phase B games.
 * Requires: vite playtest server on :5179
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PLAYTEST_URL ?? 'http://localhost:5180/playtest.html';
const OUT = join(process.cwd(), 'playtest-results');

mkdirSync(OUT, { recursive: true });

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function hud(page) {
  return page.locator('#hud').innerText();
}

async function logTail(page) {
  return page.locator('#log').innerText();
}

async function clickGame(page, name) {
  await page.locator(`button[data-game="${name}"]`).click();
  await wait(400);
}

async function focusStage(page) {
  const box = await page.locator('#stage').boundingBox();
  if (!box) throw new Error('stage missing');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(100);
}

async function testTraffic(page) {
  const notes = [];
  await clickGame(page, 'traffic');
  await focusStage(page);

  await page.keyboard.press('ArrowRight');
  await wait(200);
  await page.keyboard.press('ArrowLeft');
  await wait(300);

  await page.keyboard.down('Space');
  await wait(600);
  // Mid-run shot so bike is visible before game-over overlay
  await page.screenshot({ path: join(OUT, 'traffic.png') });
  await wait(900);
  await page.keyboard.up('Space');

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight');
    await wait(350);
  }
  const h = await hud(page);
  notes.push(`traffic hud: ${h}`);
  const score = Number(h.match(/SCORE\s+(\d+)/)?.[1] ?? 0);
  if (score <= 0) notes.push('FAIL: traffic score did not increase');
  else notes.push(`OK: traffic score=${score}`);
  return notes;
}

async function testCoffee(page) {
  const notes = [];
  await clickGame(page, 'coffee');
  await focusStage(page);

  // Smash through fill + drink — must score without dying
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Space');
    await wait(120);
  }
  await wait(1400);

  await page.screenshot({ path: join(OUT, 'coffee.png') });
  const h = await hud(page);
  const log = await logTail(page);
  notes.push(`coffee hud: ${h}`);
  const score = Number(h.match(/SCORE\s+(\d+)/)?.[1] ?? 0);
  const died = /RUN END · coffee · score=\d+ · reason=death/.test(log);
  if (died && score < 50) {
    notes.push('FAIL: coffee spilled before first drink');
  } else if (score >= 50) {
    notes.push(`OK: coffee drank successfully (score=${score})`);
  } else {
    notes.push(`WARN: coffee score=${score}`);
  }
  return notes;
}

async function testCompile(page) {
  const notes = [];
  await clickGame(page, 'compile-run');
  await focusStage(page);

  // Start + jump, capture at apex (~250ms into hop)
  await page.keyboard.press('Space');
  await wait(250);
  await page.screenshot({ path: join(OUT, 'compile-jump.png') });
  await wait(500);

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Space');
    await wait(450);
  }

  await page.screenshot({ path: join(OUT, 'compile-run.png') });
  const h = await hud(page);
  notes.push(`compile hud: ${h}`);
  const score = Number(h.match(/SCORE\s+(\d+)/)?.[1] ?? 0);
  if (score <= 0) notes.push('FAIL: compile score did not increase');
  else notes.push(`OK: compile score=${score}`);
  return notes;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(500);

  const title = await page.title();
  console.log('Page:', title);

  const results = [
    ...(await testTraffic(page)),
    ...(await testCoffee(page)),
    ...(await testCompile(page)),
  ];

  await page.screenshot({ path: join(OUT, 'final.png') });
  await browser.close();

  console.log('\n=== PLAYTEST RESULTS ===');
  for (const line of results) console.log(line);
  if (errors.length) {
    console.log('\n=== ERRORS ===');
    for (const e of errors) console.log(e);
  } else {
    console.log('\nNo page/console errors.');
  }

  const failed = results.some((r) => r.startsWith('FAIL:'));
  if (failed || errors.length) process.exitCode = 1;
  else console.log('\nPlaytest smoke: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
