import Image from "next/image";
import Link from "next/link";
import { navigation } from "@/config/navigation";

const linkClass =
  "block rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white";

export default function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-72 shrink-0 bg-[var(--ph-green-dark)] text-white lg:flex lg:flex-col">
      <div className="bg-white px-5 py-5">
        <Image
          src="/logo-palmenheld.png"
          alt="Palmenheld"
          width={230}
          height={130}
          priority
          className="h-auto w-full"
        />
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) =>
          "href" in item ? (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ) : (
            <details key={item.label} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white">
                <span>{item.label}</span>
                <span
                  aria-hidden="true"
                  className="text-xs transition-transform group-open:rotate-180"
                >
                  ▼
                </span>
              </summary>
              <div className="ml-3 mt-1 space-y-1 border-l border-white/20 pl-3">
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className="block rounded-xl px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </details>
          )
        )}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl bg-white/5 px-4 py-3">
          <div className="font-semibold">Palmenheld GmbH</div>
          <div className="text-sm text-white/70">Nordkirchen</div>
        </div>
      </div>
    </aside>
  );
}
