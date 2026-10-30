import { test, expect } from '@playwright/test';
import { newPlayer, createTeam, joinAsPlayer } from './helpers';

/**
 * B-89: the survey options and results are plain text (textContent), not HTML; voting still works.
 * The survey API is mocked (no survey in the test database).
 */
test('survey options are rendered as text, a vote shows the results (B-89)', async ({ browser }) => {
  const alice = await newPlayer(browser, { viewport: { width: 1280, height: 900 } });
  const url = await createTeam(alice, 'Survey Text');
  await joinAsPlayer(alice, url, 'Alice');

  const evil = '<img src=x onerror="window.__xss=1">';
  const survey = {
    survey_id: 1, votes_count: 5, survey_intro: 'How do you like it?',
    vote_options: [
      { id: 1, text: evil, total_count: 2, votes_percentage: 40 },
      { id: 2, text: 'Great & <b>simple</b>', total_count: 3, votes_percentage: 60 },
    ],
  };
  await alice.route('**/api/get_survey.php*', route => route.fulfill({ json: survey }));
  const votes: string[] = [];
  await alice.route('**/api/update_user.php*', route => {
    votes.push(new URL(route.request().url()).searchParams.get('survey_vote') ?? '');
    return route.fulfill({ body: '' });
  });

  await alice.evaluate(() => { (window as any).gSurvey = 'LOUD'; (window as any).generateSurveyContents(); });
  const options = alice.locator('#vote_options button.vote_option');
  await expect(options).toHaveText([evil, 'Great & <b>simple</b>']);
  await expect(alice.locator('#survey-content img, #survey-content b')).toHaveCount(0);
  await expect(alice.locator('#survey_intro')).toHaveText('How do you like it?');
  await expect(alice.locator('#vote_count')).toHaveText('5 votes');
  await expect(alice.locator('#vote_option_2')).toHaveAttribute('value', '2');

  await alice.locator('#vote_option_2').dispatchEvent('click');
  await expect.poll(() => votes).toEqual(['2']);
  const bars = alice.locator('#vote_results .vote_results_bar .vote_results_bar_value');
  await expect(bars).toHaveText([evil + ' (40%)', 'Great & <b>simple</b> (60%)']);
  await expect(alice.locator('#vote_option_results_2')).toHaveAttribute('style', /width: 60%/);
  expect(await alice.evaluate(() => (window as any).__xss)).toBeUndefined();
});
