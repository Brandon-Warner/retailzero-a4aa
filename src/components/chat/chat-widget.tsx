"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { MessageCircle, X, Send, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useInterruptions } from "@auth0/ai-vercel/react";
import { useAuth } from "@/lib/auth/provider";
import { getGuestCart, addGuestCartItem } from "@/lib/cart/guest-cart";
import { mutate } from "swr";

const CHAT_STORAGE_KEY = "retailzero-chat";

function loadMessages(): UIMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    const backup = localStorage.getItem(CHAT_STORAGE_KEY + '_backup');

    // If we have a backup, check if it's more recent or if main is empty
    if (backup) {
      const backupMessages = JSON.parse(backup);
      if (!raw) {
        // Main storage is empty, restore from backup
        localStorage.setItem(CHAT_STORAGE_KEY, backup);
        localStorage.removeItem(CHAT_STORAGE_KEY + '_backup');
        return backupMessages;
      }

      const mainMessages = JSON.parse(raw);
      // If backup has more messages, use it (likely saved during redirect)
      if (backupMessages.length > mainMessages.length) {
        localStorage.setItem(CHAT_STORAGE_KEY, backup);
        localStorage.removeItem(CHAT_STORAGE_KEY + '_backup');
        return backupMessages;
      }

      // Main is good, clean up backup
      localStorage.removeItem(CHAT_STORAGE_KEY + '_backup');
      return mainMessages;
    }

    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: UIMessage[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // storage full or unavailable
  }
}

export function clearChatHistory() {
  localStorage.removeItem(CHAT_STORAGE_KEY);
}

/** Render text with clickable links and markdown formatting. */
function TextWithLinks({ text }: { text: string }) {
  // First split by links
  const linkSplitRegex = /(https?:\/\/[^\s)]+|\/(?:api|connect)\/[^\s)]+)/g;
  const linkTestRegex = /^(?:https?:\/\/|\/(?:api|connect)\/)/;
  const parts = text.split(linkSplitRegex);

  return (
    <>
      {parts.map((part, i) => {
        // Handle links
        if (linkTestRegex.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target={part.startsWith("/") ? "_self" : "_blank"}
              rel="noopener noreferrer"
              className="underline text-[#B49BFC] hover:text-[#c9b5fd]"
            >
              {part}
            </a>
          );
        }

        // Handle markdown formatting in non-link text
        return <MarkdownText key={i} text={part} />;
      })}
    </>
  );
}

