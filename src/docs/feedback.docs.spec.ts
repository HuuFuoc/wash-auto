import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  adminFeedbackRouter,
  meFeedbackRouter,
} from '../modules/feedback/feedback.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('feedback docs', () => {
  it('documents every /me/feedback route', () => {
    assertRouterDocumented(meFeedbackRouter, '/me/feedback', spec.paths);
  });
  it('documents every /admin/feedback route', () => {
    assertRouterDocumented(adminFeedbackRouter, '/admin/feedback', spec.paths);
  });
});
