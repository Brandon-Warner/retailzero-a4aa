import Link from "next/link";
import { Bot, Shield, Lock } from "lucide-react";

export default function LandingPage() {
  return (
    <main>
      {/* Hero section */}
      <section className="bg-[#191919] text-white py-24 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Shop smarter with{" "}
            <span className="text-[#B49BFC]">RetailZero</span>
          </h1>
          <p className="mt-6 text-lg text-neutral-400 leading-relaxed">
            AI-powered shopping meets enterprise-grade security. Discover
            products through natural conversation, check out with confidence
            using Auth0 CIBA step-up authentication, and enjoy fine-grained
            access controls that keep your data safe.
          </p>
          <Link
            href="/products"
            className="mt-10 inline-flex items-center justify-center rounded-md bg-[#4016A0] px-8 py-3 text-base font-medium text-white shadow hover:bg-[#4016A0]/90 transition-colors"
          >
            Browse Products
          </Link>
        </div>
      </section>

      {/* About section */}
      <section className="bg-white py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold text-center text-[#191919] mb-12">
            About RetailZero
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border p-6 text-center">
              <Bot className="mx-auto h-10 w-10 text-[#4016A0]" />
              <h3 className="mt-4 text-lg font-semibold text-[#191919]">
                AI Shopping Assistant
              </h3>
              <p className="mt-2 text-sm text-neutral-600">
                Discover products through a conversational AI assistant that
                understands what you need and surfaces the best matches.
              </p>
            </div>
            <div className="rounded-lg border p-6 text-center">
              <Shield className="mx-auto h-10 w-10 text-[#4016A0]" />
              <h3 className="mt-4 text-lg font-semibold text-[#191919]">
                Secure Checkout
              </h3>
              <p className="mt-2 text-sm text-neutral-600">
                Complete purchases with CIBA step-up approval, ensuring every
                high-value transaction is verified on a trusted device.
              </p>
            </div>
            <div className="rounded-lg border p-6 text-center">
              <Lock className="mx-auto h-10 w-10 text-[#4016A0]" />
              <h3 className="mt-4 text-lg font-semibold text-[#191919]">
                Fine-Grained Access
              </h3>
              <p className="mt-2 text-sm text-neutral-600">
                FGA role-based controls protect every resource, giving admins
                and shoppers exactly the permissions they need.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
