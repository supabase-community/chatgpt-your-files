import { PropsWithChildren } from "react";

export default async function ChatLayout({ children }: PropsWithChildren) {
  // Keep cookies in the JS execution context for Next.js build

  return <>{children}</>;
}
