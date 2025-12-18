export const ensureDate = (value?: Date | null): Date => value ?? new Date();
export const ensureBoolean = (
  value?: boolean | null,
  fallback = true,
): boolean => value ?? fallback;