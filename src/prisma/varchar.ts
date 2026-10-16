import type { Varchar } from '@prisma/orm-postgres/target/codec-types';

export function toVarchar<const Length extends number>(
  value: string,
  maxLength: Length,
): Varchar<Length> {
  if (Array.from(value).length > maxLength) {
    throw new RangeError(
      `Value exceeds the ${maxLength}-character database column limit.`,
    );
  }

  return value as Varchar<Length>;
}
