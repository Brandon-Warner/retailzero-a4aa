"use client";

import { useEffect, useState } from "react";
import { ProfileForm } from "@/components/account/profile-form";

interface UserData {
  id: string;
  email: string;
  name: string;
  address: { street: string; city: string; state: string; zip: string };
  preferences: { newsletter: boolean; theme: "light" | "dark" };
}

export default function AccountPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (data: Partial<UserData>) => {
    const res = await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to save");
    const updated = await res.json();
    setUser(updated);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-destructive">Could not load profile.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">My Account</h1>
      <ProfileForm initialData={user} onSave={handleSave} />
    </div>
  );
}
