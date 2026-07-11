import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { meNotificationRouter } from '../modules/notification/notification.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(readFileSync(join(__dirname, 'openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

describe('notification docs', () => {
  it('documents every /me/notifications route', () => {
    assertRouterDocumented(
      meNotificationRouter,
      '/me/notifications',
      spec.paths,
    );
  });
});
