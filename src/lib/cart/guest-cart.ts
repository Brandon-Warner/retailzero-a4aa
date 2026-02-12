export interface GuestCartItem {
  productId: string;
  quantity: number;
  addedAt: string;
}

const STORAGE_KEY = "guest-cart";

/** Dispatch a custom event so components (e.g. header badge) can react to cart changes. */
function notifyCartChange() {
  window.dispatchEvent(new Event("cart-updated"));
}

export function getGuestCart(): GuestCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addGuestCartItem(
  productId: string,
  quantity: number
): GuestCartItem[] {
  const items = getGuestCart();
  const existing = items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({ productId, quantity, addedAt: new Date().toISOString() });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notifyCartChange();
  return items;
}

export function removeGuestCartItem(productId: string): GuestCartItem[] {
  const items = getGuestCart().filter((i) => i.productId !== productId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notifyCartChange();
  return items;
}

export function clearGuestCart(): void {
  localStorage.removeItem(STORAGE_KEY);
  notifyCartChange();
}
