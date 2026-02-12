"use client";

import { useState } from "react";

interface ProfileData {
  name: string;
  email: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  preferences: {
    newsletter: boolean;
    theme: "light" | "dark";
  };
}

interface ProfileFormProps {
  initialData: ProfileData;
  onSave: (data: Partial<ProfileData>) => Promise<void>;
}

export function ProfileForm({ initialData, onSave }: ProfileFormProps) {
  const [form, setForm] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await onSave({
        name: form.name,
        address: form.address,
        preferences: form.preferences,
      });
      setMessage("Profile updated successfully.");
    } catch {
      setMessage("Failed to update profile.");
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div>
        <label className="text-sm font-medium">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Email</label>
        <input
          type="email"
          value={form.email}
          disabled
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Address</legend>
        <input
          type="text"
          placeholder="Street"
          value={form.address.street}
          onChange={(e) =>
            setForm({
              ...form,
              address: { ...form.address, street: e.target.value },
            })
          }
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="City"
            value={form.address.city}
            onChange={(e) =>
              setForm({
                ...form,
                address: { ...form.address, city: e.target.value },
              })
            }
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="State"
            value={form.address.state}
            onChange={(e) =>
              setForm({
                ...form,
                address: { ...form.address, state: e.target.value },
              })
            }
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="ZIP"
            value={form.address.zip}
            onChange={(e) =>
              setForm({
                ...form,
                address: { ...form.address, zip: e.target.value },
              })
            }
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="newsletter"
          checked={form.preferences.newsletter}
          onChange={(e) =>
            setForm({
              ...form,
              preferences: { ...form.preferences, newsletter: e.target.checked },
            })
          }
          className="h-4 w-4"
        />
        <label htmlFor="newsletter" className="text-sm">
          Subscribe to newsletter
        </label>
      </div>

      {message && (
        <p
          className={`text-sm ${
            message.includes("success")
              ? "text-green-600"
              : "text-destructive"
          }`}
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
