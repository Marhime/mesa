// The shape of a structured answer, said once for any model: a small JSON Schema subset (types, nullable,
// enums, required and ordered properties). The model adapter (gemini.ts) turns it into its own format.

export type SchemaType = 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';

/** The type names, as the schemas write them (Type.OBJECT…). */
export const Type = {
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  INTEGER: 'integer',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
} as const satisfies Record<string, SchemaType>;

export interface ModelSchema {
  type: SchemaType;
  description?: string;
  /** null is a valid answer. */
  nullable?: boolean;
  /** With format 'enum': the only strings allowed. */
  enum?: string[];
  format?: 'enum';
  properties?: Record<string, ModelSchema>;
  required?: string[];
  /** The order the model writes the properties in (some models follow it, which helps streaming). */
  propertyOrdering?: string[];
  items?: ModelSchema;
}

export const nullable = (s: ModelSchema): ModelSchema => ({ ...s, nullable: true });

/** One of these strings. */
export const enumOf = (values: readonly string[], description?: string): ModelSchema => ({
  type: Type.STRING,
  format: 'enum',
  enum: [...values],
  ...(description ? { description } : {}),
});
