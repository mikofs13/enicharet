import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth-screen";

export const metadata: Metadata = { title: "Create account | Enicharet" };

export default function RegisterPage() {
  return <AuthScreen mode="register" />;
}
