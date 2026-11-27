import { assertEquals } from 'jsr:@std/assert@1';
import { normalize, parseAddress, validate } from './index.ts';

const noon = new Date('2026-11-27T17:00:00Z');
const night = new Date('2026-11-28T03:00:00Z');
const email = { channel: 'email' as const, to: 'a@b.com', subject: 'Hi', body: 'Hello\nReply "unsubscribe" to stop.', campaignKey: 'c|1|0' };

Deno.test('normalize', () => {
  assertEquals(normalize(' A@B.com '), 'a@b.com');
  assertEquals(normalize('+1 (863) 555-0101'), '8635550101');
});
Deno.test('parseAddress', () => {
  assertEquals(parseAddress('1 Main St, Tampa, fl 33602'), { address_line1: '1 Main St', address_city: 'Tampa', address_state: 'FL', address_zip: '33602' });
  assertEquals(parseAddress('1 Main St Tampa'), null);
});
Deno.test('validate', () => {
  assertEquals(validate(email, noon), null);
  assertEquals(validate(email, night)?.startsWith('Quiet hours'), true);
  assertEquals(validate({ ...email, body: 'Hello' }, noon), 'Email must include an unsubscribe line.');
  assertEquals(validate({ ...email, body: 'You are owed $5,000. unsubscribe' }, noon)?.includes('guarantee'), true);
  assertEquals(validate({ channel: 'sms', to: '863-555-0101', body: 'Hi. Reply STOP to opt out.', campaignKey: 'k' }, noon), null);
  assertEquals(validate({ channel: 'sms', to: '863-555-0101', body: 'Hi', campaignKey: 'k' }, noon)?.includes('STOP'), true);
  assertEquals(validate({ channel: 'mail', to: '1 Oak St, Bartow, FL 33830', body: 'Letter', campaignKey: 'k', fromAddress: '1 Main St, Tampa, FL 33602' }, night), null);
  assertEquals(validate({ channel: 'mail', to: '1 Oak St', body: 'Letter', campaignKey: 'k', fromAddress: '1 Main St, Tampa, FL 33602' }, noon)?.startsWith('Mailing address'), true);
});
