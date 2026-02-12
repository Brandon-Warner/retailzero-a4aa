"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginRedirect() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";

  useEffect(() => {
    window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, [returnTo]);

  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <p className="text-muted-foreground">Redirecting to login...</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <LoginRedirect />
    </Suspense>
  );
}
