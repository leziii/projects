import { expect, type Page } from '@playwright/test';
import { ADMIN } from './helpers';

const year = new Date().getFullYear();
const month = String(new Date().getMonth() + 1);

/** A name no earlier test run used, so the admin queue row is easy to find. */
export const petName = (base: string) => `${base}${Math.floor(Math.random() * 1e5)}`;

/** Adds a cat on the mobile My pets page. */
export async function addCat(page: Page, name: string, opts: { born?: number; vaccinated?: boolean } = {}) {
  await page.locator('[data-test=add-pet]').click();
  await page.locator('[data-test=kind-cat]').click();
  await page.locator('[data-test=name] input').fill(name);
  await page.locator('[data-test=birth-month]').selectOption('1');
  await page.locator('[data-test=birth-year]').selectOption(String(opts.born ?? year - 3));
  if (opts.vaccinated === false) {
    await page.locator('[data-test=vaccinated-no]').click();
  } else {
    await page.locator('[data-test=vaccinated-yes]').click();
    await page.locator('[data-test=vaccine-month]').selectOption(month);
    await page.locator('[data-test=vaccine-year]').selectOption(String(year));
  }
  await page.locator('[data-test=confirm]').click();
  await page.locator('[data-test=save]').click();
  await expect(page.locator('[data-test=pet]', { hasText: name })).toBeVisible();
}

/** Admin opens the pet in Pet check and submits a decision. */
export async function decideInPetCheck(admin: Page, name: string, decision: 'approved' | 'needs_info' | 'rejected', note = '') {
  await admin.goto(`${ADMIN}/pets`);
  await admin.locator('[data-test=pet-queue] tr', { hasText: name }).getByRole('button').click();
  await expect(admin.locator('h2')).toHaveText(name);
  await admin.locator(`[data-test=decision-${decision}]`).click();
  if (note) await admin.locator('textarea[data-test=decision-note]').fill(note);
  await admin.locator('[data-test=submit-decision]').click();
  await expect(admin.locator('.el-message--success', { hasText: 'The owner has been told' })).toBeVisible();
}
