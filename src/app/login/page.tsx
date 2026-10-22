import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth-screen";

export const metadata: Metadata = { title: "Log in | Enicharet" };

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
