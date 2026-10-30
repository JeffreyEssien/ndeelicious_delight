import assert from "node:assert/strict";
import crypto from "node:crypto";
import ece from "http_ece";
import webpush from "web-push";
// A real push round trip without a push service: build the encrypted request the sender
// makes, then decrypt it with the browser's keys.
const vapid = webpush.generateVAPIDKeys();
const browser = crypto.createECDH("prime256v1");
browser.generateKeys();
const authSecret = crypto.randomBytes(16);
const subscription = {
  endpoint: "https://push.example/send/abc",
  keys: { p256dh: browser.getPublicKey("base64url"), auth: authSecret.toString("base64url") },
};
const message = {
  title: "Your order is ready",
  body: "Pop by and pick it up · ND-1001",
  url: "/track-order?order=ND-1001",
};
const request = webpush.generateRequestDetails(subscription, JSON.stringify(message), {
  vapidDetails: { subject: "mailto:owner@example.test", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
  TTL: 86400,
  urgency: "high",
});
assert.equal(request.endpoint, subscription.endpoint);
assert.equal(request.headers["Content-Encoding"], "aes128gcm");
assert.equal(request.headers.Urgency, "high");
assert.match(request.headers.Authorization, new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`));
const decrypted = ece.decrypt(request.body, { version: "aes128gcm", privateKey: browser, authSecret });
assert.deepEqual(JSON.parse(decrypted.toString()), message);
console.log("PASS push delivery: VAPID-signed, aes128gcm-encrypted request decrypts to the original message");
