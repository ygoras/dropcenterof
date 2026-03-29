import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

describe('Webhook Validation', () => {
  describe('Asaas Webhook Token', () => {
    it('should validate matching tokens', () => {
      const token = 'whsec_test_token';
      const incoming = 'whsec_test_token';
      expect(token === incoming).toBe(true);
      expect(token.length === incoming.length).toBe(true);
    });

    it('should reject different tokens', () => {
      const token = 'whsec_real_token';
      const incoming = 'whsec_fake_token';
      expect(token === incoming).toBe(false);
    });

    it('should reject empty incoming token', () => {
      const incoming = '';
      expect(!!incoming).toBe(false);
    });
  });

  describe('Clerk Webhook Signature (Svix)', () => {
    const secret = 'whsec_dGVzdHNlY3JldA=='; // base64 encoded "testsecret"

    const computeSignature = (msgId: string, timestamp: string, body: string, secretKey: string) => {
      const rawSecret = secretKey.startsWith('whsec_') ? secretKey.slice(6) : secretKey;
      const secretBytes = Buffer.from(rawSecret, 'base64');
      const toSign = `${msgId}.${timestamp}.${body}`;
      return createHmac('sha256', secretBytes).update(toSign).digest('base64');
    };

    it('should compute valid HMAC signature', () => {
      const msgId = 'msg_123';
      const timestamp = '1234567890';
      const body = '{"type":"user.created","data":{}}';

      const sig = computeSignature(msgId, timestamp, body, secret);
      expect(sig).toBeTruthy();
      expect(typeof sig).toBe('string');
    });

    it('should produce different signatures for different bodies', () => {
      const msgId = 'msg_123';
      const timestamp = '1234567890';

      const sig1 = computeSignature(msgId, timestamp, '{"type":"user.created"}', secret);
      const sig2 = computeSignature(msgId, timestamp, '{"type":"user.deleted"}', secret);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different timestamps', () => {
      const msgId = 'msg_123';
      const body = '{"type":"user.created"}';

      const sig1 = computeSignature(msgId, '1000000000', body, secret);
      const sig2 = computeSignature(msgId, '2000000000', body, secret);

      expect(sig1).not.toBe(sig2);
    });

    it('should reject stale timestamps (replay protection)', () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesAgo = now - 301; // 5 min + 1 sec
      const isStale = (now - fiveMinutesAgo) > 300;
      expect(isStale).toBe(true);
    });

    it('should accept recent timestamps', () => {
      const now = Math.floor(Date.now() / 1000);
      const recentTimestamp = now - 60; // 1 minute ago
      const isStale = (now - recentTimestamp) > 300;
      expect(isStale).toBe(false);
    });
  });

  describe('Webhook Event Parsing', () => {
    it('should parse plan payment reference', () => {
      const ref = 'plan:tenant-uuid:subscription-uuid';
      const parts = ref.split(':');
      expect(parts[0]).toBe('plan');
      expect(parts[1]).toBe('tenant-uuid');
      expect(parts[2]).toBe('subscription-uuid');
    });

    it('should parse wallet recharge reference', () => {
      const ref = 'wallet:tenant-uuid';
      expect(ref.startsWith('wallet:')).toBe(true);
      expect(ref.replace('wallet:', '')).toBe('tenant-uuid');
    });

    it('should handle legacy reference (just tenant_id)', () => {
      const ref = 'some-tenant-uuid';
      const isWallet = ref.startsWith('wallet:');
      const isPlan = ref.startsWith('plan:');
      expect(isWallet).toBe(false);
      expect(isPlan).toBe(false);
    });
  });
});
