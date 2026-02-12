"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth/provider";
import { CartItem } from "@/components/cart/cart-item";
import { CartSummary } from "@/components/cart/cart-summary";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import {
  getGuestCart,
  removeGuestCartItem,
  clearGuestCart,
} from "@/lib/cart/guest-cart";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  stock: number;
  rating: number;
}

interface CartData {
  items: { productId: string; quantity: number; addedAt: string }[];
  updatedAt: string;
}

export default function CartPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [cart, setCart] = useState<CartData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    orderId: string;
    total: number;
  } | null>(null);

  const loadGuestCart = useCallback(async () => {
    const guestItems = getGuestCart();
    const productsData = await fetch("/api/products").then((r) => r.json());
    setCart({
      items: guestItems,
      updatedAt: new Date().toISOString(),
    });
    setProducts(productsData);
  }, []);

  const loadServerCart = useCallback(async () => {
    const [cartData, productsData] = await Promise.all([
      fetch("/api/cart").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]);
    setCart(cartData);
    setProducts(productsData);
  }, []);

  const reloadCart = useCallback(async () => {
    if (isAuthenticated) {
      await loadServerCart();
    } else {
      await loadGuestCart();
    }
  }, [isAuthenticated, loadServerCart, loadGuestCart]);

  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      try {
        if (isAuthenticated) {
          // Merge any guest cart items into server cart first
          const guestItems = getGuestCart();
          if (guestItems.length > 0) {
            await fetch("/api/cart", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "merge", items: guestItems }),
            });
            clearGuestCart();
          }
          await loadServerCart();
        } else {
          await loadGuestCart();
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isAuthenticated, authLoading, loadServerCart, loadGuestCart]);

  // Re-fetch cart when the AI chat widget modifies it
  useEffect(() => {
    const onCartUpdated = () => reloadCart();
    window.addEventListener("cart-updated", onCartUpdated);
    return () => window.removeEventListener("cart-updated", onCartUpdated);
  }, [reloadCart]);

  const handleRemove = async (productId: string) => {
    if (isAuthenticated) {
      await fetch(`/api/cart?productId=${productId}`, { method: "DELETE" });
      const res = await fetch("/api/cart");
      setCart(await res.json());
    } else {
      const updated = removeGuestCartItem(productId);
      setCart({ items: updated, updatedAt: new Date().toISOString() });
    }
    window.dispatchEvent(new Event("cart-updated"));
  };

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      window.location.href = "/login?returnTo=/cart";
      return;
    }
    setCheckingOut(true);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout" }),
      });
      const result = await res.json();
      if (result.orderId) {
        setOrderResult(result);
        setCart({ items: [], updatedAt: new Date().toISOString() });
        window.dispatchEvent(new Event("cart-updated"));
      }
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (orderResult) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-green-600">
          Order Confirmed!
        </h1>
        <p className="mt-2 text-muted-foreground">
          Order ID: {orderResult.orderId}
        </p>
        <p className="mt-1 text-lg font-semibold">
          Total: ${orderResult.total.toFixed(2)}
        </p>
        <Link
          href="/products"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  const cartItems = (cart?.items || []).map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return { ...item, product };
  });

  const subtotal = cartItems.reduce((sum, item) => {
    return sum + (item.product?.price || 0) * item.quantity;
  }, 0);

  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Your Cart</h1>
      {cartItems.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground mt-4">Your cart is empty.</p>
          <Link
            href="/products"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {cartItems.map(
              (item) =>
                item.product && (
                  <CartItem
                    key={item.productId}
                    product={item.product}
                    quantity={item.quantity}
                    onRemove={handleRemove}
                  />
                )
            )}
          </div>
          <CartSummary
            subtotal={subtotal}
            itemCount={itemCount}
            onCheckout={handleCheckout}
            isLoading={checkingOut}
            isAuthenticated={isAuthenticated}
          />
        </div>
      )}
    </div>
  );
}
