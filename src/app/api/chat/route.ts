import {
  streamText,
  stepCountIs,
  UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { setAIContext } from "@auth0/ai-vercel";
import { withInterruptions, errorSerializer } from "@auth0/ai-vercel/interrupts";

import { getRetailTools, setGuestCart, setAuthAccessToken, setAuthRefreshToken } from "@/lib/auth0-ai";
import { auth0 } from "@/lib/auth/auth0";

// Allow up to 5 minutes for long-running CIBA approval flows where the
// server polls Auth0 while the user approves on their device.
export const maxDuration = 300;

const anthropic = createAnthropic({
  baseURL: `${process.env.ANTHROPIC_BASE_URL}/v1`,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const chatModel = anthropic("claude-4-6-opus");

export async function POST(request: Request) {
  const {
    messages,
    threadId,
    userId,
    userName,
    userEmail,
    guestCart,
  }: {
    messages: UIMessage[];
    threadId?: string;
    userId?: string;
    userName?: string;
    userEmail?: string;
    guestCart?: { productId: string; quantity: number; addedAt: string }[];
  } = await request.json();

  // Seed the in-memory guest cart so AI tools can read/write it
  if (!userId || userId === "guest") {
    setGuestCart(guestCart ?? []);
  }

  // Provide Management API access token and refresh token so AI tools can
  // read/write user_metadata and exchange tokens via Token Vault.
  if (userId && userId !== "guest") {
    try {
      const session = await auth0.getSession();
      if (session?.user) {
        const tokenResult = await auth0.getAccessToken();
        setAuthAccessToken(tokenResult.token);
        if (session.tokenSet?.refreshToken) {
          setAuthRefreshToken(session.tokenSet.refreshToken);
          console.log("[chat] refresh token available, length:", session.tokenSet.refreshToken.length);
        } else {
          console.warn("[chat] no refresh token in session. tokenSet keys:", Object.keys(session.tokenSet || {}));
        }
      }
    } catch {
      // If token retrieval fails, authenticated cart ops will gracefully error
    }
  }

  setAIContext({
    threadID: threadId ?? "default",
    ...(userId ? { userID: userId } : {}),
  });

  const tools = getRetailTools();

  const stream = createUIMessageStream({
    execute: withInterruptions(
      async ({ writer }) => {
        const result = streamText({
          model: chatModel,
          system:
            "You are a helpful shopping assistant for RetailZero. " +
            "Help customers find products, manage their cart, and answer questions about the store. " +
            `The current user ID is "${userId || "guest"}". ` +
            (userId && userId !== "guest"
              ? `The user is logged in as ${userName || "a registered user"}${userEmail ? ` (${userEmail})` : ""}. ` +
                "They are authenticated and can checkout, edit their profile, and use all features. "
              : "The user is a guest (not logged in). They can browse products and manage a cart, but must log in to checkout. ") +
            "When calling tools that accept a userId parameter, always pass the current user ID — never ask the user for their ID. " +
            "CRITICAL: When a user asks to see products, add to cart, or any action that requires a tool — call the tool IMMEDIATELY. " +
            "Do NOT generate text first saying you will look something up. Do NOT say 'Let me check' or 'I'll look that up' without calling the tool in the same response. " +
            "Always call the tool first, then present the results. Never require the user to send a follow-up message to trigger a tool call. " +
            "After a tool returns results, present them clearly to the user. " +
            "For product searches, list the products with their name, price, category, and rating. " +
            "For cart operations, show the updated cart contents and total. " +
            "CHECKOUT FLOW (two steps — you MUST follow this exact sequence): " +
            "Step 1: Call prepare_checkout FIRST. It returns the cart summary instantly. " +
            "Present the cart summary to the user and tell them: a push notification is being sent to their device and they need to approve it to complete the purchase. " +
            "Step 2: Immediately call checkout_cart in your next step. This triggers the push notification and waits for approval — it may take a while. " +
            "Once checkout_cart returns successfully with an orderId and total, present ONLY the order confirmation (order ID, total). " +
            "Do NOT mention the push notification or approval again at that point — the order is already complete. " +
            "Profile edits are only allowed for the user's own profile — attempting to edit another user's profile will be denied. " +
            "You can also set Google Calendar reminders for upcoming product drops or restocks. " +
            "If the set_calendar_reminder tool fails with an authorization or Token Vault error, " +
            `tell the user they need to connect their Google account first by clicking this link: ${process.env.APP_BASE_URL}/connect/google ` +
            "Once they authorize and return, they can ask you to set the reminder again. " +
            "You can search the user's order history using the search_orders tool. " +
            "Use it to answer questions about past purchases, order totals, items bought, or any order-related queries. " +
            "The search_orders tool uses fine-grained authorization to ensure only the current user's orders are returned.",
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(5),
        });

        await writer.merge(result.toUIMessageStream());
      },
      { messages, tools }
    ),
    onError: errorSerializer(),
  });

  return createUIMessageStreamResponse({ stream });
}
