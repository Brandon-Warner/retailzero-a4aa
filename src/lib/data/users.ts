import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");

export interface UserAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface UserPreferences {
  newsletter: boolean;
  theme: "light" | "dark";
}

export interface User {
  id: string;
  email: string;
  name: string;
  address: UserAddress;
  preferences: UserPreferences;
}

function readUsers(): User[] {
  const raw = fs.readFileSync(path.join(dataDir, "users.json"), "utf-8");
  return JSON.parse(raw);
}

function writeUsers(users: User[]): void {
  fs.writeFileSync(
    path.join(dataDir, "users.json"),
    JSON.stringify(users, null, 2)
  );
}

export function getUser(id: string): User | undefined {
  return readUsers().find((u) => u.id === id);
}

export function getUserByEmail(email: string): User | undefined {
  return readUsers().find((u) => u.email === email);
}

export function createUser(id: string, email: string, name: string): User {
  const users = readUsers();
  const user: User = {
    id,
    email,
    name,
    address: { street: "", city: "", state: "", zip: "" },
    preferences: { newsletter: false, theme: "light" },
  };
  users.push(user);
  writeUsers(users);
  return user;
}

export function updateUser(
  id: string,
  attrs: Partial<Omit<User, "id">>
): User | undefined {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return undefined;
  users[index] = { ...users[index], ...attrs };
  writeUsers(users);
  return users[index];
}
