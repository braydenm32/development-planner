import type { PageId } from '../nav/route'
import { ACCURACY_TITLE } from './caveat'

export const PAGE_TITLES: Record<PageId, string> = {
  about: 'About',
  privacy: 'Privacy',
  terms: 'Terms',
  accuracy: ACCURACY_TITLE,
}
