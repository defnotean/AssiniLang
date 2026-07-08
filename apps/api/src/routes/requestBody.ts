type SafeParseResult<T> =
  | {
    success: true;
    data: T;
  }
  | {
    success: false;
  };

type RequestBodySchema<T> = {
  safeParse(input: unknown): SafeParseResult<T>;
};

export function parseSchemaBody<T>(schema: RequestBodySchema<T>, input: unknown): T | undefined {
  const result = schema.safeParse(input);
  return result.success ? result.data : undefined;
}
