import { join } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import {
  chatRouter,
  adminChatKnowledgeRouter,
} from '../modules/chat/chat.router';
import { assertRouterDocumented } from '../../test/docs-helpers/assert-router-documented';

const spec = parse(
  readFileSync(join(__dirname, 'openapi.yaml'), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };

describe('chat docs', () => {
  it('documents every /chat route', () => {
    assertRouterDocumented(chatRouter, '/chat', spec.paths);
  });
  it('documents every /admin/chat-knowledge route', () => {
    assertRouterDocumented(
      adminChatKnowledgeRouter,
      '/admin/chat-knowledge',
      spec.paths,
    );
  });
});
