import { test, expect, APIRequestContext } from '@playwright/test';
import { asUser, newPlayer, pageReady } from './helpers';

/**
 * B-156: new teams get an id with 80 random bits (random_bytes(), 16 characters Base32 a-z2-7) after a short
 * readable prefix from the team name, so a board link can no longer be guessed from the team name.
 */
const TEAM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z2-7]{16}$/;
const UID = 'E2ETEAMIDS000001'; // any valid UID: dao.php needs no membership

async function addTeam(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.post(`/api/addteam.php?t=${encodeURIComponent(name)}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id as string;
}

test('two teams with the same name get different random ids', async ({ request }) => {
  const first = await addTeam(request, 'Same Name Team');
  const second = await addTeam(request, 'Same Name Team');

  for (const id of [first, second]) {
    expect(id).toMatch(TEAM_ID);
    expect(id.startsWith('same-name-te-')).toBeTruthy(); // prefix: at most 12 characters of the name
    const dao = await request.get(`/api/dao.php?t=${encodeURIComponent(id)}`, asUser(UID));
    expect(dao.status()).toBe(200);
  }
  expect(first).not.toBe(second);
  // the random parts differ, not only a counter or a single character
  const random = (id: string) => id.slice(-16);
  const same = [...random(first)].filter((c, i) => c === random(second)[i]).length;
  expect(same).toBeLessThan(8);
});

test('names without letters or digits get the prefix "team"', async ({ request }) => {
  expect(await addTeam(request, '🙂 ✨')).toMatch(/^team-[a-z2-7]{16}$/);
  expect(await addTeam(request, 'Äpfel & Birnen')).toMatch(/^aepfel-birne-[a-z2-7]{16}$/);
});

test('tool link creates a team with a random id and opens its board', async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto(`/?tool=e2e&team=${encodeURIComponent('Tool Link Team')}`);
  await page.waitForURL(/\?t=/);
  const t = new URL(page.url()).searchParams.get('t') as string;

  expect(t).toMatch(TEAM_ID);
  expect(t.startsWith('tool-link-te-')).toBeTruthy();
  await pageReady(page);
  await expect(page.locator('#overlay_name_input')).toHaveClass(/visible/);
});
