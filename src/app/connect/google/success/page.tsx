"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

export default function ConnectGoogleSuccessPage() {
  const [isPopup, setIsPopup] = useState(false);

  useEffect(() => {
    // Check if this page was opened as a popup
    const openedAsPopup = window.opener && window.opener !== window;
    setIsPopup(openedAsPopup);

    if (openedAsPopup) {
      // Notify the parent window that OAuth succeeded
      window.opener.postMessage(
        { type: 'oauth-success', provider: 'google' },
        window.location.origin
      );

      // Close the popup after a brief delay
      setTimeout(() => {
        window.close();
      }, 1000);
    }
  }, []);

  // If opened as popup, show closing message
  if (isPopup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212] px-4">
        <div className="max-w-md w-full rounded-lg border border-[#2a2a2a] bg-[#191919] p-8 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
          <h1 className="text-xl font-bold text-neutral-100 mb-2">
            Google Calendar Connected
          </h1>
          <p className="text-sm text-neutral-400">
            Returning to your conversation...
          </p>
        </div>
      </div>
    );
  }

  // If opened as full page (fallback), show link to return
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121212] px-4">
      <div className="max-w-md w-full rounded-lg border border-[#2a2a2a] bg-[#191919] p-8 text-center">
        <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
        <h1 className="text-xl font-bold text-neutral-100 mb-2">
          Google Calendar Connected
        </h1>
        <p className="text-sm text-neutral-400 mb-6">
          Your Google account has been linked. You can now ask the shopping
          assistant to set calendar reminders for product drops and restocks.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-[#B49BFC] px-6 py-2.5 text-sm font-medium text-black hover:bg-[#c9b5fd] transition-colors"
        >
          Back to Store
        </Link>
      </div>
    </div>
  );
}
