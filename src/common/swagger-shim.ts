/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Framework-free stand-in for the `@nestjs/swagger` symbols the DTOs used, so
 * Phase 5 can drop every `@nestjs/*` dependency. Swagger was OPTIONAL and never
 * wired into the Express app (see MIGRATION_PROGRESS), so the doc decorators are
 * inert here — they only need to exist as no-op property decorators.
 *
 * `PartialType` is the one that carries real behavior: it must return a subclass
 * whose validated properties are all OPTIONAL, exactly like @nestjs/mapped-types.
 * We layer `@IsOptional()` on each property the base class validates; the base's
 * class-validator AND class-transformer metadata are inherited via the prototype
 * chain, so `validateDto` keeps behaving byte-for-byte as before.
 */
import { IsOptional, getMetadataStorage } from 'class-validator';

type Constructor<T = unknown> = new (...args: any[]) => T;

/** No-op replacement for `@ApiProperty()` / `@ApiPropertyOptional()`. */
const noopPropertyDecorator =
  (..._args: any[]): PropertyDecorator =>
  (): void => {
    /* doc-only: intentionally does nothing at runtime */
  };

export const ApiProperty = noopPropertyDecorator;
export const ApiPropertyOptional = noopPropertyDecorator;

export function PartialType<T>(
  BaseClass: Constructor<T>,
): Constructor<Partial<T>> {
  class PartialClass extends (BaseClass as Constructor<object>) {}

  const storage = getMetadataStorage() as any;
  const metadatas: any[] = storage.getTargetValidationMetadatas(
    BaseClass,
    null as any,
    false,
    false,
  );
  const properties = new Set<string>(
    metadatas.map((meta) => meta.propertyName as string),
  );
  for (const property of properties) {
    IsOptional()(PartialClass.prototype, property);
  }
  return PartialClass as Constructor<Partial<T>>;
}
