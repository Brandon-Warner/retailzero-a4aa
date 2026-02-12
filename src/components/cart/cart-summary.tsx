"use client";

import Link from "next/link";

interface CartSummaryProps {
  subtotal: number;
  itemCount: number;
  onCheckout: () => void;
  isLoading?: boolean;
  isAuthenticated?: boolean;
}

export function CartSummary({
  subtotal,
  itemCount,
  onCheckout,
  isLoading,
  isAuthenticated = true,
}: CartSummaryProps) {
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="font-semibold text-lg mb-4">Order Summary</h2>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            Subtotal ({itemCount} items)
          </span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax (8%)</span>
          <span>${tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Shipping</span>
          <span className="text-green-600">Free</span>
        </div>
        <hr className="my-2" />
        <div className="flex justify-between font-semibold text-base">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
      {isAuthenticated ? (
        <button
          onClick={onCheckout}
          disabled={isLoading || itemCount === 0}
          className="mt-6 w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Processing..." : "Checkout"}
        </button>
      ) : (
        <Link
          href="/login?returnTo=/cart"
          className="mt-6 w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          Log in to Checkout
        </Link>
      )}
    </div>
  );
}
