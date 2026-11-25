import { expect, type Page } from "@playwright/test";

export const API_URL = (process.env.E2E_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
export const MEMORY_KEY = "lyftr.memory.v1";

export const tag = () => Date.now().toString(36);

export async function send(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-input").press("Enter");
}

export async function waitForReplies(page: Page, count: number) {
  await expect(page.getByTestId("assistant-message")).toHaveCount(count);
}

export function lastReply(page: Page) {
  return page.getByTestId("assistant-message").last().getByTestId("assistant-reply");
}

export async function sessionId(page: Page): Promise<string> {
  return (await page.locator("main[data-session-id]").getAttribute("data-session-id")) ?? "";
}

/** Records the JSON body of every POST /chat the page sends. */
export function captureChatRequests(page: Page): Array<{ session_id: string; message: string; system_prompt?: string }> {
  const bodies: Array<{ session_id: string; message: string; system_prompt?: string }> = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/chat")) bodies.push(JSON.parse(req.postData() ?? "{}"));
  });
  return bodies;
}

/** Fresh page with no saved profile memory. */
export async function openClean(page: Page, path = "/") {
  await page.goto(path);
  await page.evaluate((k) => localStorage.removeItem(k), MEMORY_KEY);
  await page.reload();
  await expect(page.getByTestId("chat-input")).toBeVisible();
}

export async function saveNameViaPanel(page: Page, name: string) {
  await page.getByTestId("memory-indicator").click();
  await page.getByTestId("memory-name-input").fill(name);
  await page.getByTestId("memory-save").click();
  await expect(page.getByTestId("memory-toast")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("memory-indicator")).toHaveAttribute("data-memory-state", "saved");
}

export async function storedMemory(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), MEMORY_KEY);
}
