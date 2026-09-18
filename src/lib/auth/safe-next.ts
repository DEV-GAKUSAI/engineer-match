/** Only allow an internal, root-relative destination after authentication. */
export function getSafeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  return value;
}
