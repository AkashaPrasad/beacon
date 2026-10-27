import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { User } from '../models/user.js';
import { as, buildTestApp, cookieFor, createUser, resetDb } from '../test/helpers.js';

/** Save-and-resume for the conversational onboarding (docs/UX-RESTRUCTURE.md §3). */
describe('onboarding save and resume', () => {
  beforeEach(resetDb);

  it('PATCH /v1/profile/onboarding saves the step and merges answers; /v1/me returns them', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);

    const fresh = await api.get('/v1/me');
    expect(fresh.body.onboarding).toMatchObject({ completed: false, step: 'consent', answers: {}, updatedAt: null });

    const first = await api.patch('/v1/profile/onboarding').send({
      step: 'degree',
      answers: { degree: { level: 'bachelor', branch: 'CSE' }, gradYear: 2027 },
    });
    expect(first.status).toBe(200);
    expect(first.body.onboarding).toMatchObject({
      completed: false,
      step: 'degree',
      answers: { degree: { level: 'bachelor', branch: 'CSE' }, gradYear: 2027 },
    });
    expect(first.body.onboarding.updatedAt).toEqual(expect.any(String));

    // Later pages merge; `null` removes an answer; untouched answers stay.
    const second = await api.patch('/v1/profile/onboarding').send({
      step: 'role-families',
      answers: { roleFamilies: ['backend_engineer', 'ml_engineer'], gradYear: null, stack: ['TypeScript', 'Go'] },
    });
    expect(second.status).toBe(200);
    expect(second.body.onboarding.step).toBe('role-families');
    expect(second.body.onboarding.answers).toEqual({
      degree: { level: 'bachelor', branch: 'CSE' },
      roleFamilies: ['backend_engineer', 'ml_engineer'],
      stack: ['TypeScript', 'Go'],
    });

    // A returning session resumes exactly there.
    const me = await api.get('/v1/me');
    expect(me.body.onboarding.step).toBe('role-families');
    expect(me.body.onboarding.answers.stack).toEqual(['TypeScript', 'Go']);

    // Answers alone (no step change) are fine too.
    const onlyAnswers = await api.patch('/v1/profile/onboarding').send({ answers: { interests: ['hackathons'] } });
    expect(onlyAnswers.body.onboarding.step).toBe('role-families');
    expect(onlyAnswers.body.onboarding.answers.interests).toEqual(['hackathons']);
  });

  it('POST /v1/profile/onboarding/complete finishes (idempotent) and warms the radar when a profile exists', async () => {
    const { app, queue } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    await api.patch('/v1/profile/onboarding').send({ step: 'review', answers: { types: ['internship'] } });

    const noProfile = await api.post('/v1/profile/onboarding/complete');
    expect(noProfile.status).toBe(200);
    expect(noProfile.body.onboarding).toMatchObject({ completed: true, step: 'done', answers: { types: ['internship'] } });
    expect(noProfile.body.user.onboardingCompletedAt).toEqual(noProfile.body.onboarding.completedAt);
    expect(queue.of('match')).toHaveLength(0);
    const completedAt = noProfile.body.onboarding.completedAt as string;

    await api.put('/v1/profile').send({ headline: 'Backend developer', skills: [{ name: 'Go' }] });
    queue.clear();
    const again = await api.post('/v1/profile/onboarding/complete').send({ answers: { targetCompanies: ['Razorpay'] } });
    expect(again.status).toBe(200);
    expect(again.body.onboarding.completedAt).toBe(completedAt);
    expect(again.body.onboarding.answers).toEqual({ types: ['internship'], targetCompanies: ['Razorpay'] });
    expect(queue.of('embed')).toEqual([{ kind: 'profile', userId: user._id.toString() }]);
    expect(queue.of('match')).toEqual([{ userId: user._id.toString(), reason: 'profile' }]);

    // After completion the step stays `done`, but answers can still be edited.
    const edit = await api.patch('/v1/profile/onboarding').send({ step: 'stack', answers: { stack: ['Rust'] } });
    expect(edit.body.onboarding).toMatchObject({ completed: true, step: 'done' });
    expect(edit.body.onboarding.answers.stack).toEqual(['Rust']);
  });

  it('validates step ids, answer ids, Mongo-unsafe keys and the 32 KB cap', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    const bad = async (body: unknown, status = 400) => {
      const res = await api.patch('/v1/profile/onboarding').send(body as object);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(status);
      return res;
    };
    expect((await bad({})).body.error.code).toBe('VALIDATION');
    await bad({ step: 'Has Spaces' });
    await bad({ step: 'x'.repeat(41) });
    await bad({ answers: { '1starts-with-digit': true } });
    await bad({ answers: { 'a.b': true } });
    await bad({ answers: { ok: { $where: 'x' } } });
    await bad({ answers: { ok: { 'nested.dot': 1 } } });
    await bad({ step: 'degree', extra: true });
    const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, i]));
    await bad({ answers: many });
    const tooBig = await bad({ answers: { essay: 'x'.repeat(33 * 1024) } }, 413);
    expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect((await bad({ answers: { ok: 1 } }, 200)).body.onboarding.answers).toEqual({ ok: 1 });

    // CSRF (before auth) and auth apply as on every user route.
    const signedOut = await request(app).patch('/v1/profile/onboarding').set('X-Requested-With', 'beacon').send({ step: 'degree' });
    expect(signedOut.status).toBe(401);
    const noCsrf = await request(app).post('/v1/profile/onboarding/complete').set('Cookie', cookieFor(user)).send({});
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF');
  });

  it('a legacy stored null map is replaced whole; PATCH /v1/me keeps the legacy step enum', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    await User.collection.updateOne({ _id: user._id }, { $set: { onboardingAnswers: null } });
    const api = as(app, user);
    const res = await api.patch('/v1/profile/onboarding').send({ step: 'name', answers: { name: 'Aarav', gone: null } });
    expect(res.status).toBe(200);
    expect(res.body.onboarding.answers).toEqual({ name: 'Aarav' });

    expect((await api.patch('/v1/me').send({ onboardingStep: 'sources' })).body.onboarding.step).toBe('sources');
    expect((await api.patch('/v1/me').send({ onboardingStep: 'degree' })).status).toBe(400);
  });

  it('the export includes onboarding answers', async () => {
    const { app } = buildTestApp();
    const user = await createUser();
    const api = as(app, user);
    await api.patch('/v1/profile/onboarding').send({ step: 'stack', answers: { stack: ['Go'] } });
    const res = await api.get('/v1/settings/export');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text) as { onboarding: unknown };
    expect(body.onboarding).toEqual({ step: 'stack', completedAt: null, answers: { stack: ['Go'] } });
  });
});
