import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/accounts/auth";

export const { GET, POST } = toNextJsHandler(auth);
