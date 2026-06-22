// Generates the *structure-only* JSON Schema that gavel@9.1.5 derives from an
// expected example body. The schema enforces:
//
//   - object: every key in the example is `required` (recursively); extra keys
//     in the real body are allowed; the value must be an object;
//   - array: each element must satisfy the schema generated from the example's
//     first element (so arrays-of-objects enforce inner required keys); the
//     value must be an array;
//   - primitives / null: no constraint at all — neither the type nor the value
//     of a leaf is enforced.
//
// This is why, against gavel, a changed scalar value or a differing scalar type
// passes, while a missing object key or a wrong *container* type fails.
export default function generateSchemaFromExample(value: unknown): object {
  if (value === null) {
    return {};
  }

  if (Array.isArray(value)) {
    if (value.length > 0) {
      return { type: 'array', items: generateSchemaFromExample(value[0]) };
    }
    return { type: 'array' };
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const properties = keys.reduce<Record<string, object>>((acc, key) => {
      acc[key] = generateSchemaFromExample(record[key]);
      return acc;
    }, {});
    return { type: 'object', properties, required: keys };
  }

  return {};
}
