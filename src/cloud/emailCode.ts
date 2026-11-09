// Email sign-in in the app: what a typed address and code look like before they're sent. The
// Worker checks both again (worker/src/emailAuth.ts); these only keep the buttons honest and let
// a pasted code in whatever shape it comes.

/** The digits of a typed or pasted code ("123 456", "123-456", "Your code is 123456"), six at most. */
export const codeDigits = (text: string) => text.replace(/\D/g, '').slice(0, 6)

/** Whether a typed address could be one: something@something.something, 254 characters at most. */
export function couldBeEmail(text: string): boolean {
  const t = text.trim()
  return t.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
}
