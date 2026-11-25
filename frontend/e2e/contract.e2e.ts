import { expect, test } from "@playwright/test";
import { openClean, send, sessionId, tag, waitForReplies } from "./helpers";

// The assignment's UI contract (section 5) checked in a real browser against a running stack.

test("required data-testids, Enter-to-send, cleared input and per-reply metadata", async ({ page }) => {
  await openClean(page);
  await expect(page.getByTestId("system-prompt-input")).toBeVisible();
  await expect(page.getByTestId("send-button")).toBeDisabled();

  await send(page, `Reply with one short sentence about the sea. #${tag()}`);
  await expect(page.getByTestId("chat-input")).toHaveValue("");
  await waitForReplies(page, 1);

  const reply = page.getByTestId("assistant-message").first();
  await expect(reply.getByTestId("meta-source")).toHaveText(/^(LIVE_INFERENCE|LLM_CACHE)$/);
  await expect(reply.getByTestId("meta-model")).not.toBeEmpty();
  await expect(reply.getByTestId("meta-latency")).toHaveText(/^\d+ ms$/);
  await expect(reply.getByTestId("meta-input-tokens")).toHaveText(/^\d+$/);
  await expect(reply.getByTestId("meta-output-tokens")).toHaveText(/^\d+$/);
});

test("same-session multi-turn memory", async ({ page }) => {
  await openClean(page);
  const word = `mango${tag()}`;
  await send(page, `Remember this secret word: ${word}. Reply with just OK.`);
  await waitForReplies(page, 1);
  await send(page, "What was the secret word? Answer with just the word.");
  await waitForReplies(page, 2);
  await expect(page.getByTestId("assistant-reply").last()).toContainText(word, { ignoreCase: true });
});

test("same first message in a new chat is served from cache", async ({ page }) => {
  await openClean(page);
  const question = `Name one primary colour. #${tag()}`;
  await send(page, question);
  await waitForReplies(page, 1);
  await page.getByRole("button", { name: "New Chat" }).click();
  await send(page, question);
  await waitForReplies(page, 1);
  await expect(page.getByTestId("meta-source")).toHaveText("LLM_CACHE");
});

test("422 and 503 are shown as readable errors, never a blank screen", async ({ page }) => {
  await openClean(page);
  await send(page, "x".repeat(4005));
  await expect(page.getByTestId("error-message")).toContainText(/could not be sent/i);

  await openClean(page, "/?simulate=*%3D429");
  await send(page, "This should fail.");
  await expect(page.getByTestId("error-message")).toContainText(/unavailable/i);
  await expect(page.getByTestId("assistant-message")).toHaveCount(0);
});

test("X-Simulate-Failure key_1=429 fails over to key_2", async ({ page }) => {
  await openClean(page, "/?simulate=key_1%3D429");
  await send(page, `Say ok. #${tag()}`);
  await waitForReplies(page, 1);
  await expect(page.getByTestId("meta-key-id")).toHaveText("key_2");
  await expect(page.getByTestId("meta-fallback-attempts")).toHaveText("1");
});

test("a new session id on every page load", async ({ page }) => {
  await openClean(page);
  const first = await sessionId(page);
  await page.reload();
  const second = await sessionId(page);
  expect(first).toMatch(/[0-9a-f-]{36}/);
  expect(second).not.toBe(first);
});
