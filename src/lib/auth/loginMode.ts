export type LoginSearchParams = { signup?: string; mode?: string; tab?: string };

/**
 * Sign-up mode is read from the URL search params that the server also sees, so the server render and
 * the browser's first render show the same form (reading window.location caused hydration error #418).
 */
export function isSignUpRequested(params: LoginSearchParams | null | undefined): boolean {
  return params?.signup === 'true' || params?.mode === 'signup' || params?.tab === 'signup';
}
