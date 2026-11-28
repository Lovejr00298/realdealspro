import { assertEquals } from 'jsr:@std/assert@1';
import { extractContacts, lookupKey, validateLookup } from './index.ts';

Deno.test('extracts unique phones and emails from nested results', () => {
  const data = { results: { persons: [{ phoneNumbers: [{ number: '(813) 555-0101', type: 'Mobile', dnc: true }, { number: '18135550101' }, { number: '555' }],
    emails: [{ email: 'Owner@Example.com' }, 'bad'] }, { phoneNumbers: [{ number: '7275550199', type: 'Land Line' }], emails: ['two@example.com'] }] } };
  assertEquals(extractContacts(data), {
    phones: [{ number: '8135550101', type: 'Mobile', dnc: true }, { number: '7275550199', type: 'Land Line', dnc: false }],
    emails: ['owner@example.com', 'two@example.com'],
  });
});

Deno.test('validates lookup address and normalizes cache key', () => {
  assertEquals(validateLookup({ street: '1 Main St', city: 'Tampa', state: 'FL', zip: '33602' }), null);
  assertEquals(validateLookup({ street: '', city: 'Tampa', state: 'FL', zip: '33602' }), 'A full mailing address is required.');
  assertEquals(validateLookup({ street: '1 Main', city: 'Tampa', state: 'Florida', zip: '33602' }), 'Enter a valid state and ZIP code.');
  assertEquals(lookupKey({ street: ' 1  main st', city: 'tampa', state: 'fl', zip: '33602-1234' }), '1 MAIN ST|TAMPA|FL|33602');
});
