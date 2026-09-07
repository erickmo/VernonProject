import { strict as assert } from 'node:assert'
import { frappeMessage } from './api'

// ipsjqf7af2: "many error message is still displayed in json" — the actual bug was
// that request()/upload helpers built their own fallback chain
// (data._server_messages || data.exception || data.message) instead of calling this
// function, so a truthy _server_messages (still JSON-encoded) went straight to the
// UI as-is. These checks pin frappeMessage's own parsing AND, more importantly, that
// its output never contains raw JSON/braces — the property the bug violated.

const noRawJson = (s: string) => {
  assert.ok(!s.includes('{') && !s.includes('['), `leaked raw JSON: ${s}`)
}

// The real shape: _server_messages is a JSON string of a JSON-string array.
const oneMessage = frappeMessage(
  { _server_messages: JSON.stringify([JSON.stringify({ message: 'Deadline must be after start date', indicator: 'red' })]) },
  'fallback',
)
assert.equal(oneMessage, 'Deadline must be after start date')
noRawJson(oneMessage)

// Multiple messages join on newline, HTML stripped, still no braces.
const twoMessages = frappeMessage(
  {
    _server_messages: JSON.stringify([
      JSON.stringify({ message: '<b>Title</b> is required' }),
      JSON.stringify({ message: 'Deadline is required' }),
    ]),
  },
  'fallback',
)
assert.equal(twoMessages, 'Title is required\nDeadline is required')
noRawJson(twoMessages)

// Malformed _server_messages (not JSON at all) falls through to exception/message,
// not the raw garbage string.
const malformed = frappeMessage({ _server_messages: 'not json{{{', exception: 'frappe.exceptions.ValidationError: Bad input' }, 'fallback')
assert.equal(malformed, 'frappe.exceptions.ValidationError: Bad input')

// No server fields at all -> the caller's fallback, never undefined/null/"undefined".
assert.equal(frappeMessage({}, 'Request failed (500)'), 'Request failed (500)')
assert.equal(frappeMessage(null, 'Request failed (500)'), 'Request failed (500)')

// _server_messages present but empty array -> falls through to exception/message/fallback,
// never renders "[]".
const emptyArray = frappeMessage({ _server_messages: JSON.stringify([]), message: 'Something failed' }, 'fallback')
assert.equal(emptyArray, 'Something failed')
noRawJson(emptyArray)

console.log('api self-check OK')
