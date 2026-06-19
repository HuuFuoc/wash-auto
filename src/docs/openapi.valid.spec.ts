import { join } from 'path';
import SwaggerParser from '@apidevtools/swagger-parser';

describe('openapi.yaml', () => {
  it('is a valid OpenAPI 3.0 document with no broken $ref', async () => {
    const api = await SwaggerParser.validate(join(__dirname, 'openapi.yaml'));
    expect((api as { openapi?: string }).openapi).toBe('3.0.3');
  });
});
