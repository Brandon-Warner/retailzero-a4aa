"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Calendar, AlertCircle } from "lucide-react";

function ConnectContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121212] px-4">
      <div className="max-w-md w-full rounded-lg border border-[#2a2a2a] bg-[#191919] p-8 text-center">
        <Calendar className="h-12 w-12 mx-auto text-[#B49BFC] mb-4" />
        <h1 className="text-xl font-bold text-neutral-100 mb-2">
          Connect Google Calendar
        </h1>
        <p className="text-sm text-neutral-400 mb-6">
          To set calendar reminders for product drops, RetailZero needs access
          to your Google Calendar. This will allow the shopping assistant to
          create events on your behalf.
        </p>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 mb-6 flex items-start gap-2 text-left">
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">
              {error === "failed_to_initiate"
                ? "Could not initiate the account connection. Make sure Connected Accounts is enabled for the google-oauth2 connection in Auth0 and that the My Account API is configured."
                : `Connection failed: ${error}`}
            </p>
          </div>
        )}

        <a
          href="/api/auth/connect/google"
          className="inline-flex items-center justify-center rounded-md bg-[#B49BFC] px-6 py-2.5 text-sm font-medium text-black hover:bg-[#c9b5fd] transition-colors"
        >
          Connect Google Account
        </a>

        <p className="text-xs text-neutral-500 mt-4">
          You will be redirected to Google to authorize calendar access.
        </p>

        <Link
          href="/"
          className="block text-xs text-neutral-500 hover:text-neutral-300 mt-6 transition-colors"
        >
          Back to store
        </Link>
      </div>
    </div>
  );
}

export default function ConnectGooglePage() {
  return (
    <Suspense>
      <ConnectContent />
    </Suspense>
  );
}
