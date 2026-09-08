import assert from "node:assert/strict";
import test from "node:test";
import { AsyncSemaphore } from "../src/lib/async-semaphore";

test("semaphore queues work above its concurrency limit", async () => {
  const semaphore = new AsyncSemaphore(2);
  const releaseFirst = await semaphore.acquire();
  const releaseSecond = await semaphore.acquire();
  const third = semaphore.acquire();
  await Promise.resolve();

  assert.equal(semaphore.active, 2);
  assert.equal(semaphore.pending, 1);

  releaseFirst();
  const releaseThird = await third;
  assert.equal(semaphore.active, 2);
  assert.equal(semaphore.pending, 0);

  releaseFirst();
  assert.equal(semaphore.active, 2, "release is idempotent");
  releaseSecond();
  releaseThird();
  assert.equal(semaphore.active, 0);
});