/** Parse and render basic markdown formatting (bold, italic, code). */
function MarkdownText({ text }: { text: string }) {
  const elements: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Match bold (**text** or __text__)
    const boldMatch = remaining.match(/^(\*\*|__)(.*?)\1/);
    if (boldMatch) {
      elements.push(<strong key={key++}>{boldMatch[2]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Match italic (*text* or _text_)
    const italicMatch = remaining.match(/^(\*|_)(.*?)\1/);
    if (italicMatch) {
      elements.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Match inline code (`text`)
    const codeMatch = remaining.match(/^`(.*?)`/);
    if (codeMatch) {
      elements.push(
        <code key={key++} className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // No match, consume one character
    const nextSpecial = remaining.search(/[\*_`]/);
    if (nextSpecial === -1) {
      // No more special characters, add the rest
      elements.push(<span key={key++}>{remaining}</span>);
      break;
    } else if (nextSpecial > 0) {
      // Add text before the next special character
      elements.push(<span key={key++}>{remaining.slice(0, nextSpecial)}</span>);
      remaining = remaining.slice(nextSpecial);
    } else {
      // Special character but no match, consume it as plain text
      elements.push(<span key={key++}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    }
  }

  return <>{elements}</>;
}

// ---------------------------------------------------------------------------
// Helpers to classify Auth0 AI interrupts by their `code` field
// ---------------------------------------------------------------------------

type InterruptType = "ciba_pending" | "ciba_expired" | "ciba_denied" | "fga_denied" | "token_vault" | "unknown";

function classifyInterrupt(interrupt: any): InterruptType {
  const code: string = interrupt?.code ?? "";

  // CIBA / Async Authorization interrupts
  if (code.startsWith("ASYNC_AUTHORIZATION_")) {
    if (code === "ASYNC_AUTHORIZATION_AUTHORIZATION_PENDING" ||
        code === "ASYNC_AUTHORIZATION_AUTHORIZATION_POLLING_ERROR") {
      return "ciba_pending";
    }
    if (code === "ASYNC_AUTHORIZATION_AUTHORIZATION_REQUEST_EXPIRED" ||
        code === "ASYNC_AUTHORIZATION_INVALID_GRANT") {
      return "ciba_expired";
    }
    if (code === "ASYNC_AUTHORIZATION_ACCESS_DENIED") {
      return "ciba_denied";
    }
    // Any other ASYNC_AUTHORIZATION code — treat as pending
    return "ciba_pending";
  }

  // FGA interrupts
  if (code.startsWith("FGA_") || code === "UNAUTHORIZED") {
    return "fga_denied";
  }

  // Token Vault interrupts
  if (code.startsWith("TOKEN_VAULT_") || code.startsWith("FEDERATED_CONNECTION_")) {
    return "token_vault";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Render completed tool results so the user always gets feedback,
// even when the model doesn't generate follow-up text.
// ---------------------------------------------------------------------------

function ToolResultDisplay({
  toolName,
  output,
  onAddToCart
}: {
  toolName: string;
  output: any;
  onAddToCart?: (productId: string) => void;
}) {
  if (!output || output.error) {
    return output?.error ? (
      <p className="text-xs text-red-500 mt-1">{output.error}</p>
    ) : null;
  }

  if (toolName === "add_to_cart" || toolName === "view_cart") {
    const items = output.items as {
      productName: string;
      quantity: number;
      subtotal: number;
    }[];
    if (!items?.length) {
      return <p className="text-xs text-muted-foreground mt-1">Your cart is empty.</p>;
    }
    return (
      <div className="mt-1 text-xs space-y-0.5">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span>{item.productName} x{item.quantity}</span>
            <span>${item.subtotal.toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold border-t border-current/10 pt-0.5 mt-1">
          <span>Total</span>
          <span>${(output.total as number).toFixed(2)}</span>
        </div>
      </div>
    );
  }

  if (toolName === "show_products") {
    const products = output as {
      id: string;
      name: string;
      price: number;
      category: string;
      rating: number;
      stock?: number;
      image?: string;
      description?: string;
    }[];
    if (!products?.length) {
      return <p className="text-xs text-muted-foreground mt-1">No products found.</p>;
    }

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    };

    useEffect(() => {
      checkScroll();
      const container = scrollContainerRef.current;
      if (container) {
        container.addEventListener('scroll', checkScroll);
        return () => container.removeEventListener('scroll', checkScroll);
      }
    }, []);

    const scroll = (direction: 'left' | 'right') => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollAmount = 200; // Scroll by ~1 card width
      const newScrollLeft = direction === 'left'
        ? container.scrollLeft - scrollAmount
        : container.scrollLeft + scrollAmount;

      container.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    };

    return (
      <div className="mt-2 -mx-1 relative group">
        {/* Left Arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/90 border shadow-md flex items-center justify-center hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Right Arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/90 border shadow-md flex items-center justify-center hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        <div
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-thin"
        >
          {products.map((p) => (
            <div
              key={p.id}
              className="flex-shrink-0 w-48 rounded-lg border bg-card shadow-sm overflow-hidden"
            >
              {/* Product Image */}
              <div className="aspect-square bg-muted flex items-center justify-center">
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">No image</span>
                )}
              </div>

              {/* Product Info */}
              <div className="p-3 space-y-2">
                <div>
                  <h4 className="font-semibold text-xs line-clamp-2">{p.name}</h4>
                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border bg-muted">
                    {p.category}
                  </span>
                </div>

                {p.description && (
                  <p className="text-[10px] text-muted-foreground line-clamp-2">
                    {p.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">${p.price.toFixed(2)}</span>
                  {p.stock !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      {p.stock > 0 ? `${p.stock} left` : "Out of stock"}
                    </span>
                  )}
                </div>

                {/* Add to Cart Button */}
                <button
                  onClick={() => onAddToCart?.(p.id)}
                  disabled={p.stock === 0 || !onAddToCart}
                  className="w-full py-1.5 px-2 text-[10px] font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {p.stock === 0 ? "Out of Stock" : "Add to Cart"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (toolName === "redirect_to_login" || toolName === "redirect_to_google_connect") {
    const [popupOpened, setPopupOpened] = useState(false);

    useEffect(() => {
      if (output.redirect && output.url && !popupOpened) {
        setPopupOpened(true);

        // Open in popup if specified
        if (output.popup) {
          const width = 600;
          const height = 700;
          const left = window.screen.width / 2 - width / 2;
          const top = window.screen.height / 2 - height / 2;
          const popup = window.open(
            output.url,
            'google-oauth',
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
          );

          if (popup) {
            // Listen for OAuth completion message from popup
            const handleMessage = (event: MessageEvent) => {
              if (event.data?.type === 'oauth-success') {
                popup.close();
                window.removeEventListener('message', handleMessage);

                // Refresh auth state without page reload
                // This triggers SWR to re-fetch user data
                mutate('/api/auth/me');

                // Dispatch event to notify other components
                window.dispatchEvent(new Event('auth-updated'));
              }
            };
            window.addEventListener('message', handleMessage);

            // Check if popup was closed manually
            const checkClosed = setInterval(() => {
              if (popup.closed) {
                clearInterval(checkClosed);
                window.removeEventListener('message', handleMessage);
              }
            }, 500);
          } else {
            // Popup blocked, fall back to redirect
            setTimeout(() => {
              window.location.href = output.url;
            }, 1000);
          }
        } else {
          // Full page redirect
          setTimeout(() => {
            window.location.href = output.url;
          }, 1000);
        }
      }
    }, [output, popupOpened]);

    return (
      <div className="mt-1 text-xs">
        <p className="text-muted-foreground">{output.message || "Redirecting..."}</p>
      </div>
    );
  }

  if (toolName === "get_product_details") {
    return (
      <div className="mt-1 text-xs">
        <p className="font-semibold">{output.name} — ${output.price?.toFixed(2)}</p>
        <p className="text-muted-foreground">{output.description}</p>
      </div>
    );
  }

  if (toolName === "checkout_cart") {
    return (
      <div className="mt-1 text-xs">
        <p className="font-semibold text-green-600">Order confirmed!</p>
        <p>Order ID: {output.orderId}</p>
        <p>Total: ${output.total?.toFixed(2)}</p>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Chat panel — only mounted when the widget is open, so the heavy hooks
// (useChat, useInterruptions, SWR auth fetch) don't block the toggle button.
// ---------------------------------------------------------------------------

function ChatPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [input, setInput] = useState("");

  const initialMessages = useMemo(() => loadMessages(), []);

  const {
    messages,
    sendMessage,
    status,
    toolInterrupt,
  } = useInterruptions((errorHandler) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useChat({
      messages: initialMessages,
      onError: errorHandler((err) => {
        console.error("Chat error:", err);
      }),
    })
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const syncedToolCalls = useRef<Set<string>>(new Set());
  const isLoading = status === "streaming" || status === "submitted";

  // Persist messages whenever they change and we're not mid-stream
  useEffect(() => {
    if (status === "ready" && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages, status]);

  // Force-save messages when redirect tools are detected (even if streaming)
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        const p = part as any;
        if (!("toolName" in p)) continue;
        const toolName: string = p.toolName ?? "";

        // If a redirect tool is called, immediately save messages
        if (
          toolName === "redirect_to_login" ||
          toolName === "redirect_to_google_connect"
        ) {
          if (p.state === "output-available" && p.output?.redirect) {
            saveMessages(messages);
            // Also create a backup
            try {
              localStorage.setItem(CHAT_STORAGE_KEY + '_backup', JSON.stringify(messages));
            } catch {
              // storage full or unavailable
            }
          }
        }
      }
    }
  }, [messages]);

  // Sync tool results: when a cart-modifying tool call completes, update the UI.
  // For guests: write to localStorage. For all users: dispatch cart-updated
  // so the header badge refreshes.
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        const p = part as any;
        if (!("toolName" in p) || p.state !== "output-available" || !p.toolCallId) continue;
        if (syncedToolCalls.current.has(p.toolCallId)) continue;

        const toolName: string = p.toolName ?? "";

        // Guest cart sync: write add_to_cart results to localStorage
        if (!user?.id && toolName === "add_to_cart") {
          const input = p.input as { productId?: string; quantity?: number };
          if (input?.productId) {
            addGuestCartItem(input.productId, input.quantity ?? 1);
            syncedToolCalls.current.add(p.toolCallId);
            window.dispatchEvent(new Event("cart-updated"));
          }
        }

        // Authenticated cart changes: notify header to re-fetch badge count
        if (user?.id && (toolName === "add_to_cart" || toolName === "checkout_cart")) {
          syncedToolCalls.current.add(p.toolCallId);
          window.dispatchEvent(new Event("cart-updated"));
        }
      }
    }
  }, [messages, status, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    // Pass fresh user info and guest cart at send time (not from stale hook config)
    const body: Record<string, unknown> = {
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
    };
    if (!user?.id) {
      body.guestCart = getGuestCart();
    }
    await sendMessage({ text }, { body });
  };

  const handleAddToCart = async (productId: string) => {
    if (isLoading) return;
    const text = `Add product ${productId} to my cart`;
    const body: Record<string, unknown> = {
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
    };
    if (!user?.id) {
      body.guestCart = getGuestCart();
    }
    await sendMessage({ text }, { body });
  };

  const interruptType: InterruptType | null = toolInterrupt
    ? classifyInterrupt(toolInterrupt)
    : null;

  return (
    <div className="fixed bottom-24 right-6 z-50 w-[48rem] h-[650px] rounded-lg border bg-background shadow-xl flex flex-col">
      <div className="flex items-center justify-between px-6 py-5 border-b">
        <h3 className="font-semibold">Zero</h3>
        <div className="flex items-center gap-3">
          {/* Authentication Status */}
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${user?.id ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-xs text-muted-foreground">
              {user?.id ? user.name || 'Authenticated' : 'Guest'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Hi! How can I help you today?
          </p>
        )}
        {messages.map((msg) => {
          return (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {/* Render text parts first */}
                {msg.parts.map((part, i) => {
                  if (part.type === "text") {
                    return <TextWithLinks key={`text-${i}`} text={part.text} />;
                  }
                  return null;
                })}

                {/* Then render tool results */}
                {msg.parts.map((part, i) => {
                  if (part.type === "text") return null;

                  const p = part as any;
                  // Extract tool name from type (e.g., "tool-show_products" -> "show_products")
                  const toolName = p.type?.startsWith('tool-')
                    ? p.type.substring(5)
                    : p.toolName;

                  // Show a waiting message while checkout_cart is executing (CIBA polling)
                  if (
                    msg.role === "assistant" &&
                    toolName === "checkout_cart" &&
                    (p.state === "input-available" || p.state === "input-streaming")
                  ) {
                    return (
                      <div key={`tool-${i}`} className="mt-1 text-xs space-y-1">
                        <p className="font-medium">A push notification has been sent to your device.</p>
                        <p className="text-muted-foreground">Please approve it to complete your purchase.</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span className="text-muted-foreground">Waiting for approval…</span>
                        </div>
                      </div>
                    );
                  }
                  // Render completed tool results
                  if (
                    msg.role === "assistant" &&
                    toolName &&
                    "state" in part &&
                    p.state === "output-available" &&
                    p.output
                  ) {
                    return (
                      <ToolResultDisplay
                        key={`tool-${i}`}
                        toolName={toolName}
                        output={p.output}
                        onAddToCart={handleAddToCart}
                      />
                    );
                  }
                  return null;
                })}
              {msg.parts.every(
                (p) =>
                  p.type !== "text" &&
                  !("state" in p && (p as any).state === "output-available")
              ) &&
                isLoading &&
                msg.role === "assistant" && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                  </span>
                )}
            </div>
          </div>
          );
        })}

        {/* Auth0 AI interruption — CIBA (pending device approval) */}
        {toolInterrupt && interruptType === "ciba_pending" && (
          <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm">
            <p className="font-medium text-blue-800">
              Purchase approval required
            </p>
            <p className="mt-1 text-blue-700">
              A purchase approval request has been sent to your device.
              Please approve to continue.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-xs text-blue-600">
                Waiting for approval...
              </span>
            </div>
          </div>
        )}

        {/* Auth0 AI interruption — CIBA (expired) */}
        {toolInterrupt && interruptType === "ciba_expired" && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-800">
              Approval expired
            </p>
            <p className="mt-1 text-red-700">
              The purchase approval request was not completed in time.
              Please try checking out again.
            </p>
            <button
              onClick={() => toolInterrupt.resume()}
              className="mt-2 inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* Auth0 AI interruption — CIBA (denied) */}
        {toolInterrupt && interruptType === "ciba_denied" && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-800">
              Purchase denied
            </p>
            <p className="mt-1 text-red-700">
              The purchase was denied on your device.
            </p>
          </div>
        )}

        {/* Auth0 AI interruption — FGA (unauthorized) */}
        {toolInterrupt && interruptType === "fga_denied" && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-800">
              Access denied
            </p>
            <p className="mt-1 text-red-700">
              You do not have permission to perform this action. Profile
              edits are only allowed for your own profile.
            </p>
          </div>
        )}

        {/* Auth0 AI interruption — Token Vault (account connection) */}
        {toolInterrupt && interruptType === "token_vault" && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm">
            <p className="font-medium text-yellow-800">
              Authorization required
            </p>
            <p className="mt-1 text-yellow-700">
              This action requires you to connect your account.
            </p>
            <button
              onClick={() => toolInterrupt.resume()}
              className="mt-2 inline-flex items-center rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-700"
            >
              Connect &amp; Continue
            </button>
          </div>
        )}

        {/* Auth0 AI interruption — unknown / fallback */}
        {toolInterrupt && interruptType === "unknown" && (
          <div className="rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-800">
              Action required
            </p>
            <p className="mt-1 text-gray-700">
              {toolInterrupt.message || "Additional authorization is needed to complete this action."}
            </p>
            <button
              onClick={() => toolInterrupt.resume()}
              className="mt-2 inline-flex items-center rounded-md bg-gray-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
            >
              Continue
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="px-6 py-5 border-t">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            className="flex-1 h-12 rounded-md border border-input bg-background px-4 py-3 text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-12 w-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle button — no hooks other than useState, renders immediately.
// ---------------------------------------------------------------------------

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>

      {isOpen && <ChatPanel onClose={() => setIsOpen(false)} />}
    </>
  );
}
