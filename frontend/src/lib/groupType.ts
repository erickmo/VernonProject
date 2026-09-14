// m09q8mj3gv: a Group can be marked "Coding", which swaps its todos' free-form
// note for the structured brief — but nothing in either Group form offered the
// field, so the setting was unreachable from the app and the feature looked
// missing.
//
// The options live here, not inline in each form, because /m and /w both render
// the field and groupType.test.ts pins them to the Group doctype's own Select.
// An option the UI offers that the doctype does not have is refused on save with
// no useful message, so drift has to be a failing test, not a support ticket.
export const GROUP_TYPES = ['', 'Coding'] as const

/** Empty is the normal group; only a named type changes behaviour. */
export const GROUP_TYPE_LABELS: Record<string, string> = { '': 'Standard', Coding: 'Coding' }

export const GROUP_TYPE_HINT = "Coding swaps this group's free-form todo note for the structured brief."
