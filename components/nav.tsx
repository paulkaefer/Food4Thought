import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
        <Link href="/" className="font-semibold">
          🥑 Food4Thought
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/scan">Scan</Link>
          <Link href="/profile">Profile</Link>
        </nav>
      </div>
    </header>
  );
}
