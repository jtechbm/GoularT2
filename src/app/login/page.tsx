import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  const hasUsers = Boolean(one<{ n: number }>("SELECT COUNT(*) n FROM users")?.n);
  return <LoginForm hasUsers={hasUsers} />;
}
