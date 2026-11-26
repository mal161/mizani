import { PublicShell } from "@/components/shell/PublicShell";

/** Public-service shell: utility strip, masthead, footer (DESIGN.md). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
