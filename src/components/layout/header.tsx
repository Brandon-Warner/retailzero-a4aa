"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/provider";
import { getGuestCart } from "@/lib/cart/guest-cart";
import { ShoppingCart, User, LogIn, LogOut, Store, Package } from "lucide-react";

export function Header() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [itemCount, setItemCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (authLoading) return;
    if (isAuthenticated) {
      try {
        const res = await fetch("/api/cart");
        if (res.ok) {
          const cart = await res.json();
          const count = (cart.items || []).reduce(
            (sum: number, item: { quantity: number }) => sum + item.quantity,
            0
          );
          setItemCount(count);
        }
      } catch {
        setItemCount(0);
      }
    } else {
      const items = getGuestCart();
      setItemCount(items.reduce((sum, item) => sum + item.quantity, 0));
    }
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    refreshCount();

    // Listen for storage events (guest cart changes from other tabs)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "guest-cart") refreshCount();
    };
    window.addEventListener("storage", onStorage);

    // Listen for cart-updated events (from AI chat widget syncing localStorage)
    const onCartUpdated = () => refreshCount();
    window.addEventListener("cart-updated", onCartUpdated);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("cart-updated", onCartUpdated);
    };
  }, [refreshCount]);

  return (
    <header className="border-b border-[#2a2a2a] bg-[#191919] text-neutral-100">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <Store className="h-6 w-6 text-[#B49BFC]" />
          <span>
            Retail<span className="text-[#B49BFC]">Zero</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/products"
            className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
          >
            Products
          </Link>
          <Link
            href="/cart"
            className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1 relative"
          >
            <ShoppingCart className="h-4 w-4" />
            Cart
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B49BFC] px-1 text-[10px] font-bold text-black">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </Link>
          {isAuthenticated ? (
            <>
              <Link
                href="/orders"
                className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <Package className="h-4 w-4" />
                Orders
              </Link>
              <Link
                href="/account"
                className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <User className="h-4 w-4" />
                {user?.name || "Account"}
              </Link>
              <button
                onClick={() => logout()}
                className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <LogIn className="h-4 w-4" />
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
