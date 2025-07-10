import { assertEquals } from "@std/assert";
import { Encryption } from "./encryption.ts";

Deno.test(async function encryptTest() {
  const masterPassword = "test";
  const msg = "foo";
  const encrypted = await Encryption.encrypt(masterPassword, msg);

  const decrypted = await Encryption.decrypt(masterPassword, encrypted);

  assertEquals(decrypted, "foo");
});
