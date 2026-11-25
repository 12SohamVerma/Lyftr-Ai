import { expect, test } from "@playwright/test";
import {
  API_URL,
  MEMORY_KEY,
  captureChatRequests,
  openClean,
  saveNameViaPanel,
  send,
  sessionId,
  storedMemory,
  tag,
  waitForReplies,
} from "./helpers";

// Persistent profile memory (browser-local) — see src/utils/profileMemory.ts.

test("an explicitly stated name is offered, and saved only after confirmation", async ({ page }) => {
  await openClean(page);
  await send(page, `My name is Soham. Reply with one short friendly sentence. #${tag()}`);
  await expect(page.getByTestId("memory-offer")).toBeVisible();
  await expect(page.getByTestId("memory-offer-name")).toHaveText("Soham");
  expect(await storedMemory(page)).toBeNull(); // nothing saved before the user confirms

  await page.getByTestId("memory-offer-save").click();
  await expect(page.getByTestId("memory-toast")).toContainText("Soham");
  await expect(page.getByTestId("memory-indicator")).toHaveAttribute("data-memory-state", "saved");
  expect((await storedMemory(page)).name).toBe("Soham");
});

test("'Not now' does not save anything", async ({ page }) => {
  await openClean(page);
  await send(page, `Call me Riya. Reply with just hi. #${tag()}`);
  await page.getByTestId("memory-offer-dismiss").click();
  await expect(page.getByTestId("memory-offer")).toHaveCount(0);
  expect(await storedMemory(page)).toBeNull();
});

test("the saved name works in new chats, after refresh and after a browser restart", async ({ page, browser }) => {
  await openClean(page);
  await saveNameViaPanel(page, "Soham");
  const requests = captureChatRequests(page);
  const firstSession = await sessionId(page);

  // New chat in the same tab.
  await send(page, `What is my name? Answer with just the name. #${tag()}`);
  await waitForReplies(page, 1);
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Soham");
  expect(requests.at(-1)!.system_prompt).toContain("- Name: Soham");
  expect(requests.at(-1)!.system_prompt!.startsWith("You are Lyftr AI")).toBe(true); // default kept

  // Refresh: new session id, memory still there.
  await page.reload();
  expect(await sessionId(page)).not.toBe(firstSession);
  await expect(page.getByTestId("memory-indicator")).toHaveAttribute("data-memory-state", "saved");
  await send(page, `Greet me by name in three words. #${tag()}`);
  await waitForReplies(page, 1);
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Soham");

  // "Browser restart": a brand-new context restored from the saved storage.
  const restarted = await browser.newContext({ storageState: await page.context().storageState() });
  const page2 = await restarted.newPage();
  await page2.goto("/");
  await expect(page2.getByTestId("memory-indicator")).toHaveAttribute("data-memory-state", "saved");
  await restarted.close();
});

test("Remember Me saves an explicit name without asking", async ({ page }) => {
  await openClean(page);
  await page.getByTestId("memory-indicator").click();
  await page.getByTestId("memory-autosave-toggle").click();
  await page.keyboard.press("Escape");
  await send(page, `Call me Sam. Reply with just hi. #${tag()}`);
  await expect(page.getByTestId("memory-toast")).toContainText("Sam");
  await expect(page.getByTestId("memory-offer")).toHaveCount(0);
  expect((await storedMemory(page)).name).toBe("Sam");
});

test("deleting memory removes it from storage and from later requests", async ({ page }) => {
  await openClean(page);
  await saveNameViaPanel(page, "Soham");
  await page.getByTestId("memory-indicator").click();
  await page.getByTestId("memory-delete").click();
  await page.getByTestId("memory-delete-confirm").click();
  await expect(page.getByTestId("memory-indicator")).toHaveAttribute("data-memory-state", "empty");
  expect(await page.evaluate((k) => localStorage.getItem(k), MEMORY_KEY)).toBeNull();

  const requests = captureChatRequests(page);
  await send(page, `Say ok. #${tag()}`);
  await waitForReplies(page, 1);
  expect(requests.at(-1)!.system_prompt).toBeUndefined();
});

test("disabled memory is not sent and names are not offered", async ({ page }) => {
  await openClean(page);
  await saveNameViaPanel(page, "Soham");
  await page.getByTestId("memory-indicator").click();
  await page.getByTestId("memory-enabled-toggle").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("memory-indicator")).toHaveAttribute("data-memory-state", "off");

  const requests = captureChatRequests(page);
  await send(page, `My name is Arjun. Reply with just ok. #${tag()}`);
  await waitForReplies(page, 1);
  expect(requests.at(-1)!.system_prompt).toBeUndefined();
  await expect(page.getByTestId("memory-offer")).toHaveCount(0);
});

test("a custom system prompt is preserved and memory is appended, not overwriting it", async ({ page }) => {
  await openClean(page);
  await saveNameViaPanel(page, "Soham");
  const custom = "Always answer like a pirate in one short sentence.";
  await page.getByTestId("system-prompt-input").fill(custom);
  const requests = captureChatRequests(page);
  await send(page, `Who am I? #${tag()}`);
  await waitForReplies(page, 1);
  const sent = requests.at(-1)!.system_prompt!;
  expect(sent.startsWith(custom)).toBe(true);
  expect(sent).toContain("- Name: Soham");
});

test("sessions stay isolated: memory is a name, not a shared transcript", async ({ page, request }) => {
  await openClean(page);
  await saveNameViaPanel(page, "Soham");
  const word = `kiwi${tag()}`;
  await send(page, `The secret word is ${word}. Reply with just OK.`);
  await waitForReplies(page, 1);
  const chatA = await sessionId(page);

  await page.getByRole("button", { name: "New Chat" }).click();
  const requests = captureChatRequests(page);
  await send(page, "Reply with just OK.");
  await waitForReplies(page, 1);
  const chatB = requests.at(-1)!.session_id;
  expect(chatB).not.toBe(chatA);
  expect(JSON.stringify(requests.at(-1))).not.toContain(word); // only the new message + profile are sent

  const historyB = await (await request.get(`${API_URL}/sessions/${chatB}/messages`)).json();
  expect(JSON.stringify(historyB)).not.toContain(word);
  const historyA = await (await request.get(`${API_URL}/sessions/${chatA}/messages`)).json();
  expect(JSON.stringify(historyA)).toContain(word);
});

test("identical profile context still gives cache hits across new chats", async ({ page }) => {
  await openClean(page);
  await saveNameViaPanel(page, "Soham");
  const question = `Name one fruit. #${tag()}`;
  await send(page, question);
  await waitForReplies(page, 1);
  await expect(page.getByTestId("meta-source")).toHaveText("LIVE_INFERENCE");
  await page.getByRole("button", { name: "New Chat" }).click();
  await send(page, question);
  await waitForReplies(page, 1);
  await expect(page.getByTestId("meta-source")).toHaveText("LLM_CACHE");
});
